import { Client, GatewayIntentBits, Interaction, Partials } from 'discord.js';
import { config } from './config';
import { setupScheduler } from './scheduler';
import { dispatchButton, dispatchCommand, dispatchModal, dispatchSelect, registerFeature } from './interactions';
import { ltFeature } from './features/lt/index';
import { calendarFeature } from './features/calendar/index';
import { slidesFeature } from './features/slides/index';
import { meetupFeature } from './features/meetup/index';
import { instanceFeature } from './features/instance/index';
import { activityFeature } from './features/activity/index';
import { adminFeature } from './features/admin/index';
import { registerCommands } from './register-commands';

/**
 * Bot の機能（features/）。コマンド・ボタン・モーダル・セレクトと起動時の処理は、すべてここから登録する。
 * 機能を足したらここに並べる。起動時の処理（onReady）はこの順に呼ぶので、活動の集計は取りこぼしが無いよう先頭に置く。
 */
const FEATURES = [activityFeature, ltFeature, calendarFeature, slidesFeature, meetupFeature, instanceFeature, adminFeature];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // 活動の集計（features/activity/collector.ts）用
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    ...(config.activityMemberEvents ? [GatewayIntentBits.GuildMembers] : []),
  ],
  // キャッシュに無い古いメッセージへのリアクションも受け取るため
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once('ready', async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  process.env.CLIENT_ID = c.user.id;
  await registerCommands(FEATURES);
  FEATURES.forEach(registerFeature);
  setupScheduler(c);
  console.log('Scheduler is active.');
  // 1 つの機能の起動時の処理が失敗しても、ほかの機能は動かす
  for (const feature of FEATURES) {
    try {
      await feature.onReady?.(c);
    } catch (error) {
      console.error('起動時の処理に失敗しました:', error);
    }
  }
});

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!await dispatchCommand(interaction)) {
        console.warn(`未登録のスラッシュコマンド: ${interaction.commandName}`);
      }
    } else if (interaction.isButton()) {
      if (!await dispatchButton(interaction)) {
        console.warn(`未登録のボタン customId: ${interaction.customId}`);
      }
    } else if (interaction.isModalSubmit()) {
      if (!await dispatchModal(interaction)) {
        console.warn(`未登録のモーダル customId: ${interaction.customId}`);
      }
    } else if (interaction.isStringSelectMenu()) {
      if (!await dispatchSelect(interaction)) {
        console.warn(`未登録のセレクト customId: ${interaction.customId}`);
      }
    }
  } catch (error) {
    console.error('interactionCreate error:', error);
    try {
      if (interaction.isRepliable()) {
        const errMsg = { content: '❌ 内部エラーが発生しました。', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errMsg.content });
        } else {
          await interaction.reply(errMsg);
        }
      }
    } catch {
      // reply itself failed — nothing more we can do
    }
  }
});

if (!config.discordToken) {
  console.error('DISCORD_TOKEN is not set in .env');
  process.exit(1);
}

client.login(config.discordToken);
