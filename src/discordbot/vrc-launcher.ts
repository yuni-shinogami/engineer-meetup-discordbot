import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from 'discord.js';
import { config } from './config';
import { buildCustomId } from './interactions';
import { formatError, requireOperatorRole } from './commands/utils';
import type { LatestState } from '../vrchat/internal/state';

/**
 * /create-instance の結果に付ける「サブアカウントで入る」ボタン。
 * 引数はインスタンス名（location の `:` と最初の `~` の間）。location そのものは customId の 100 文字に収まらない。
 */
export const VRC_JOIN_SUB_BUTTON = 'vrc:join-sub';

/** 起動側（Request-Join.ps1）と同じ条件。ここで弾いておけば、形式の崩れた文字列を SSH に流さない。 */
const LOCATION_PATTERN = /^wrld_[0-9a-f-]{36}:[A-Za-z0-9]+(~[A-Za-z]+\([A-Za-z0-9_.-]+\))*$/;

const SSH_TIMEOUT_MS = 30_000;

export function isVrcLauncherConfigured(): boolean {
  return Boolean(config.vrcLauncherSshTarget && config.vrcLauncherSshKey);
}

export function instanceNameOf(location: string): string {
  return location.split(':')[1]?.split('~')[0] ?? '';
}

export function joinSubButtonRow(location: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(VRC_JOIN_SUB_BUTTON, instanceNameOf(location)))
      .setLabel('🖥️ サブアカウントで入る')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * VRChat を起動する PC に SSH し、サブアカウントでそのインスタンスへ入らせる。
 * 接続先の鍵は起動スクリプトに固定してあるので、送る文字列は location だけ。
 */
export function requestSubAccountJoin(location: string): Promise<void> {
  if (!LOCATION_PATTERN.test(location)) {
    return Promise.reject(new Error(`インスタンスの形式が不正です: ${location}`));
  }
  const args = [
    '-n',
    '-i', config.vrcLauncherSshKey,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10',
    config.vrcLauncherSshTarget,
    location,
  ];
  return new Promise((resolve, reject) => {
    execFile('ssh', args, { timeout: SSH_TIMEOUT_MS, encoding: 'buffer' }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      // 接続先は Windows で、エラーは Shift_JIS で返ってくる
      const detail = new TextDecoder('shift_jis').decode(stderr).trim().split('\n')[0];
      reject(new Error(detail || error.message));
    });
  });
}

function readLatest(): LatestState | null {
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
    await interaction.editReply('🖥️ サブアカウントの VRChat を起動しました。1 分ほどでインスタンスに入ります。');
  } catch (error) {
    console.error('handleJoinSubButton failed:', error);
    await interaction.editReply(formatError(error));
  }
}
