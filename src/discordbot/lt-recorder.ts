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
import { formatError, requireOperatorRole } from './shared/interaction';
import { formatDateKey } from './shared/meetup-dates';
import { ltStore } from './features/lt/index';
import { ARCHIVE_POLICY_SHORT, type ArchivePolicy, type LtEntry } from './features/lt/index';
import { instanceNameOf, readLatest } from './vrc-launcher';

/**
 * LT の録画。サブアカウントが入っている PC（gaming-laptop）の OBS で録画し、
 * 終わったら LT ごとに切り分けて YouTube に非公開でアップロードする。
 *
 * /create-instance の結果に「LT録画開始」ボタンを付け、押すと録画パネルを出す。
 * パネルの登壇者ボタンで LT の始まりを、「区切り」で終わりを記録し、その時刻で動画を切り分ける。
 */
export const LT_REC_START_BUTTON = 'ltrec:start';
/** エンジニア集会アフターラジオの準備。録画 PC の OBS で配信するので、録画と同じ接続を使う。 */
export const LT_REC_RADIO_BUTTON = 'ltrec:radio';
export const LT_REC_MARK_BUTTON = 'ltrec:mark';
export const LT_REC_END_BUTTON = 'ltrec:end';
export const LT_REC_STOP_BUTTON = 'ltrec:stop';
export const LT_REC_STOP_CONFIRM = 'ltrec:stop-ok';
export const LT_REC_STATUS_BUTTON = 'ltrec:status';

/** アップロードした動画のタイトルに入れる集会名。 */
const EVENT_NAME = 'エンジニア集会';

/** start・radio は入室直後のダイアログ待ち・ワープ・画面やカメラの準備までやるので長めに待つ。 */
const START_TIMEOUT_MS = 150_000;
const SSH_TIMEOUT_MS = 30_000;

/** 録画終了後、編集とアップロードの完了を見に行く間隔と打ち切り。 */
const WATCH_INTERVAL_MS = 2 * 60_000;
const WATCH_LIMIT_MS = 8 * 60 * 60_000;

/** 録画中に VRChat が固まっていないかを見に行く間隔。 */
const RECORDING_WATCH_INTERVAL_MS = 60_000;

/** VRChat が固まったときの立て直し方。固まったまま録画を続けても止まった画しか撮れない。 */
const HANG_ADVICE = '「⏹ 録画終了」で録画を止め、「🖥️ サブアカウントで入る」で VRChat を起動し直してから、もう一度「🎥 LT録画開始」を押してください。';

/** ボタンは 1 行 5 個まで。登壇者ボタンは 3 行まで使い、残りの 1 行を操作ボタンに充てる。 */
const MAX_LT_BUTTONS = 15;

type RecorderVerb = 'start' | 'radio' | 'mark' | 'end' | 'stop' | 'status';
/** `edited` は YouTube を認可する前の終点（切り出しまで済み、アップロードはしていない）。 */
type RecorderState = 'recording' | 'processing' | 'edited' | 'uploading' | 'done' | 'error';

