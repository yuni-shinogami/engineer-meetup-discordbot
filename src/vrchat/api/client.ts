import axios, { AxiosInstance } from 'axios';
import { env } from '../internal/util';

export interface VRChatClient {
  http: AxiosInstance;
}

/**
 * VRChat API を vrchat-gateway 経由で呼ぶクライアント。
 *
 * ログイン（パスワード・2FA・cookie）はゲートウェイがまとめて持つので、Bot はゲートウェイのトークンだけを送る。
 * ゲートウェイは Bot に許した API だけを VRChat に中継し、それ以外は 403 を返す。
 * パスは VRChat API と同じ（`/instances` など）なので、呼び出し側は VRChat を直接呼ぶときと変わらない。
 */
export function createClient(
  gatewayUrl = env('VRC_GATEWAY_URL'),
  token = env('VRC_GATEWAY_TOKEN'),
): VRChatClient {
  const http = axios.create({
    baseURL: `${gatewayUrl.replace(/\/+$/, '')}/api/1`,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
  return { http };
}
