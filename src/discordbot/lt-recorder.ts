import { execFile } from 'child_process';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  SendableChannels,
} from 'discord.js';
import { config } from './config';
import { buildCustomId } from './interactions';
import { formatError, requireOperatorRole } from './commands/utils';
import { formatDateKey } from './lt/dates';
import { ltStore } from './lt/store';
import { ARCHIVE_POLICY_SHORT, type ArchivePolicy, type LtEntry } from './lt/types';
import { instanceNameOf, readLatest } from './vrc-launcher';

/**
 * LT の録画。サブアカウントが入っている PC（gaming-laptop）の OBS で録画し、
 * 終わったら LT ごとに切り分けて YouTube に非公開でアップロードする。
 *
 * /create-instance の結果に「LT録画開始」ボタンを付け、押すと録画パネルを出す。
 * パネルの登壇者ボタンで LT の始まりを、「区切り」で終わりを記録し、その時刻で動画を切り分ける。
 */
export const LT_REC_START_BUTTON = 'ltrec:start';
export const LT_REC_MARK_BUTTON = 'ltrec:mark';
export const LT_REC_END_BUTTON = 'ltrec:end';
export const LT_REC_STOP_BUTTON = 'ltrec:stop';
export const LT_REC_STOP_CONFIRM = 'ltrec:stop-ok';
export const LT_REC_STATUS_BUTTON = 'ltrec:status';

/** アップロードした動画のタイトルに入れる集会名。 */
const EVENT_NAME = 'エンジニア集会';

/** start は入室直後のダイアログ待ち・ワープ・画面の切り替えまでやるので長めに待つ。 */
const START_TIMEOUT_MS = 150_000;
const SSH_TIMEOUT_MS = 30_000;

/** 録画終了後、編集とアップロードの完了を見に行く間隔と打ち切り。 */
const WATCH_INTERVAL_MS = 2 * 60_000;
const WATCH_LIMIT_MS = 8 * 60 * 60_000;

/** ボタンは 1 行 5 個まで。登壇者ボタンは 3 行まで使い、残りの 1 行を操作ボタンに充てる。 */
const MAX_LT_BUTTONS = 15;

type RecorderVerb = 'start' | 'mark' | 'end' | 'stop' | 'status';
type RecorderState = 'recording' | 'processing' | 'uploading' | 'done' | 'error';

export interface RecorderStatus {
  session: string;
  state: RecorderState;
  event: string;
  error: string | null;
  marks: { t: string; lt_id: string | null; title: string | null }[];
  clips: {
    lt_id: string;
    title: string;
    speaker: string;
    archive_policy: ArchivePolicy;
    video_id: string | null;
    privacy: string | null;
  }[];
}

export function isLtRecorderConfigured(): boolean {
  return Boolean(config.ltRecorderSshTarget && config.ltRecorderSshKey);
}

/**
 * 録画する PC に SSH し、録画スクリプトに 1 つ指示を送る。
 * 接続先の鍵は Request-Recorder.ps1 に固定してあるので、送るのは「動詞 + base64url の JSON」だけ。
 * 返事は JSON 1 行（日本語も \uXXXX にした ASCII）。
 */
export function callRecorder<T = Record<string, unknown>>(
  verb: RecorderVerb,
  payload?: Record<string, unknown>,
): Promise<T> {
  const request = payload
    ? `${verb} ${Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')}`
    : verb;
  const args = [
    '-n',
    '-i', config.ltRecorderSshKey,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10',
    config.ltRecorderSshTarget,
    request,
  ];
  const timeout = verb === 'start' ? START_TIMEOUT_MS : SSH_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    execFile('ssh', args, { timeout, encoding: 'buffer' }, (error, stdout, stderr) => {
      const line = stdout.toString('utf-8').trim().split('\n').pop() ?? '';
      let reply: { ok?: boolean; error?: string } | null = null;
      try {
        reply = JSON.parse(line);
      } catch {
        // JSON が返らないのは SSH や PowerShell の段階で失敗したとき
      }
      if (reply?.ok) {
        const { ok: _ok, ...rest } = reply;
        resolve(rest as T);
        return;
      }
      if (reply?.error) {
        reject(new Error(reply.error));
        return;
      }
      // 接続先は Windows で、PowerShell のエラーは Shift_JIS で返ってくる
      const detail = new TextDecoder('shift_jis').decode(stderr).trim().split('\n')[0];
      reject(new Error(detail || error?.message || '録画 PC から応答がありません'));
    });
  });
}

