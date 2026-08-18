import { AttachmentBuilder, Client, TextChannel } from 'discord.js';
import { postLtGroupAnnouncement } from '../../vrchat/postLtAnnouncement';
import { postTweet, postTweetWithImage } from '../../x/xBot';
import { config, ltAnnounceRoleId } from '../config';
import { xPostUrl } from '../../x/postUrl';
import {
  buildDiscordAnnounceText,
  buildVrchatAnnounce,
  buildXAnnounceText,
} from './announce-text';
import { materialExists } from './materials';
import { ltStore } from './store';
import { LtAnnounceResult, LtEntry, needsTitle } from './types';

export const ANNOUNCE_TARGETS = ['x', 'discord', 'vrchat'] as const;
export type AnnounceTarget = (typeof ANNOUNCE_TARGETS)[number];

export const ANNOUNCE_TARGET_LABELS: Record<AnnounceTarget, string> = {
  x: 'X',
  discord: 'Discord',
  vrchat: 'VRChatグループ',
};

/** 前日告知（木曜の `/pre-announce`）に乗せる媒体。 */
export const PRE_ANNOUNCE_TARGETS: readonly AnnounceTarget[] = ['x'];

/**
 * 当日の開催告知（`/post-announcement`）に乗せる媒体。
 * Discord も VRChat グループも、集会が始まるタイミングで一緒に出す運用に合わせている。
 */
export const MEETUP_DAY_TARGETS: readonly AnnounceTarget[] = ['discord', 'vrchat'];

export interface AnnounceOutcome {
  target: AnnounceTarget;
  /** posted=今回投稿した / skipped=投稿済みか設定なし / failed=失敗 */
  status: 'posted' | 'skipped' | 'failed';
  ref: string | null;
  message: string;
}

/** 告知を出す前に埋まっている必要があるもの。画像は無くても出せるので含めない。 */
export function missingForAnnounce(entry: LtEntry): string[] {
  const missing: string[] = [];
  if (!entry.eventDate) missing.push('開催日の確定');
  if (needsTitle(entry.title)) missing.push('LT のタイトル');
  return missing;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function announceToX(entry: LtEntry, isProd: boolean): Promise<string> {
  const text = buildXAnnounceText(entry);
  const image = entry.materials.announceImagePath;

  return materialExists(image)
    ? postTweetWithImage(text, image, isProd)
    : postTweet(text, isProd);
}

async function announceToDiscord(
  client: Client,
  entry: LtEntry,
  isProd: boolean,
): Promise<string | null> {
  const channelId = isProd ? config.publicChannelId : config.testChannelId;
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId) as TextChannel | null;
  if (!channel) throw new Error(`お知らせチャンネルを取得できません: ${channelId}`);

  const roleId = ltAnnounceRoleId();
  const image = entry.materials.announceImagePath;
  const message = await channel.send({
    content: buildDiscordAnnounceText(entry, {
      roleId,
      // X の告知が先に出ていれば、詳細はそちらへ誘導する
      xPostUrl: entry.announce.x.ref ? xPostUrl(entry.announce.x.ref, isProd) : null,
    }),
    files: materialExists(image)
      ? [new AttachmentBuilder(image, { name: 'lt-announce.png' })]
      : [],
    // 自由記述を含む本文なので、明示したロール以外にはメンションを飛ばさない
    allowedMentions: { roles: roleId ? [roleId] : [] },
  });

  return message.url;
}

async function announceToVrchat(entry: LtEntry, isProd: boolean): Promise<string | null> {
  if (!config.vrcStateDir) return null;

  const { title, body } = buildVrchatAnnounce(entry);
  return postLtGroupAnnouncement({
    isProd,
    stateDir: config.vrcStateDir,
    title,
    body,
    sendNotification: config.ltGroupPostNotify,
  });
}

/**
 * 1 媒体分の投稿。
 *
 * 投稿済み（ref あり）なら何もしない。告知は外向きの操作で取り消せないため、
 * 一部が失敗して再実行されても、成功済みの媒体を二重投稿しないことを最優先にしている。
 * `post` が null を返した場合は「その媒体は設定されていない」を意味する。
 */
async function runTarget(
  target: AnnounceTarget,
  current: LtAnnounceResult,
  post: () => Promise<string | null>,
): Promise<AnnounceOutcome> {
  const label = ANNOUNCE_TARGET_LABELS[target];

  if (current.ref) {
    return { target, status: 'skipped', ref: current.ref, message: `⏭️ ${label}: 投稿済み` };
  }

  try {
    const ref = await post();
    if (ref === null) {
      return { target, status: 'skipped', ref: null, message: `⏭️ ${label}: スキップ（未設定）` };
    }
    return { target, status: 'posted', ref, message: `✅ ${label}: ${ref}` };
  } catch (error) {
    console.error(`LT 告知の投稿に失敗しました (${target}):`, error);
    const detail = error instanceof Error ? error.message : String(error);
    return { target, status: 'failed', ref: null, message: `❌ ${label}: 失敗 — ${detail}` };
  }
}

/**
 * LT 告知を X・Discord・VRChat へ投稿する。
 *
 * 媒体ごとに独立して実行し、成功したものだけレコードに記録する。
 * 1 つでも投稿できていれば「告知済み」に進める（どこまで出せたかは埋め込みで確認できる）。
 *
 * `targets` で媒体を絞れる。普段の運用では X は前日告知（木曜）、Discord は当日の
 * 開催告知に乗せているので、呼び出し側がタイミングに応じて絞り込む。
 */
export async function announceLt(
  client: Client,
  entry: LtEntry,
  isProd: boolean,
  targets: readonly AnnounceTarget[] = ANNOUNCE_TARGETS,
): Promise<{ entry: LtEntry; outcomes: AnnounceOutcome[] }> {
  const post: Record<AnnounceTarget, () => Promise<string | null>> = {
    x: () => announceToX(entry, isProd),
    discord: () => announceToDiscord(client, entry, isProd),
    vrchat: () => announceToVrchat(entry, isProd),
  };

  // 画像は無くても投稿できる仕様なので、黙って出すと画像なしの告知に気づけない。
  // 画像を使う媒体だけ、投稿できた旨に添えて運営に知らせる。
  const noImage = !materialExists(entry.materials.announceImagePath);
  const imageTargets: readonly AnnounceTarget[] = ['x', 'discord'];

  const outcomes: AnnounceOutcome[] = [];
  for (const target of ANNOUNCE_TARGETS) {
    if (!targets.includes(target)) continue;
    const outcome = await runTarget(target, entry.announce[target], post[target]);
    outcomes.push(noImage && outcome.status === 'posted' && imageTargets.includes(target)
      ? { ...outcome, message: `${outcome.message}（⚠️ 告知画像なしで投稿）` }
      : outcome);
  }

  const announce = { ...entry.announce };
  for (const outcome of outcomes) {
    if (outcome.status === 'posted' && outcome.ref) {
      announce[outcome.target] = { ref: outcome.ref, postedAt: nowIso() };
    }
  }

  const anyPosted = ANNOUNCE_TARGETS.some(target => announce[target].ref !== null);
  const status = anyPosted && entry.status !== 'done' && entry.status !== 'cancelled'
    ? 'announced'
    : entry.status;

  return { entry: ltStore.update(entry.id, { announce, status }), outcomes };
}

/** ポストの埋め込みに出す告知の進み具合。 */
export function announceSummary(announce: LtEntry['announce']): string {
  return ANNOUNCE_TARGETS
    .map(target => `${announce[target].ref ? '✅' : '❌'} ${ANNOUNCE_TARGET_LABELS[target]}`)
    .join('\n');
}
