import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  ForumChannel,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ThreadChannel,
} from 'discord.js';
import { config, ltForumChannelId } from '../config';
import { buildCustomId } from '../interactions';
import { formatMeetupDate, formatShortDate, upcomingMeetupDates } from './dates';
import { ANNOUNCE_TARGETS, announceSummary } from './announce';
import { materialSummary } from './materials';
import { LT_STATUS_LABELS, requireLtTagIds, resolveLtTags } from './status';
import {
  ARCHIVE_POLICY_SHORT,
  CAPTURE_POLICY_SHORT,
  emptyAnnounce,
  LtEntry,
  LtEntryInput,
  LtStatus,
  needsCaptureWarning,
  needsTitle,
  outstandingItems,
} from './types';

/** 応募時に受け取る内容（スレッド ID はスレッド作成後に決まるので含まない）。 */
export type LtDraft = Omit<LtEntryInput, 'id'>;

const THREAD_NAME_MAX = 100;

/** タイトルに載せる情報。応募直後はレコード未作成なので個別に受け取る。 */
export interface LtThreadNameSource {
  speakerName: string;
  eventDate: string | null;
  preferredDates: readonly string[];
}

/**
 * フォーラムのタイトルを「日付 登壇者名」の形で組み立てる。
 * 日付は確定していれば確定日、未確定なら最も早い希望日を使う。
 * 希望日か確定日かはフォーラムのタグ（受付中／日程確定）で分かるので、タイトルには含めない。
 */
export function buildLtThreadName(source: LtThreadNameSource): string {
  const date = source.eventDate ?? source.preferredDates[0] ?? null;
  const label = date ? formatShortDate(date) : '日程未定';
  const name = `${label} ${source.speakerName}`;
  return name.length > THREAD_NAME_MAX ? `${name.slice(0, THREAD_NAME_MAX - 1)}…` : name;
}

/**
 * レコードの内容にタイトルを追従させる。
 * スレッド名の変更は 10 分あたり 2 回までに制限されているため、
 * 変わらないときは呼ばず、失敗しても呼び出し元の処理は止めない。
 */
export async function syncLtThreadName(
  thread: ThreadChannel,
  source: LtThreadNameSource,
): Promise<void> {
  const name = buildLtThreadName(source);
  if (thread.name === name) return;
  try {
    await thread.setName(name);
  } catch (error) {
    console.error(`スレッド名の更新に失敗しました (${thread.id}):`, error);
  }
}