export function ltRecordStartButton(location: string, isProd: boolean): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(LT_REC_START_BUTTON, instanceNameOf(location), isProd ? '1' : '0'))
    .setLabel('🎥 LT録画開始')
    .setStyle(ButtonStyle.Secondary);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 録画中のパネルのボタン。登壇者ごとの開始ボタンと、区切り・状況確認・終了。 */
export function recordingPanelRows(entries: LtEntry[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const shown = entries.slice(0, MAX_LT_BUTTONS);
  for (let i = 0; i < shown.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      shown.slice(i, i + 5).map(entry => new ButtonBuilder()
        .setCustomId(buildCustomId(LT_REC_MARK_BUTTON, entry.id))
        .setLabel(truncate(`▶ ${entry.speakerName}`, 80))
        .setStyle(ButtonStyle.Primary)),
    ));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LT_REC_END_BUTTON).setLabel('⏸ 区切り').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(LT_REC_STATUS_BUTTON).setLabel('🔄 状況').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(LT_REC_STOP_BUTTON).setLabel('⏹ 録画終了').setStyle(ButtonStyle.Danger),
  ));
  return rows;
}

function statusRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(LT_REC_STATUS_BUTTON).setLabel('🔄 状況').setStyle(ButtonStyle.Secondary),
  );
}

/** archivePolicy ごとに、非公開でアップした動画を運営がどうするか。 */
const ARCHIVE_ACTION: Record<ArchivePolicy, string> = {
  public: 'Studio で「公開」に切り替えてください',
  unlisted: 'Studio で「限定公開」に切り替え、URL は集会 Discord 内でのみ共有してください',
  none: 'アップロードしていません',
};

/** 録画セッションの状況を、パネルや完了報告の本文にする。 */
export function renderStatus(status: RecorderStatus): string {
  const lines = [`🎥 **LT 録画**（${status.session}）`];
  switch (status.state) {
    case 'recording': {
      lines.push(
        '🔴 録画中です。LT が始まったら登壇者のボタンを、終わったら「⏸ 区切り」を押してください。押した時刻で動画を切り分けます。',
      );
      for (const mark of status.marks) {
        lines.push(mark.lt_id ? `- ▶ ${mark.t} ${mark.title ?? ''}` : `- ⏸ ${mark.t} 区切り`);
      }
      break;
    }
    case 'processing':
      lines.push('✂️ 録画を終了しました。LT ごとに切り分けています（数十分かかります）。');
      break;
    case 'uploading':
      lines.push('⬆️ YouTube に非公開でアップロードしています。');
      break;
    case 'done': {
      lines.push(status.clips.length > 0
        ? '✅ 編集とアップロードが終わりました。動画はすべて非公開です。登壇者の希望に合わせて公開範囲を切り替えてください。'
        : '✅ 録画を終了しました。切り出す LT はありませんでした。');
      for (const clip of status.clips) {
        const url = clip.video_id ? ` https://youtu.be/${clip.video_id}` : '';
        lines.push(
          `- **${clip.title}** / ${clip.speaker}`,
          `  ${ARCHIVE_POLICY_SHORT[clip.archive_policy] ?? clip.archive_policy} → ${ARCHIVE_ACTION[clip.archive_policy] ?? ''}${url}`,
        );
      }
      break;
    }
    case 'error':
      lines.push(`❌ 編集またはアップロードに失敗しました: ${status.error ?? '原因不明'}`);
      break;
  }
  return lines.join('\n');
}

function isFinished(status: RecorderStatus): boolean {
  return status.state === 'done' || status.state === 'error';
}

/**
 * 録画終了後、編集とアップロードが終わるまで定期的に状況を見に行き、終わったらチャンネルに報告する。
 * Bot を再起動すると見張りは消えるが、パネルの「🔄 状況」でいつでも確認できる。
 */
export function watchPipeline(channel: SendableChannels, session: string): void {
  const deadline = Date.now() + WATCH_LIMIT_MS;
  const tick = async () => {
    try {
      const status = await callRecorder<RecorderStatus>('status');
      if (status.session !== session) return; // 次の録画が始まっている
      if (isFinished(status)) {
        await channel.send(renderStatus(status));
        return;
      }
    } catch (error) {
      console.error('watchPipeline failed:', error);
    }
    if (Date.now() < deadline) schedule();
  };
  const schedule = () => setTimeout(() => void tick(), WATCH_INTERVAL_MS).unref();
  schedule();
}

