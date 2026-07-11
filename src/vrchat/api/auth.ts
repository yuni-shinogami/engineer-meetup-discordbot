import * as OTPAuth from 'otpauth';
import { VRChatClient, saveCookies } from './client';

export class AuthError extends Error {}

export function validateUserAgent(userAgent: string): void {
  const badMarkers = ['example.com', 'your-contact', 'your-email', 'yourname'];
  if (badMarkers.some(m => userAgent.toLowerCase().includes(m))) {
    throw new AuthError(
      `USER_AGENT がテンプレのままです: ${userAgent}\n` +
      '  .env の USER_AGENT を実際のメアド/URLに書き換えてください。',
    );
  }
  if (!userAgent.includes('/') || !userAgent.includes(' ')) {
    throw new AuthError(
      `USER_AGENT 形式が不正です: ${userAgent}\n` +
      "  形式は 'アプリ名/バージョン 連絡先' (例: MyApp/1.0 me@example.org)",
    );
  }
}

function generateTotp(secret: string): string {
  const cleaned = secret.trim().replace(/\s/g, '');
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(cleaned),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

export interface LoginResult {
  userId: string;
  displayName: string;
}

export async function login(
  client: VRChatClient,
  username: string,
  password: string,
  totpSecret: string | null,
): Promise<LoginResult> {
  const { http } = client;
  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
  const authHeader = { Authorization: `Basic ${basicAuth}` };

  const sessionResp = await http.get('/auth/user');
  if (sessionResp.status === 200 && sessionResp.data?.id) {
    console.log(`[${username}] logged in as ${sessionResp.data.displayName} (session reused)`);
    await saveCookies(client);
    return { userId: sessionResp.data.id, displayName: sessionResp.data.displayName };
  }

  const authResp = await http.get('/auth/user', { headers: authHeader });

  if (authResp.status === 401) {
    const msg = authResp.data?.error?.message ?? JSON.stringify(authResp.data);
    throw new AuthError(`${username}: ログイン失敗 (401)\n  ${msg}`);
  }

  if (authResp.status === 429) {
    const retryAfter = authResp.headers['retry-after'];
    const minutes = retryAfter ? Math.ceil(parseInt(retryAfter, 10) / 60) : '?';
    throw new AuthError(`${username}: レート制限 - あと約 ${minutes} 分待機してください`);
  }

  if (authResp.status !== 200) {
    throw new AuthError(`${username}: ログイン失敗 (${authResp.status}): ${JSON.stringify(authResp.data)}`);
  }

  let userData = authResp.data;

  if (authResp.data?.requiresTwoFactorAuth) {
    console.log(`[${username}] 2FA required`);
    if (!totpSecret) {
      throw new AuthError(`${username}: 2FA が有効ですが VRC_MAIN_TOTP_SECRET が未設定です。`);
    }

    const code = generateTotp(totpSecret);
    console.log(`[${username}] generated TOTP code: ${code}`);

    const totpResp = await http.post(
      '/auth/twofactorauth/totp/verify',
      { code },
      { headers: authHeader },
    );

    if (totpResp.status !== 200 || totpResp.data?.verified === false) {
      throw new AuthError(
        `${username}: 2FA 検証失敗 (${totpResp.status})\n` +
        '  - 直前に同じコードを使った可能性 (30〜60秒待って再試行)\n' +
        '  - システム時刻ずれ (`timedatectl` で確認)\n' +
        '  - TOTP_SECRET 間違い',
      );
    }

    const confirmResp = await http.get('/auth/user', { headers: authHeader });
    if (!confirmResp.data?.id) {
      throw new AuthError(`${username}: 2FA 後の確認失敗: ${JSON.stringify(confirmResp.data)}`);
    }
    userData = confirmResp.data;
    console.log(`[${username}] logged in as ${userData.displayName} after 2FA`);
  } else if (authResp.data?.id) {
    console.log(`[${username}] logged in as ${authResp.data.displayName}`);
  } else {
    throw new AuthError(`${username}: 予期しないレスポンス: ${JSON.stringify(authResp.data)}`);
  }

  await saveCookies(client);
  return { userId: userData.id, displayName: userData.displayName };
}
