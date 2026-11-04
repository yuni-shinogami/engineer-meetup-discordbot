/**
 * Canva の認可に使う設定。canva/ の中だけで使うので、Bot の config.ts を通さず環境変数から読む
 * （vrchat/・x/ と同じ）。読むのは使うときなので、.env を読み込む順番に左右されない。
 */
export const canvaConfig = {
  get clientId(): string {
    return process.env.CANVA_CLIENT_ID || '';
  },
  get clientSecret(): string {
    return process.env.CANVA_CLIENT_SECRET || '';
  },
  /** 初回認可のコールバック先。Developer Portal に登録した値と一致していないと弾かれる。 */
  get redirectUri(): string {
    return process.env.CANVA_REDIRECT_URI || 'http://127.0.0.1:8976/callback';
  },
  /** リフレッシュトークンの置き場所。VRChat のインスタンス情報と同じ state ディレクトリ。 */
  get stateDir(): string {
    return process.env.CANVA_STATE_DIR || './state';
  },
};
