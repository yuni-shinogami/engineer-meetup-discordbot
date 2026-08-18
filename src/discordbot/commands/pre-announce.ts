import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { executePreAnnounce } from '../meetup';
import { PRE_ANNOUNCE_TARGETS } from '../lt/announce';
import { formatMeetupDate } from '../lt/dates';
import { nextMeetupDate, runWeeklyLtAnnounce } from '../lt/weekly-announce';
import { requireOperatorRole, formatError } from './utils';

export const preAnnounceCommand = new SlashCommandBuilder()
  .setName('pre-announce')
  .setDescription('エンジニア集会の事前告知をXに投稿します（木曜19時に自動実行されます）')
  .addBooleanOption(option =>
    option.setName('production')
      .setDescription('本番環境で実行する場合はTrueにしてください（デフォルトはFalse: テストモード）')
  )
  .addBooleanOption(option =>
    option.setName('lt-only')
      .setDescription('LT告知だけを投稿します（事前告知ツイートは出しません）')
  )
  .addBooleanOption(option =>
    option.setName('skip-lt')
      .setDescription('翌日のLT告知を同時に投稿しない場合はTrueにしてください')
  );

export async function handlePreAnnounceCommand(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  await interaction.deferReply();

  const isProd = interaction.options.getBoolean('production') ?? false;
  const ltOnly = interaction.options.getBoolean('lt-only') ?? false;
  const skipLt = interaction.options.getBoolean('skip-lt') ?? false;

  if (ltOnly && skipLt) {
    await interaction.editReply('❌ `lt-only` と `skip-lt` は同時に指定できません。');
    return;
  }

  const modeLabel = isProd ? '本番' : 'テスト';
  const lines: string[] = [];

  if (!ltOnly) {
    try {
      await interaction.editReply(`事前告知を投稿しています (${isProd ? '🚀本番' : '🧪テスト'}モード)...`);
      const postUrl = await executePreAnnounce(isProd);
      lines.push(`✅ 事前告知を投稿しました！ (${modeLabel})`, '', `**投稿URL:** ${postUrl}`);
    } catch (error) {
      console.error('handlePreAnnounceCommand failed:', error);
      lines.push(formatError(error));
    }
  }

  // 普段の運用に合わせ、前日告知と同じタイミングで LT のお知らせも出す（別投稿）。
  if (!skipLt) {
    await interaction.editReply(`LT 告知を確認しています (${modeLabel}モード)...`);
    // lt-only は「LT 告知を出せ」という明示の指示なので、同乗の設定に関係なく実行する
    const report = await runWeeklyLtAnnounce(interaction.client, isProd, {
      force: ltOnly,
      targets: PRE_ANNOUNCE_TARGETS,
    });
    if (report) {
      if (lines.length > 0) lines.push('');
      lines.push(report);
    } else if (ltOnly) {
      // LT だけを狙って実行したのに何も出ないと原因が分からないので、
      // 「どの日を見に行ったか」まで含めて必ず返す
      lines.push(
        `ℹ️ ${formatMeetupDate(nextMeetupDate())} に確定している LT はありません。(${modeLabel})`,
        '　運営ボタンで日程を確定すると対象になります。',
      );
    }
  }

  await interaction.editReply(lines.join('\n'));
}
