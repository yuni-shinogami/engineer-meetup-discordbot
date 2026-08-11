/** LT 応募のライフサイクル。内部キーは英語、Discord 上の表示は status.ts の LT_STATUS_LABELS で日本語化する。 */
export const LT_STATUSES = [
  'applied',    // 応募受付済み・日程未定
  'scheduled',  // 日程確定（運営承認済み）
  'ready',      // 素材そろった・告知画像生成済み
  'announced',  // LT 告知を投稿済み
  'done',       // 登壇完了
  'cancelled',  // 取り下げ
] as const;

export type LtStatus = (typeof LT_STATUSES)[number];

export function isLtStatus(value: string): value is LtStatus {
  return (LT_STATUSES as readonly string[]).includes(value);
}

/**
 * 参加者によるスライドの写真撮影・SNS 拡散を許すか。
 * 当日のアナウンスと告知文の注記に使う（制限するのは「第三者の行為」）。
 */
export const CAPTURE_POLICIES = ['allowed', 'denied'] as const;

export type CapturePolicy = (typeof CAPTURE_POLICIES)[number];

/**
 * エンジニア集会の YouTube チャンネルへ録画をアップしてよいか。
 * 登壇後のアーカイブ作業に使う（判断するのは「運営の行為」）。
 * `unlisted` は限定公開にして URL を集会 Discord 内でのみ共有する運用。
 */
export const ARCHIVE_POLICIES = ['public', 'unlisted', 'none'] as const;

export type ArchivePolicy = (typeof ARCHIVE_POLICIES)[number];

export const CAPTURE_POLICY_SHORT: Record<CapturePolicy, string> = {
  allowed: '📸 参加者の撮影・拡散OK',
  denied: '🚫 参加者の撮影・拡散NG',
};

export const ARCHIVE_POLICY_SHORT: Record<ArchivePolicy, string> = {
  public: '🎥 YouTube 一般公開OK',
  unlisted: '🎥 YouTube 限定公開（Discord内のみ）',
  none: '🎥 録画の公開なし',
};

export interface PolicyChoice<T extends string> {
  value: T;
  label: string;
  description: string;
}

/** 設問1: 参加者の撮影・拡散。制限するのは第三者の行為。 */
export const CAPTURE_POLICY_CHOICES: readonly PolicyChoice<CapturePolicy>[] = [
  {
    value: 'allowed',
    label: '許可する',
    description: '参加者がスライドを撮影し、SNSに投稿できます',
  },
  {
    value: 'denied',
    label: '許可しない',
    description: '当日アナウンスで撮影・拡散をお断りします',
  },
] as const;

/** 設問2: 集会 YouTube への録画公開。判断するのは運営の行為。 */
export const ARCHIVE_POLICY_CHOICES: readonly PolicyChoice<ArchivePolicy>[] = [
  {
    value: 'public',
    label: '一般公開してよい',
    description: '誰でも見られる形で集会YouTubeに公開します',
  },
  {
    value: 'unlisted',
    label: '限定公開ならよい',
    description: '限定公開にしてURLを集会Discord内でのみ共有します',
  },
  {
    value: 'none',
    label: '公開しない',
    description: 'YouTubeへのアップロードは行いません',
  },
] as const;

export function isCapturePolicy(value: string): value is CapturePolicy {
  return (CAPTURE_POLICIES as readonly string[]).includes(value);
}

export function isArchivePolicy(value: string): value is ArchivePolicy {
  return (ARCHIVE_POLICIES as readonly string[]).includes(value);
}

/** 撮影・拡散に制限があり、当日アナウンスや告知文で注意喚起が要るか。 */
export function needsCaptureWarning(policy: CapturePolicy): boolean {
  return policy === 'denied';
}

/** 登壇後に YouTube へアップしてよいか（限定公開を含む）。 */
export function canArchive(policy: ArchivePolicy): boolean {
  return policy !== 'none';
}

/** 告知先ごとの投稿結果。部分失敗しても成功済みを再投稿しないための冪等キー。 */
export interface LtAnnounceResult {
  /** 投稿先での識別子（X: tweetId, Discord: messageUrl, VRChat: postId） */
  ref: string | null;
  postedAt: string | null;
}

export interface LtEntry {
  /** フォーラムスレッド ID（主キー） */
  id: string;
  speakerId: string;
  /** 呼ばれたい名前。告知画像・告知文に載せる */
  speakerName: string;
  /** 発表テーマ・タイトル。未定なら「未定」が入る */
  title: string;
  durationMin: number;
  /**
   * LT 中に動画を流す予定があるか（ワールド側の準備要否に関わる）。
   * モーダルの 5 枠に収まらないためフォーラムポスト内で回答してもらう。
   * `null` は未回答 — 「動画なし」と区別しないと準備漏れにつながるため false に倒さない。
   */
  videoPlayback: boolean | null;
  /** 参加者によるスライド撮影・SNS 拡散の可否 */
  capturePolicy: CapturePolicy;
  /** 集会 YouTube チャンネルへの録画公開の可否 */
  archivePolicy: ArchivePolicy;
  status: LtStatus;
  /** 登壇者が選んだ希望日 'YYYY-MM-DD' の配列。フォーラムポスト内のセレクトで収集する */
  preferredDates: string[];
  /**
   * 候補日に登壇できる日が無かった場合の相談内容（自由記述）。
   * 空でなければ運営が日程を個別に調整する必要がある。
   */
  scheduleNote: string;
  /** 運営が承認した集会日 'YYYY-MM-DD'。未確定なら null */
  eventDate: string | null;
  /**
   * 素材のローカル保存パス。Discord の添付 URL は署名付きで約24時間で失効するため、
   * URL ではなくダウンロードしたファイルのパスを保持する。
   */
  materials: {
    speakerIconPath: string | null;
    titleSlidePath: string | null;
    announceImagePath: string | null;
  };
  announce: {
    x: LtAnnounceResult;
    discord: LtAnnounceResult;
    vrchat: LtAnnounceResult;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * 応募モーダルで受け取る項目。
 * モーダルのコンポーネント上限は 5 なので、希望日は含めずフォーラムポスト内のセレクトで収集する。
 */
export interface LtEntryInput {
  id: string;
  speakerId: string;
  speakerName: string;
  title: string;
  durationMin: number;
  capturePolicy: CapturePolicy;
  archivePolicy: ArchivePolicy;
}

export function emptyAnnounceResult(): LtAnnounceResult {
  return { ref: null, postedAt: null };
}

export function newLtEntry(input: LtEntryInput, now: string): LtEntry {
  return {
    ...input,
    status: 'applied',
    videoPlayback: null,
    preferredDates: [],
    scheduleNote: '',
    eventDate: null,
    materials: {
      speakerIconPath: null,
      titleSlidePath: null,
      announceImagePath: null,
    },
    announce: {
      x: emptyAnnounceResult(),
      discord: emptyAnnounceResult(),
      vrchat: emptyAnnounceResult(),
    },
    createdAt: now,
    updatedAt: now,
  };
}
