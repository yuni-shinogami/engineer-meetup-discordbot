import fs from 'fs';
import path from 'path';

/** VRChat のプロフィールURL。表示用に組み立て直すときにも使う。 */
const PROFILE_URL_BASE = 'https://vrchat.com/home/user/';

export function profileUrl(vrcUserId: string): string {
  return `${PROFILE_URL_BASE}${vrcUserId}`;
}

export type ParseResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * ユーザーIDの緩い足切り。
 *
 * `usr_` + UUID だけを通してはいけない。VRChat のレガシーアカウントは
 * `8JoV9XEdpo` のようなプレフィックス無しの短い ID を持つ（vrchatapi/specification の
 * schemas/UserID.yaml に明記）。ここでは明らかなゴミを弾くだけにして、
 * 実在するかどうかの判定は `GET /users/{userId}` に任せる。
 */
const PLAUSIBLE_ID = /^[A-Za-z0-9_-]{3,64}$/;

const WRONG_ID_PREFIX: ReadonlyArray<[string, string]> = [
  ['wrld_', 'ワールド'],
  ['grp_', 'グループ'],
  ['avtr_', 'アバター'],
];

const WRONG_PATH_SEGMENT: ReadonlyArray<[string, string]> = [
  ['world', 'ワールド'],
  ['group', 'グループ'],
  ['avatar', 'アバター'],
];

const EXAMPLE = 'https://vrchat.com/home/user/usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

function wrongKindError(kind: string): string {
  return `それは${kind}のURLです。プロフィールのURLを貼ってください（例: ${EXAMPLE}）`;
}

/**
 * VRChat のプロフィールURL、または生のユーザーIDからユーザーIDを取り出す。
 *
 * 「ユーザーIDがどこにあるか」を案内せずに済むよう、プロフィールから Copy Link した URL を
 * そのまま貼ってもらう想定。末尾のスラッシュ・クエリ・フラグメント、`www.` 付き、
 * スキーム無しも許容する。
 */
export function parseVrchatProfile(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: `プロフィールURLを入力してください（例: ${EXAMPLE}）` };
  }

  if (!trimmed.includes('/')) return fromRawId(trimmed);

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `URL として読めませんでした（例: ${EXAMPLE}）` };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'vrchat.com') {
    return { ok: false, error: `VRChat のURLではありません: ${url.hostname}（例: ${EXAMPLE}）` };
  }

  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { ok: false, error: `URL として読めませんでした（例: ${EXAMPLE}）` };
  }

  const userIndex = segments.indexOf('user');
  const candidate = userIndex === -1 ? undefined : segments[userIndex + 1];
  if (!candidate) {
    for (const [segment, kind] of WRONG_PATH_SEGMENT) {
      if (segments.includes(segment)) return { ok: false, error: wrongKindError(kind) };
    }
    return { ok: false, error: `プロフィールのURLを貼ってください（例: ${EXAMPLE}）` };
  }

  return fromRawId(candidate);
}

function fromRawId(value: string): ParseResult {
  for (const [prefix, kind] of WRONG_ID_PREFIX) {
    if (value.startsWith(prefix)) return { ok: false, error: wrongKindError(kind) };
  }
  if (!PLAUSIBLE_ID.test(value)) {
    return { ok: false, error: `ユーザーIDとして読めませんでした: ${value}（例: ${EXAMPLE}）` };
  }
  return { ok: true, userId: value };
}

export interface VrcLink {
  vrcUserId: string;
  displayName: string;
  linkedAt: string;
  /** 登録操作をした Discord ユーザー。代理登録の誤りを追跡できるように残す。 */
  linkedBy: string;
  /** フレンド申請を送った時刻。表示と重複申請の抑制にだけ使う。 */
  friendRequestSentAt: string | null;
}

export interface VrcLinkInput {
  vrcUserId: string;
  displayName: string;
  linkedBy: string;
}

interface VrcLinkStoreData {
  links: Record<string, VrcLink>;
}

/**
 * Discord ユーザー → VRChat ユーザーID の対応の永続化。
 *
 * フレンド状態そのものはここに持たない。相手がいつ承認するか分からず、
 * キャッシュするとすぐ陳腐化するため、判定は毎回 friendStatus を引く。
 */
export class VrcLinkStore {
  private data: VrcLinkStoreData;

  constructor(private readonly storePath: string) {
    this.data = this.load();
  }

  private load(): VrcLinkStoreData {
    if (!fs.existsSync(this.storePath)) return { links: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as Partial<VrcLinkStoreData>;
      return { links: parsed.links && typeof parsed.links === 'object' ? parsed.links : {} };
    } catch (e) {
      console.error('Failed to load VRChat link store:', e);
      return { links: {} };
    }
  }

  private save(): void {
    const dir = path.dirname(this.storePath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.storePath);
  }

  get(discordUserId: string): VrcLink | undefined {
    return this.data.links[discordUserId];
  }

  /** 登録・上書き。同じ VRChat アカウントへの再登録なら申請済みの記録を引き継ぐ。 */
  set(discordUserId: string, input: VrcLinkInput, now: string = new Date().toISOString()): VrcLink {
    const previous = this.data.links[discordUserId];
    const link: VrcLink = {
      vrcUserId: input.vrcUserId,
      displayName: input.displayName,
      linkedAt: now,
      linkedBy: input.linkedBy,
      friendRequestSentAt:
        previous?.vrcUserId === input.vrcUserId ? previous.friendRequestSentAt : null,
    };
    this.data.links[discordUserId] = link;
    this.save();
    return link;
  }

  markFriendRequestSent(discordUserId: string, now: string = new Date().toISOString()): void {
    const link = this.data.links[discordUserId];
    if (!link) return;
    link.friendRequestSentAt = now;
    this.save();
  }

  remove(discordUserId: string): boolean {
    if (!this.data.links[discordUserId]) return false;
    delete this.data.links[discordUserId];
    this.save();
    return true;
  }

  list(): Array<[string, VrcLink]> {
    return Object.entries(this.data.links);
  }
}
