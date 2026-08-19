import { AttachmentBuilder, Client, TextChannel } from 'discord.js';
import { config } from './config';
import { exportDesignAsPdf } from '../canva/export';
import { pdfToWebm } from '../video/pdf-to-webm';
import { formatMeetupDate, upcomingMeetupDates } from './lt/dates';

const MEGABYTE = 1024 * 1024;

/** 配布する形式。既定は webm（VRChat の動画プレイヤーで流すため）。 */
export type SlidesFormat = 'webm' | 'pdf';

/** 直近の集会日。開催確認・事前告知のどちらから呼ばれても同じ日を指す。 */
function meetupDate(now: Date = new Date()): string {
  return upcomingMeetupDates(1, now)[0] ?? '';
}

/** 添付名。日付を入れておくと運営が後から遡りやすい。 */
export function slidesFileName(format: SlidesFormat, now: Date = new Date()): string {
  const date = meetupDate(now);
  return date ? `meetup-slides-${date}.${format}` : `meetup-slides.${format}`;
}

export interface SlidesAttachment {
  attachment: AttachmentBuilder;
  sizeMb: number;
  format: SlidesFormat;
}

/**
 * 司会進行スライドを Canva から取り、配布できる形にする。
 *
 * Canva 側の「非表示」はエクスポートに反映されない。デザインに置いてあるページが
 * そのまま全部出るので、当日出したいページだけを置いておく運用が前提になる。
 */
export async function buildSlidesAttachment(
  format: SlidesFormat = 'webm',
  now: Date = new Date(),
): Promise<SlidesAttachment> {
  if (!config.canvaSlideDesignId) {
    throw new Error('CANVA_SLIDE_DESIGN_ID が設定されていません。');
  }

  const pdf = await exportDesignAsPdf(config.canvaSlideDesignId);
  const body = format === 'webm'
    ? await pdfToWebm(pdf, {
        secondsPerPage: config.slidesVideoSeconds,
        height: config.slidesVideoHeight,
      })
    : pdf;

  const sizeMb = body.length / MEGABYTE;
  if (sizeMb > config.canvaMaxPdfMb) {
    throw new Error(
      `${format} が ${sizeMb.toFixed(1)}MB あり、添付の上限 ${config.canvaMaxPdfMb}MB を超えています。`
      + 'Canva 側でページを減らすか、SLIDES_VIDEO_HEIGHT を下げてください。',
    );
  }

  return {
    attachment: new AttachmentBuilder(body, { name: slidesFileName(format, now) }),
    sizeMb,
    format,
  };
}

/** 添付に添えるメッセージ。 */
export function slidesMessage(
  sizeMb: number,
  format: SlidesFormat,
  now: Date = new Date(),
): string {
  const date = meetupDate(now);
  const head = `📑 **${formatMeetupDate(date)}** の司会進行スライドです（${sizeMb.toFixed(1)}MB）。`;
  return format === 'webm'
    ? `${head}\nVRChat の動画プレイヤーで再生し、シークでページを送れます。`
    : head;
}

/**
 * 司会進行スライドをチャンネルへ投稿する。週次フローから呼ぶ経路。
 *
 * スライドの配布は集会の開催そのものを止める要素ではないので、失敗しても例外は投げない。
 * ただし黙って落とすと気づけないため、同じチャンネルに理由を残す。
 */
export async function postSlidesToChannel(client: Client, channelId: string): Promise<void> {
  let channel: TextChannel;
  try {
    channel = await client.channels.fetch(channelId) as TextChannel;
  } catch (error) {
    console.error('司会進行スライドの投稿先を取得できませんでした:', error);
    return;
  }

  try {
    const { attachment, sizeMb, format } = await buildSlidesAttachment();
    await channel.send({ content: slidesMessage(sizeMb, format), files: [attachment] });
  } catch (error) {
    console.error('司会進行スライドの投稿に失敗しました:', error);
    const reason = error instanceof Error ? error.message : String(error);
    await channel.send(`⚠️ 司会進行スライドを取得できませんでした: ${reason}`).catch(() => undefined);
  }
}
