import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const VRCHAT_API_BASE = 'https://api.vrchat.cloud/api/1';

export interface VRChatClient {
  http: AxiosInstance;
  jar: CookieJar;
  cookieFile?: string;
}

export async function createClient(userAgent: string, cookieFile?: string): Promise<VRChatClient> {
  let jar: CookieJar;

  if (cookieFile && existsSync(cookieFile)) {
    try {
      const raw = JSON.parse(readFileSync(cookieFile, 'utf8'));
      jar = await CookieJar.deserialize(raw);
      console.log(`Loaded existing session from ${cookieFile}`);
    } catch {
      jar = new CookieJar();
    }
  } else {
    jar = new CookieJar();
  }

  const http = wrapper(
    axios.create({
      baseURL: VRCHAT_API_BASE,
      jar,
      headers: { 'User-Agent': userAgent },
      validateStatus: () => true,
    }),
  );

  return cookieFile !== undefined ? { http, jar, cookieFile } : { http, jar };
}

export async function saveCookies({ jar, cookieFile }: VRChatClient): Promise<void> {
  if (!cookieFile) return;
  try {
    const serialized = await jar.serialize();
    mkdirSync(dirname(cookieFile), { recursive: true });
    writeFileSync(cookieFile, JSON.stringify(serialized));
  } catch (e) {
    console.error(`Failed to save cookies: ${e}`);
  }
}
