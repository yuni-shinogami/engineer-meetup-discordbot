import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { config } from '../../config';
import { buildCustomId } from '../../interactions';
import { formatError, requireOperatorRole } from '../../shared/interaction';
import type { LatestState } from '../../../vrchat/internal/state';

/**
 * /create-instance の結果に付ける「サブアカウントで入る」ボタン。
 * 引数はインスタンス名（location の `:` と最初の `~` の間）。location そのものは customId の 100 文字に収まらない。
 */
export const VRC_JOIN_SUB_BUTTON = 'vrc:join-sub';

/** 起動側（Request-Join.ps1）と同じ条件。ここで弾いておけば、形式の崩れた文字列を SSH に流さない。 */
const LOCATION_PATTERN = /^wrld_[0-9a-f-]{36}:[A-Za-z0-9]+(~[A-Za-z]+\([A-Za-z0-9_.-]+\))*$/;

const SSH_TIMEOUT_MS = 30_000;
/** 入室の確認は接続先が最大 180 秒待つので、それより少し長く待つ。 */
const WAIT_TIMEOUT_MS = 210_000;

export function isVrcLauncherConfigured(): boolean {
  return Boolean(config.vrcLauncherSshTarget && config.vrcLauncherSshKey);
}

export function instanceNameOf(location: string): string {
  return location.split(':')[1]?.split('~')[0] ?? '';
}

export function joinSubButton(location: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(VRC_JOIN_SUB_BUTTON, instanceNameOf(location)))
    .setLabel('🖥️ サブアカウントで入る')
    .setStyle(ButtonStyle.Secondary);
}

export function joinSubButtonRow(location: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(joinSubButton(location));
}

/** 接続先は Windows で、出力は Shift_JIS で返ってくる。 */
function decode(buffer: Buffer): string {
  return new TextDecoder('shift_jis').decode(buffer).trim();
}

/**
 * VRChat を起動する PC に SSH し、起動スクリプトに 1 つ依頼して標準出力を返す。
 * 接続先の鍵は起動スクリプトに固定してあるので、送る文字列は location（と頭の `wait`）だけ。
 */
function runLauncher(request: string, timeout: number): Promise<string> {
  const args = [
    '-n',
    '-i', config.vrcLauncherSshKey,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10',
    config.vrcLauncherSshTarget,
    request,
  ];
  return new Promise((resolve, reject) => {
    execFile('ssh', args, { timeout, encoding: 'buffer' }, (error, stdout, stderr) => {
      if (!error) {
        resolve(decode(stdout));
        return;
      }
      // PowerShell のエラーは「C:\...\Request-Join.ps1 : 理由」の形なので、理由だけにする
      const detail = decode(stderr).split('\n')[0]?.replace(/^.*?\.ps1 : /, '').trim();
      reject(new Error(detail || error.message));
    });
  });
}

/** サブアカウントでそのインスタンスへ入らせる（起動を依頼したらすぐ返る）。 */
export async function requestSubAccountJoin(location: string): Promise<void> {
  if (!LOCATION_PATTERN.test(location)) {
    throw new Error(`インスタンスの形式が不正です: ${location}`);
  }
  await runLauncher(location, SSH_TIMEOUT_MS);
}

/**
 * 依頼した入室が終わるまで待つ。接続先が VRChat のログを見て、そのインスタンスに入り
 * ワールドの読み込みまで終わったら入室した時刻（`HH:MM:SS`）を返す。
 * 別のインスタンスに入った・起動に失敗した・時間切れなら理由付きで失敗する。
 */
export async function waitSubAccountJoin(location: string): Promise<string> {
  if (!LOCATION_PATTERN.test(location)) {
    throw new Error(`インスタンスの形式が不正です: ${location}`);
  }
  const output = await runLauncher(`wait ${location}`, WAIT_TIMEOUT_MS);
  return /\d{2}:\d{2}:\d{2}/.exec(output)?.[0] ?? '';
}

/** /create-instance が最後に作ったインスタンス。ボタンが最新のインスタンスのものかを確かめるのに使う。 */
export function readLatest(): LatestState | null {
  try {
    return JSON.parse(readFileSync(join(config.vrcStateDir || './state', 'latest.json'), 'utf-8')) as LatestState;
  } catch {
    return null;
  }
}

export async function handleJoinSubButton(interaction: ButtonInteraction, args: string[]) {
  if (!await requireOperatorRole(interaction, '❌ このボタンを押す権限がありません。')) return;

  // ボタンには最新のインスタンスしか結びつけられない。後から別のインスタンスを作っていたら、古いボタンでは入らせない
  const latest = readLatest();
  if (!latest || instanceNameOf(latest.location) !== args[0]) {
    await interaction.reply({
      content: 'ℹ️ このボタンのインスタンスは、その後に作成したインスタンスに置き換わっています。最新の /create-instance の結果から押してください。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    await requestSubAccountJoin(latest.location);
  } catch (error) {
    console.error('handleJoinSubButton failed:', error);
    await interaction.editReply(formatError(error));
    return;
  }

  // 起動できても、入室に失敗したり別のインスタンスに入ったりすることがあるので、ログで入室を確かめてから知らせる
  await interaction.editReply('🖥️ サブアカウントの VRChat を起動しました。入室を確認しています（1〜2 分かかります）…');
  try {
    const at = await waitSubAccountJoin(latest.location);
    await interaction.editReply(`✅ サブアカウントがインスタンスに入りました${at ? `（${at}）` : ''}。`);
  } catch (error) {
    console.error('waitSubAccountJoin failed:', error);
    const reason = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`⚠️ サブアカウントの入室を確認できませんでした: ${reason}\nもう一度ボタンを押すと起動し直します。`);
  }
}
