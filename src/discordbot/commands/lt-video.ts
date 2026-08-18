import { StringSelectMenuInteraction } from 'discord.js';
import { buildLtComponents, buildLtEmbed } from '../lt/forum';
import { resolveSpeakerEntry } from '../lt/guard';
import { ltStore } from '../lt/store';
import { formatError } from './utils';

/**
 * フォーラムポスト内の「LT の中で動画を流す予定はありますか？」セレクト。
 * 日程が確定したあとでも構成は変わりうるので、確定済みでも変更を許す。
 */
export async function handleLtVideoSelect(interaction: StringSelectMenuInteraction, args: string[]) {
  const entry = await resolveSpeakerEntry(interaction, args[0]);
  if (!entry) return;

  try {
    const videoPlayback = interaction.values[0] === 'yes';
    const updated = ltStore.update(entry.id, { videoPlayback });

    await interaction.update({
      embeds: [buildLtEmbed(updated)],
      components: buildLtComponents(updated, ltStore.slotUsageByDate(updated.isProd)),
    });

    if (videoPlayback) {
      await interaction.followUp({
        content: '🎬 動画を流す予定として記録しました。ワールド側の準備について運営から確認する場合があります。',
      });
    }
  } catch (error) {
    console.error('handleLtVideoSelect failed:', error);
    const content = formatError(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