export async function fetchLtForum(client: Client, isProd: boolean): Promise<ForumChannel> {
  const channelId = ltForumChannelId(isProd);
  if (!channelId) {
    const envName = isProd ? 'LT_FORUM_CHANNEL_ID' : 'TEST_LT_FORUM_CHANNEL_ID';
    throw new Error(`LT フォーラムのチャンネル ID が未設定です (${envName})`);
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error(`LT フォーラムが見つかりません: ${channelId}`);
  if (channel.type !== ChannelType.GuildForum) {
    throw new Error(`チャンネル ${channelId} はフォーラムチャンネルではありません`);
  }
  return channel;
}

/**
 * その応募ポストが本番フォーラムのものか。
 * X の資格情報など本番／テストで切り替えたいものを、スラッシュコマンドの引数ではなく
 * ポストの置き場所から決めるために使う（登壇者に production を意識させない）。
 */
export function isProdLtThread(thread: ThreadChannel): boolean {
  return !!config.ltForumChannelId && thread.parentId === config.ltForumChannelId;
}

/**
 * `/lt-apply` の応募先を、実行した場所から決める。
 *
 * 応募するのは一般の登壇者なので、本番／テストの区別をコマンドの引数で問わない。
 * 運営がテストする場所（テストチャンネル・テスト LT フォーラムの中）で実行したときだけ
 * テスト扱いにし、**それ以外はすべて本番**に送る。
 * 既定を本番にしているのは、テストフォーラムに落ちた応募は運営の目に触れず、
 * 登壇者からは受理されたように見えてしまうため。
 *
 * @param channelId 実行したチャンネル（スレッド内ならスレッド ID）
 * @param parentId  スレッド内で実行した場合の親チャンネル
 */
export function isProdLtApplyContext(channelId: string, parentId: string | null): boolean {
  const testIds = [config.testChannelId, config.testLtForumChannelId].filter(Boolean);
  return !testIds.includes(channelId) && !(parentId !== null && testIds.includes(parentId));
}

/** レコードの主キー（＝スレッド ID）から応募ポストを取り出す。 */
export async function fetchLtThread(client: Client, threadId: string): Promise<ThreadChannel> {
  const channel = await client.channels.fetch(threadId);
  if (!channel?.isThread()) {
    throw new Error(`応募ポストが見つかりません: ${threadId}`);
  }
  return channel;
}

function formatVideoPlayback(value: boolean | null): string {
  if (value === null) return '❔ 未回答';
  return value ? '🎬 あり' : 'なし';
}

/** 応募直後は LtDraft（レコード未作成）、以降は LtEntry を渡す。 */
export function buildLtEmbed(source: LtDraft | LtEntry): EmbedBuilder {
  const entry = 'status' in source ? source : undefined;
  const preferred = entry?.preferredDates.length
    ? entry.preferredDates.map(formatMeetupDate).join('、')
    : entry?.scheduleNote ? '候補日以外を希望' : '未選択';

  const xAccount = entry?.xAccount ?? null;

  const embed = new EmbedBuilder()
    .setTitle(needsTitle(source.title) ? `${source.title}（タイトル未定）` : source.title)
    .addFields(
      { name: '登壇者', value: `${source.speakerName}（<@${source.speakerId}>）`, inline: true },
      { name: 'Xアカウント', value: xAccount ? `[@${xAccount}](https://x.com/${xAccount})` : '❔ 未登録', inline: true },
      { name: '所要時間', value: `${source.durationMin} 分`, inline: true },
      { name: 'ステータス', value: LT_STATUS_LABELS[entry?.status ?? 'applied'], inline: true },
      { name: 'LT中の動画再生', value: formatVideoPlayback(entry?.videoPlayback ?? null), inline: true },
      { name: '参加者の撮影・拡散', value: CAPTURE_POLICY_SHORT[source.capturePolicy], inline: true },
      { name: '録画のYouTube公開', value: ARCHIVE_POLICY_SHORT[source.archivePolicy], inline: true },
      {
        name: '開催日',
        value: entry?.eventDate ? `✅ ${formatMeetupDate(entry.eventDate)}` : `未確定（希望: ${preferred}）`,
        inline: true,
      },
    );

  if (entry) {
    embed.addFields(
      { name: '告知素材', value: materialSummary(entry.materials), inline: true },
      { name: '告知の投稿先', value: announceSummary(entry.announce), inline: true },
    );
  }

  if (entry?.scheduleNote) {
    embed.addFields({ name: '📮 日程の相談', value: entry.scheduleNote });
  }

  const outstanding = outstandingItems({
    title: source.title,
    xAccount,
    videoPlayback: entry?.videoPlayback ?? null,
  });
  if (outstanding.length > 0) {
    embed.addFields({
      name: '📋 登壇者にお願いしたいこと',
      value: outstanding.map(item => `・${item}`).join('\n'),
    });
  }
  return embed;
}

export const LT_DATES_SELECT = 'lt:dates';
export const LT_VIDEO_SELECT = 'lt:video';
export const LT_SCHEDULE_BUTTON = 'lt:schedule';
export const LT_UNSCHEDULE_BUTTON = 'lt:unsched';
export const LT_EDIT_BUTTON = 'lt:edit';
export const LT_ANNOUNCE_BUTTON = 'lt:announce';

/**
 * 「候補日に登壇できる日がない」ときの選択肢。
 * 日付の値（YYYY-MM-DD）とは形が違うので取り違えることはない。
 */
export const LT_DATES_CONSULT_VALUE = 'consult';

/**
 * 発表希望日のセレクト。
 * モーダルのコンポーネント上限が 5 のため希望日は応募モーダルに入らない。
 * 代わりにポスト内で選んでもらうことで、ステップ間で入力値を保持せずに済み、
 * 候補の満枠判定も選択の瞬間の状態で行える。
 */
export function buildPreferredDatesRow(
  threadId: string,
  selected: readonly string[] = [],
  usage: Map<string, number> = new Map(),
  disabled = false,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const candidates = upcomingMeetupDates();
  const options = candidates.map(date => {
    const used = usage.get(date) ?? 0;
    const remaining = config.ltSlotsPerDay - used;
    const description = remaining <= 0
      ? '埋まっています（運営と要相談）'
      : config.ltSlotsPerDay === 1 ? '空き' : `残り ${remaining} 枠`;

    return new StringSelectMenuOptionBuilder()
      .setLabel(formatMeetupDate(date))
      .setValue(date)
      .setDescription(description)
      .setDefault(selected.includes(date));
  });

  // 候補日がすべて埋まっている・どれも都合が合わない場合の逃げ道。
  // これが無いと、候補が合わない登壇者はセレクトを操作できず行き止まりになる。
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('この中に登壇できる日がない')
      .setValue(LT_DATES_CONSULT_VALUE)
      .setDescription('希望の時期を書いて運営に相談します'),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(LT_DATES_SELECT, threadId))
      .setPlaceholder(disabled ? '日程は確定済みです' : '登壇できる日を選んでください（複数選択可）')
      .setMinValues(1)
      .setMaxValues(options.length)
      .setDisabled(disabled)
      .addOptions(options),
  );
}

