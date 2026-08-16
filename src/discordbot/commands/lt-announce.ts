import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
} from 'discord.js';
import { config } from '../config';
import { buildCustomId } from '../interactions';
import { announceLt, missingForAnnounce } from '../lt/announce';
import {
  buildDiscordAnnounceText,
  buildVrchatAnnounce,
  buildXAnnounceText,
} from '../lt/announce-text';
import { applyLtEntryToPost, fetchLtThread, isProdLtThread } from '../lt/forum';
import { resolveOperatorEntry } from '../lt/guard';
import { materialExists } from '../lt/materials';
import { ltStore } from '../lt/store';
import { LtEntry } from '../lt/types';
import { formatError } from './utils';

export const LT_ANNOUNCE_CONFIRM = 'lt:doannounce';

/**
 * 「運営: 告知する」ボタン。
 *
 * 告知は外向きで取り消せないうえ 3 媒体に同時に出るため、押した本人にだけ
 * 実際に投稿される文面を見せ、確認してからでないと投稿しない。
 */
export async function handleLtAnnounceButton(interaction: ButtonInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  const missing = missingForAnnounce(entry);
  if (missing.length > 0) {
    await interaction.reply({
      content: `❌ 告知の前に次が必要です。\n${missing.map(item => `・${item}`).join('\n')}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: buildPreview(entry, isProdLtThread(await fetchLtThread(interaction.client, entry.id))),
    components: [buildConfirmRow(entry.id)],
    ephemeral: true,
  });
}

function buildConfirmRow(entryId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(LT_ANNOUNCE_CONFIRM, entryId))
      .setLabel('この内容で投稿する')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Danger),
  );
}

/** 実際に投稿される文面をそのまま見せる。投稿先ごとに文面が違うため 3 つとも出す。 */
function buildPreview(entry: LtEntry, isProd: boolean): string {
  const posted = (ref: string | null) => (ref ? '（投稿済みのためスキップ）' : '');
  const discordChannel = isProd ? config.publicChannelId : config.testChannelId;

  const lines = [
    `**${isProd ? '🔴 本番' : '🧪 テスト'}** として告知します。投稿済みの媒体は再投稿しません。`,
    '',
    `**X** ${posted(entry.announce.x.ref)}`,
    '```', buildXAnnounceText(entry), '```',
    `**Discord**（${discordChannel ? `<#${discordChannel}>` : '未設定のためスキップ'}）${posted(entry.announce.discord.ref)}`,
    '```', buildDiscordAnnounceText(entry, config.ltAnnounceRoleId), '```',
    `**VRChatグループ**（${config.vrcStateDir ? '掲示板' : '未設定のためスキップ'}）${posted(entry.announce.vrchat.ref)}`,
    '```', buildVrchatAnnounce(entry).body, '```',
  ];

  if (!materialExists(entry.materials.announceImagePath)) {
    lines.push('⚠️ **告知画像がまだありません。** 画像なしのテキストのみで投稿されます。');
  }
  if (config.ltGroupPostNotify) {
    lines.push('⚠️ VRChat グループのメンバー全員に通知が飛びます（`LT_GROUP_POST_NOTIFY`）。');
  }

  // ephemeral の本文も 2000 文字までなので、長い場合は末尾を落とす
  const preview = lines.join('\n');
  return preview.length > 1900 ? `${preview.slice(0, 1900)}\n…（省略）` : preview;
}

/** プレビューの確認ボタン。ここで初めて外部に投稿する。 */
export async function handleLtAnnounceConfirm(interaction: ButtonInteraction, args: string[]) {
  const entry = await resolveOperatorEntry(interaction, args[0]);
  if (!entry) return;

  await interaction.deferUpdate();

  try {
    const thread = await fetchLtThread(interaction.client, entry.id);
    const { entry: updated, outcomes } = await announceLt(
      interaction.client, entry, isProdLtThread(thread),
    );

    await applyLtEntryToPost(thread, updated, ltStore.slotUsageByDate());

    const failed = outcomes.filter(outcome => outcome.status === 'failed');
    const header = failed.length > 0
      ? '⚠️ 一部の媒体で失敗しました。もう一度「告知する」を押すと、失敗した媒体だけ再投稿します。'
      : '✅ LT 告知を投稿しました。';

    await interaction.editReply({
      content: [header, '', ...outcomes.map(outcome => outcome.message)].join('\n'),
      components: [],
    });

    await notifyThread(thread, updated, interaction.user.id, failed.length === 0);
  } catch (error) {
    console.error('handleLtAnnounceConfirm failed:', error);
    await interaction.editReply({ content: formatError(error), components: [] });
  }
}

async function notifyThread(
  thread: Awaited<ReturnType<typeof fetchLtThread>>,
  entry: LtEntry,
  operatorId: string,
  complete: boolean,
): Promise<void> {
  if (!complete) return;

  try {
    await thread.send({
      content: `📣 <@${entry.speakerId}> LT の告知を投稿しました！（操作: <@${operatorId}>）`
        + '\n当日はよろしくお願いします。',
      allowedMentions: { users: [entry.speakerId] },
    });
  } catch (error) {
    console.error(`告知完了の通知に失敗しました (${entry.id}):`, error);
  }
}
