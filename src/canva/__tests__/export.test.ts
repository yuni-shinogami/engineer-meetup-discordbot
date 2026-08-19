import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  get: vi.fn(),
  getAccessToken: vi.fn(async () => 'access-token'),
}));

vi.mock('axios', () => ({ default: { request: mocks.request, get: mocks.get } }));
vi.mock('../auth', () => ({ getAccessToken: mocks.getAccessToken }));

import { exportDesignAsPdf } from '../export';

const job = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status: 200, data: { job: { id: 'job-1', status, ...extra } } });

const pdfBytes = () => ({ status: 200, data: Buffer.from('%PDF-1.7 body') });

describe('exportDesignAsPdf', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.get.mockReset();
    vi.useRealTimers();
  });

  it('PDF 形式でジョブを作り、完了後の URL から中身を取る', async () => {
    mocks.request
      .mockResolvedValueOnce(job('in_progress'))
      .mockResolvedValueOnce(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    const pdf = await exportDesignAsPdf('DAG123');

    const body = mocks.request.mock.calls[0]![0] as { data: { design_id: string; format: unknown } };
    expect(body.data.design_id).toBe('DAG123');
    expect(body.data.format).toEqual({ type: 'pdf' });
    expect(mocks.get.mock.calls[0]![0]).toBe('https://export.example/a.pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('ページを指定すると format.pages に載せる', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    await exportDesignAsPdf('DAG123', { pages: [3, 4, 5] });

    const body = mocks.request.mock.calls[0]![0] as { data: { format: unknown } };
    expect(body.data.format).toEqual({ type: 'pdf', pages: [3, 4, 5] });
  });

  it('空のページ指定は全ページ扱いにする', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    await exportDesignAsPdf('DAG123', { pages: [] });

    const body = mocks.request.mock.calls[0]![0] as { data: { format: unknown } };
    expect(body.data.format).toEqual({ type: 'pdf' });
  });

  it('アクセストークンを Bearer で送る', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    await exportDesignAsPdf('DAG123');

    const opts = mocks.request.mock.calls[0]![0] as { headers: Record<string, string> };
    expect(opts.headers.Authorization).toBe('Bearer access-token');
  });

  it('ダウンロード URL には認証ヘッダを付けない', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    await exportDesignAsPdf('DAG123');

    const opts = mocks.get.mock.calls[0]![1] as { headers?: unknown };
    expect(opts.headers).toBeUndefined();
  });

  it('ジョブが失敗したら理由を添えて投げる', async () => {
    mocks.request.mockResolvedValue(
      job('failed', { error: { code: 'license_required', message: 'PRO が要ります' } }),
    );

    await expect(exportDesignAsPdf('DAG123')).rejects.toThrow(/license_required/);
  });

  it('ジョブ作成が HTTP エラーなら投げる', async () => {
    mocks.request.mockResolvedValue({ status: 403, data: { code: 'missing_scope' } });

    await expect(exportDesignAsPdf('DAG123')).rejects.toThrow(/403/);
  });

  it('URL が返らなければ投げる', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: [] }));

    await expect(exportDesignAsPdf('DAG123')).rejects.toThrow(/ダウンロード URL/);
  });

  it('ダウンロードが失敗したら投げる', async () => {
    mocks.request.mockResolvedValue(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue({ status: 404, data: Buffer.alloc(0) });

    await expect(exportDesignAsPdf('DAG123')).rejects.toThrow(/ダウンロード/);
  });

  it('完了するまでポーリングを続ける', async () => {
    vi.useFakeTimers();
    mocks.request
      .mockResolvedValueOnce(job('in_progress'))
      .mockResolvedValueOnce(job('in_progress'))
      .mockResolvedValueOnce(job('in_progress'))
      .mockResolvedValueOnce(job('success', { urls: ['https://export.example/a.pdf'] }));
    mocks.get.mockResolvedValue(pdfBytes());

    const promise = exportDesignAsPdf('DAG123');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(mocks.request).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('終わらなければタイムアウトする', async () => {
    vi.useFakeTimers();
    mocks.request.mockResolvedValue(job('in_progress'));

    const promise = exportDesignAsPdf('DAG123');
    const assertion = expect(promise).rejects.toThrow(/180 秒/);
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;

    vi.useRealTimers();
  });
});
