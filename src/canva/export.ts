import axios from 'axios';
import { getAccessToken } from './auth';

const EXPORTS_URL = 'https://api.canva.com/rest/v1/exports';

/**
 * ジョブは非同期。応答しないまま待ち続けないよう上限を置く。
 * 実測では 173 ページの PDF で 45 秒前後かかったので、その 4 倍を上限にしている
 * （ページが増えるほど伸びる。上限に当たること自体が異常として扱える幅を取る）。
 */
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180 * 1000;

export type ExportJobStatus = 'in_progress' | 'success' | 'failed';

interface ExportJob {
  id: string;
  status: ExportJobStatus;
  urls?: string[];
  error?: { code: string; message: string };
}

interface ExportJobResponse {
  job: ExportJob;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function canvaRequest<T>(method: 'get' | 'post', url: string, data?: unknown): Promise<T> {
  const token = await getAccessToken();
  const response = await axios.request<T>({
    method,
    url,
    data,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Canva API がエラーを返しました (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

/**
 * エクスポートジョブの完了を待つ。
 * 待ち時間を超えたら、ジョブ自体は Canva 側で進み続けるが呼び出し側は諦める。
 */
async function waitForJob(jobId: string): Promise<ExportJob> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const { job } = await canvaRequest<ExportJobResponse>('get', `${EXPORTS_URL}/${jobId}`);
    if (job.status === 'success') return job;
    if (job.status === 'failed') {
      const detail = job.error ? `${job.error.code}: ${job.error.message}` : '理由不明';
      throw new Error(`Canva のエクスポートが失敗しました（${detail}）`);
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      throw new Error(`Canva のエクスポートが ${POLL_TIMEOUT_MS / 1000} 秒以内に終わりませんでした`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * デザインを PDF にして中身を返す。
 *
 * ダウンロード URL は 24 時間で失効するので保持せず、必要になるたびにここを通す。
 * `export_quality` を指定しないのは、手元で読む用途に `pro` の画質が要らないため
 * （`pro` は Canva 側で対応ライセンスも要求する）。
 */
export async function exportDesignAsPdf(
  designId: string,
  options: { pages?: readonly number[] } = {},
): Promise<Buffer> {
  // pages を省くと全ページが出る。Canva の「非表示」はエクスポートに反映されないため、
  // 表示中のページだけが欲しい場合は呼び出し側でページ番号を渡す必要がある。
  const format = options.pages && options.pages.length > 0
    ? { type: 'pdf', pages: [...options.pages] }
    : { type: 'pdf' };

  const { job } = await canvaRequest<ExportJobResponse>('post', EXPORTS_URL, {
    design_id: designId,
    format,
  });

  const finished = await waitForJob(job.id);
  const url = finished.urls?.[0];
  if (url === undefined) throw new Error('Canva がダウンロード URL を返しませんでした');

  // ダウンロード URL は署名付きで、認証ヘッダを付けずに取得する
  const download = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });
  if (download.status !== 200) {
    throw new Error(`PDF のダウンロードに失敗しました (HTTP ${download.status})`);
  }
  return Buffer.from(download.data);
}