/**
 * LT 中に動画を流す予定かのセレクト。
 * 応募モーダルの 5 枠に収まらないためポスト側で回答してもらう。
 * ワールド側の準備に関わるので、未回答のまま放置されないよう既定値は入れない。
 */
export function buildVideoPlaybackRow(
  threadId: string,
  current: boolean | null,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(LT_VIDEO_SELECT, threadId))
      .setPlaceholder('LTの中で動画を流す予定はありますか？')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('はい')
          .setValue('yes')
          .setDescription('LT中に動画を再生します')
          .setDefault(current === true),
        new StringSelectMenuOptionBuilder()
          .setLabel('いいえ')
          .setValue('no')
          .setDescription('動画の再生はありません')
          .setDefault(current === false),
      ),
  );
}

/**
 * 登壇者が後から埋める情報（タイトル・X アカウント）の編集ボタン。
 * 応募時点ではタイトルが「未定」でもよい運用なので、決まってから登録できる導線が要る。
 */
export function buildEditRow(
  entry: Pick<LtEntry, 'id' | 'title' | 'xAccount' | 'videoPlayback'>,
): ActionRowBuilder<ButtonBuilder> {
  const pending = outstandingItems(entry).length > 0;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(LT_EDIT_BUTTON, entry.id))
      .setLabel('タイトル・Xアカウントを登録')
      .setEmoji('✏️')
      // 未入力が残っているうちは目立たせ、埋まったら控えめにする
      .setStyle(pending ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

/**
 * 運営専用の操作行。ボタンは全員に見えるが、ハンドラ側で運営ロールを要求する。
 * 日程の確定はポストの中で完結させたいので、運営チャンネルではなくここに置く。
 */
export function buildOperatorRow(
  entry: Pick<LtEntry, 'id' | 'eventDate' | 'announce'>,
): ActionRowBuilder<ButtonBuilder> {
  const scheduled = entry.eventDate !== null;
  // 一部の媒体だけ失敗した場合に再実行できるよう、告知済みでも押せるままにする
  const announced = ANNOUNCE_TARGETS.some(target => entry.announce[target].ref !== null);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(LT_SCHEDULE_BUTTON, entry.id))
      .setLabel(scheduled ? '運営: 日程を変更' : '運営: 日程を確定')
      .setEmoji('📅')
      .setStyle(scheduled ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildCustomId(LT_UNSCHEDULE_BUTTON, entry.id))
      .setLabel('運営: 確定を取り消す')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!scheduled),
    new ButtonBuilder()
      .setCustomId(buildCustomId(LT_ANNOUNCE_BUTTON, entry.id))
      .setLabel(announced ? '運営: 告知をやり直す' : '運営: 告知する')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!scheduled),
  );
}

