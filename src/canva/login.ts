import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createServer } from 'http';
import { AUTHORIZE_URL, CANVA_SCOPES, exchangeCodeForTokens, tokenFilePath } from './auth';
import { config } from '../discordbot/config';

/** PKCE の code_verifier / code_challenge を作る。Canva は S256 のみ受け付ける。 */
export function createPkcePair(): { verifier: string; challenge: string } {
  // base64url にすると 96 バイトが 128 文字になり、仕様上の上限ちょうどに収まる
  const verifier = randomBytes(96).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: 's256',
    scope: CANVA_SCOPES.join(' '),
    response_type: 'code',
    client_id: config.canvaClientId,
    redirect_uri: config.canvaRedirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** state の照合。長さ違いでも例外にせず false を返す。 */
export function statesMatch(expected: string, actual: string | null): boolean {
  if (actual === null) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function missingSettings(): string[] {
  const missing: string[] = [];
  if (!config.canvaClientId) missing.push('CANVA_CLIENT_ID');
  if (!config.canvaClientSecret) missing.push('CANVA_CLIENT_SECRET');
  return missing;
}

/**
 * ブラウザからのコールバックを 1 回だけ受ける。
 * 認可は人手の操作なので、放置されたまま待ち続けないよう時間で打ち切る。
 */
function waitForCallback(redirect: URL, expectedState: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirect.origin);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const ok = error === null && code !== null && statesMatch(expectedState, url.searchParams.get('state'));

      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(ok
        ? '認可が完了しました。ターミナルに戻ってください。'
        : '認可に失敗しました。ターミナルの表示を確認してください。');

      server.close();
      if (error !== null) reject(new Error(`Canva が認可を拒否しました: ${error}`));
      else if (code === null) reject(new Error('認可コードが返ってきませんでした'));
      else if (!ok) reject(new Error('state が一致しません（CSRF の可能性）。やり直してください'));
      else resolve(code);
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`${timeoutMs / 1000} 秒以内に認可が完了しませんでした`));
    }, timeoutMs);
    timer.unref();

    server.on('close', () => clearTimeout(timer));
    server.on('error', reject);
    server.listen(Number(redirect.port), redirect.hostname);
  });
}

export async function runLogin(): Promise<void> {
  const missing = missingSettings();
  if (missing.length > 0) {
    throw new Error(`.env に次の設定がありません: ${missing.join(', ')}`);
  }

  const redirect = new URL(config.canvaRedirectUri);
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');
  const authorizeUrl = buildAuthorizeUrl(challenge, state);

  console.log('\nブラウザで次の URL を開き、Canva で連携を許可してください:\n');
  console.log(`  ${authorizeUrl}\n`);
  console.log(`コールバックを ${redirect.origin}${redirect.pathname} で待っています...`);
  console.log('（このマシンにブラウザが無い場合は、手元の PC から');
  console.log(`  ssh -L ${redirect.port}:${redirect.hostname}:${redirect.port} <このホスト>`);
  console.log('  でポート転送してから上の URL を開いてください）\n');

  const code = await waitForCallback(redirect, state, 5 * 60 * 1000);
  await exchangeCodeForTokens(code, verifier);

  console.log(`✅ 認可が完了しました。リフレッシュトークンを ${tokenFilePath()} に保存しました。`);
}

if (require.main === module) {
  runLogin().catch(error => {
    console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