export interface RecorderStatus {
  session: string;
  state: RecorderState;
  event: string;
  error: string | null;
  /** VRChat が固まっていればその説明（録画 PC が VRChat のログの止まり具合で判定する）。動いていれば null */
  vrchat_hang?: string | null;
  marks: { t: string; lt_id: string | null; title: string | null }[];
  clips: {
    lt_id: string;
    title: string;
    speaker: string;
    archive_policy: ArchivePolicy;
    video_id: string | null;
    privacy: string | null;
    /** 録画 PC に書き出した動画のファイル名。切り出していなければ null */
    file?: string | null;
    /** 切り出さなかった理由（短すぎるなど） */
    skipped?: string | null;
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
  const timeout = verb === 'start' || verb === 'radio' ? START_TIMEOUT_MS : SSH_TIMEOUT_MS;
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

export function radioPrepButton(location: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(LT_REC_RADIO_BUTTON, instanceNameOf(location)))
    .setLabel('📻 ラジオ準備')
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
      if (status.vrchat_hang) lines.push(`⚠️ ${status.vrchat_hang}。${HANG_ADVICE}`);
      break;
    }
    case 'processing':
      lines.push('✂️ 録画を終了しました。LT ごとに切り分けています（数十分かかります）。');
      break;
    case 'edited': {
      lines.push(status.clips.length > 0
        ? `✂️ LT ごとの編集が終わりました。YouTube が未設定のためアップロードはしていません（動画は録画 PC の ${status.session} フォルダにあります）。`
        : '✅ 録画を終了しました。切り出す LT はありませんでした。');
      for (const clip of status.clips) {
        const result = clip.file ?? (clip.skipped ? `切り出していません（${clip.skipped}）` : ARCHIVE_ACTION.none);
        lines.push(`- **${clip.title}** / ${clip.speaker}`, `  ${ARCHIVE_POLICY_SHORT[clip.archive_policy] ?? clip.archive_policy} → ${result}`);
      }
      break;
    }
    case 'uploading':
      lines.push('⬆️ YouTube に非公開でアップロードしています。');
      break;
    case 'done': {
      lines.push(status.clips.length > 0
        ? '✅ 編集とアップロードが終わりました。動画はすべて非公開です。登壇者の希望に合わせて公開範囲を切り替えてください。'
        : '✅ 録画を終了しました。切り出す LT はありませんでした。');
      for (const clip of status.clips) {
        const url = clip.video_id ? ` https://youtu.be/${clip.video_id}` : '';
        const action = clip.skipped && !clip.video_id
          ? `切り出していません（${clip.skipped}）`
          : ARCHIVE_ACTION[clip.archive_policy] ?? '';
        lines.push(
          `- **${clip.title}** / ${clip.speaker}`,
          `  ${ARCHIVE_POLICY_SHORT[clip.archive_policy] ?? clip.archive_policy} → ${action}${url}`,
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
  return status.state === 'done' || status.state === 'edited' || status.state === 'error';
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

/**
 * 録画中、VRChat が固まっていないかを定期的に見に行き、固まったらチャンネルに知らせる（固まっている間は 1 回だけ）。
 * 固まると録画は止まった画のまま続くので、気づくのが遅れるとその間の LT が撮れない。
 * Bot を再起動すると見張りは消えるが、パネルの「🔄 状況」でも確認できる。
 */
export function watchRecording(channel: SendableChannels, session: string): void {
  const deadline = Date.now() + WATCH_LIMIT_MS;
  let alerted = false;
  const tick = async () => {
    try {
      const status = await callRecorder<RecorderStatus>('status');
      if (status.session !== session || status.state !== 'recording') return; // 録画が終わった
      if (status.vrchat_hang && !alerted) {
        await channel.send(`⚠️ **LT 録画**（${session}）: ${status.vrchat_hang}。${HANG_ADVICE}`);
      }
      alerted = Boolean(status.vrchat_hang);
    } catch (error) {
      console.error('watchRecording failed:', error);
    }
    if (Date.now() < deadline) schedule();
  };
  const schedule = () => setTimeout(() => void tick(), RECORDING_WATCH_INTERVAL_MS).unref();
  schedule();
}

/**
 * エンジニア集会アフターラジオの準備。サブアカウントをラジオブースへワープさせ（ワールドがすりガラス・配信中の表示・
 * マイクゾーンをオンにする）、ストリームカメラを開いて Spout に流し、録画 PC の OBS をラジオのシーンにする。
 * 配信を始めるのは人（OBS の「配信開始」）。
 */
export async function handleRadioPrepButton(interaction: ButtonInteraction, args: string[]) {
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

  await interaction.deferReply();
  try {
    await interaction.editReply('📻 サブアカウントをラジオブースに移動し、ストリームカメラを準備しています（40 秒ほどかかります）…');
    const result = await callRecorder<{ moved: string; scene: string }>('radio', { location: latest.location });
    await interaction.editReply([
      `📻 ラジオの準備ができました（${result.moved}）。`,
      `録画 PC の OBS をシーン「${result.scene}」にしています。構図をプレビューで確かめてから、OBS で配信を開始してください。`,
    ].join('\n'));
  } catch (error) {
    console.error('handleRadioPrepButton failed:', error);
    await interaction.editReply(formatError(error));
  }
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
    if (interaction.channel?.isSendable()) watchRecording(interaction.channel, status.session);
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