export async function handleLtRecordStartButton(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;

  // 「サブアカウントで入る」と同じく、最新のインスタンスのボタンだけを受け付ける
  const latest = readLatest();
  if (!latest || instanceNameOf(latest.location) !== args[0]) {
    await interaction.reply({
      content: 'ℹ️ このボタンのインスタンスは、その後に作成したインスタンスに置き換わっています。最新の /create-instance の結果から押してください。',
      ephemeral: true,
    });
    return;
  }
  const isProd = args[1] === '1';

  await interaction.deferReply();
  try {
    await interaction.editReply('🎥 サブアカウントを録画位置に移動し、録画を始めています（30 秒ほどかかります）…');
    await callRecorder('start', { location: latest.location, event: EVENT_NAME });
    const status = await callRecorder<RecorderStatus>('status');
    const entries = ltStore.entriesOnDate(formatDateKey(new Date()), isProd);
    const note = entries.length === 0
      ? ['', 'ℹ️ 今日の LT が登録されていないので、登壇者のボタンはありません。録画はひと続きのまま残ります。']
      : entries.length > MAX_LT_BUTTONS
        ? ['', `ℹ️ ボタンを出せるのは ${MAX_LT_BUTTONS} 件までです。`]
        : [];
    await interaction.editReply({
      content: [renderStatus(status), ...note].join('\n'),
      components: recordingPanelRows(entries),
    });
  } catch (error) {
    console.error('handleLtRecordStartButton failed:', error);
    await interaction.editReply(formatError(error));
  }
}

/** パネルのボタンで録画スクリプトに指示を送り、パネルの本文を最新の状況に書き換える。 */
async function updatePanel(
  interaction: ButtonInteraction,
  verb: 'mark' | 'end',
  payload?: Record<string, unknown>,
) {
  await interaction.deferUpdate();
  try {
    await callRecorder(verb, payload);
    const status = await callRecorder<RecorderStatus>('status');
    await interaction.editReply({ content: renderStatus(status) });
  } catch (error) {
    console.error(`ltrec ${verb} failed:`, error);
    await interaction.followUp({ content: formatError(error), ephemeral: true });
  }
}

export async function handleLtRecordMarkButton(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;
  const entry = ltStore.get(args[0] ?? '');
  if (!entry) {
    await interaction.reply({ content: '❌ この LT の応募が見つかりません。', ephemeral: true });
    return;
  }
  await updatePanel(interaction, 'mark', {
    lt_id: entry.id,
    title: entry.title,
    speaker: entry.speakerName,
    archive_policy: entry.archivePolicy,
  });
}

export async function handleLtRecordEndButton(interaction: ButtonInteraction) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;
  await updatePanel(interaction, 'end');
}

export async function handleLtRecordStatusButton(interaction: ButtonInteraction) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;
  await interaction.deferUpdate();
  try {
    const status = await callRecorder<RecorderStatus>('status');
    await interaction.editReply({ content: renderStatus(status) });
  } catch (error) {
    console.error('ltrec status failed:', error);
    await interaction.followUp({ content: formatError(error), ephemeral: true });
  }
}

/** 押し間違えると録画が切れるので、終了は本人にだけ見える確認を挟む。確認ボタンにはパネルのメッセージ ID を持たせる。 */
export async function handleLtRecordStopButton(interaction: ButtonInteraction) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;
  await interaction.reply({
    content: '⏹ 録画を終了し、編集とアップロードを始めます。よろしいですか？',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(LT_REC_STOP_CONFIRM, interaction.message.id))
        .setLabel('録画を終了する')
        .setStyle(ButtonStyle.Danger),
    )],
    ephemeral: true,
  });
}

export async function handleLtRecordStopConfirm(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;
  await interaction.update({ content: '⏹ 録画を終了しています…', components: [] });
  try {
    const stopped = await callRecorder<{ session: string; duration: string; lts: number }>('stop');
    await interaction.editReply(`⏹ 録画を終了しました（${stopped.duration}、LT ${stopped.lts} 本）。`);

    const status = await callRecorder<RecorderStatus>('status');
    const panel = await interaction.channel?.messages.fetch(args[0] ?? '').catch(() => null);
    await panel?.edit({ content: renderStatus(status), components: [statusRow()] });
    if (interaction.channel?.isSendable()) watchPipeline(interaction.channel, stopped.session);
  } catch (error) {
    console.error('handleLtRecordStopConfirm failed:', error);
    await interaction.editReply(formatError(error));
  }
}