/**
 * ポストに付けるコンポーネント一式。
 * 一部だけを差し替えると他の行が消えてしまうため、更新時は必ずこれを使う。
 * 日程が確定したら希望日の変更は運営を通してほしいので、登壇者向けのセレクトは無効化する。
 */
export function buildLtComponents(
  entry: Pick<LtEntry,
    'id' | 'preferredDates' | 'videoPlayback' | 'eventDate' | 'title' | 'xAccount' | 'announce'>,
  usage: Map<string, number> = new Map(),
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    buildPreferredDatesRow(entry.id, entry.preferredDates, usage, entry.eventDate !== null),
    buildVideoPlaybackRow(entry.id, entry.videoPlayback),
    buildEditRow(entry),
    buildOperatorRow(entry),
  ];
}

/** 候補として出している開催日がすべて埋まっているか。 */
export function allCandidatesFull(usage: Map<string, number>): boolean {
  return upcomingMeetupDates().every(date => (usage.get(date) ?? 0) >= config.ltSlotsPerDay);
}


/** フォーラムに応募ポストを作成する。返り値のスレッド ID がレコードの主キーになる。 */
export async function createLtPost(
  forum: ForumChannel,
  draft: LtDraft,
  appliedTagId: string,
  usage: Map<string, number> = new Map(),
): Promise<ThreadChannel> {
  // 応募時点では希望日も確定日も無いので「日程未定 登壇者名」で始まり、
  // 希望日の選択・日程の確定にあわせて syncLtThreadName で更新していく。
  const name = buildLtThreadName({ ...draft, eventDate: null, preferredDates: [] });

  const notes = [`📝 <@${draft.speakerId}> さんの LT 応募を受け付けました。`];
  if (needsCaptureWarning(draft.capturePolicy)) {
    notes.push('🚫 **参加者による撮影・SNS拡散は不可です。** 当日アナウンスで周知してください。');
  }
  if (draft.archivePolicy !== 'public') {
    notes.push(`⚠️ 録画の公開に制限があります → **${ARCHIVE_POLICY_SHORT[draft.archivePolicy]}**`);
  }
  notes.push('', '**続けて、下のメニューから回答をお願いします。**');
  if (allCandidatesFull(usage)) {
    notes.push(
      '📮 現在お出しできる候補日はすべて埋まっています。'
      + '「**この中に登壇できる日がない**」を選んで希望の時期をお知らせください。運営が個別に調整します。',
    );
  } else {
    notes.push(
      '① **登壇できる日**（複数選択可）。どの候補日も都合が合わない場合は「この中に登壇できる日がない」を選んでください。',
    );
  }
  notes.push('② **LT の中で動画を流す予定があるか**（ワールド側の準備に必要です）');
  notes.push(
    '③ 「**タイトル・Xアカウントを登録**」から **X アカウント** をご登録ください。'
    + '告知画像のアイコンには X のプロフィール画像を使います'
    + (needsTitle(draft.title) ? '。**LT のタイトル** も決まり次第そちらから登録してください' : ''),
  );

  // スレッド作成時点では ID が未確定なのでプレースホルダの customId は使えない。
  // 先にスターターメッセージを送ってから、スレッド ID を埋めたセレクトを付け直す。
  const thread = await forum.threads.create({
    name,
    message: {
      content: notes.join('\n'),
      embeds: [buildLtEmbed(draft)],
    },
    appliedTags: [appliedTagId],
    reason: 'LT 応募の受付',
  });

  const starter = await thread.fetchStarterMessage();
  await starter?.edit({
    components: buildLtComponents(
      {
        id: thread.id,
        preferredDates: [],
        videoPlayback: null,
        eventDate: null,
        title: draft.title,
        xAccount: null,
        announce: emptyAnnounce(),
      },
      usage,
    ),
  });

  return thread;
}

