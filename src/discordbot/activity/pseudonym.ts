import { createHmac, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * Discord のユーザー ID を集計用の仮名に変える。
 * 「何人が発言したか」「参加した人がその後発言したか」を数えるには人の区別が要るが、
 * 集計ファイルから個人をたどれないよう、鍵付きハッシュ（HMAC）にして元の ID は残さない。
 * 鍵が変わると同じ人が別人として数えられるので、鍵はファイルに残して使い続ける。
 */
export function loadPseudonymSecret(
  dir: string = config.activityDir,
  fromEnv: string = config.activityHashSecret,
): string {
  if (fromEnv) return fromEnv;
  const file = path.join(dir, '.secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  fs.mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function createPseudonymizer(secret: string): (userId: string) => string {
  return userId => createHmac('sha256', secret).update(userId).digest('hex').slice(0, 16);
}