/**
 * スレッドのタグをレコードのステータスに合わせる。
 * レコードが正・タグは表示専用なので、同期は常にこの一方向だけ。
 * LT が管理していないタグは触らずに残す。
 */
export async function syncLtTag(
  thread: ThreadChannel,
  status: LtStatus,
  tagIds: Record<LtStatus, string>,
): Promise<void> {
  const managed = new Set(Object.values(tagIds));
  const preserved = thread.appliedTags.filter(id => !managed.has(id));
  await thread.setAppliedTags([...preserved, tagIds[status]]);
}

/**
 * レコードの現在値をポストの見た目（本文・コンポーネント・タイトル・タグ）へ一括で反映する。
 *
 * 正はあくまでレコードなので、表示の同期に失敗しても呼び出し元を失敗させない。
 * ここで throw すると「保存はできたのに操作はエラー扱い」になり、運営が同じ操作を繰り返してしまう。
 */
export async function applyLtEntryToPost(
  thread: ThreadChannel,
  entry: LtEntry,
  usage: Map<string, number> = new Map(),
): Promise<void> {
  try {
    const starter = await thread.fetchStarterMessage();
    await starter?.edit({
      embeds: [buildLtEmbed(entry)],
      components: buildLtComponents(entry, usage),
    });
  } catch (error) {
    console.error(`ポスト本文の更新に失敗しました (${thread.id}):`, error);
  }

  await syncLtThreadName(thread, entry);

  try {
    // parent はキャッシュ頼りなので、取れないときは ID から取り直す（黙ってタグ同期を飛ばさない）
    const forum = thread.parent
      ?? (thread.parentId ? await thread.client.channels.fetch(thread.parentId) : null);
    if (forum?.type !== ChannelType.GuildForum) {
      throw new Error(`親フォーラムを取得できませんでした: ${thread.parentId}`);
    }
    await syncLtTag(thread, entry.status, requireLtTagIds(forum));
  } catch (error) {
    console.error(`タグの更新に失敗しました (${thread.id}):`, error);
  }
}

/** 運営チャンネル（テストモードではテストチャンネル）の ID。 */
export function operationsChannelIdFor(isProd: boolean): string {
  return isProd ? config.operationsChannelId : config.testChannelId;
}

/**
 * 起動時に本番／テスト両フォーラムの疎通とタグの有無をログに出す。
 * タグの作り忘れやリネームで実行時まで気づかないのを防ぐ。Bot は落とさない。
 */
export async function logLtForumStatus(client: Client): Promise<void> {
  for (const isProd of [true, false]) {
    const label = isProd ? '本番' : 'テスト';
    if (!ltForumChannelId(isProd)) {
      console.warn(`[LT] ${label}フォーラム: 未設定`);
      continue;
    }
    try {
      const forum = await fetchLtForum(client, isProd);
      const { missing } = resolveLtTags(forum);
      if (missing.length > 0) {
        const names = missing.map(s => `「${LT_STATUS_LABELS[s]}」`).join('、');
        console.warn(`[LT] ${label}フォーラム #${forum.name}: タグが不足しています → ${names}`);
      } else {
        console.log(`[LT] ${label}フォーラム #${forum.name}: タグ6種を確認しました`);
      }
    } catch (error) {
      console.warn(`[LT] ${label}フォーラムの確認に失敗:`, error instanceof Error ? error.message : error);
    }
  }
}
