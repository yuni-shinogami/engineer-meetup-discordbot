import { Client, GatewayIntentBits, Interaction, Partials } from 'discord.js';
import { config } from './config';
import { startActivityCollector } from './activity/collector';
import { setupScheduler } from './scheduler';
import { dispatchButton, dispatchCommand, dispatchModal, dispatchSelect, registerFeature } from './interactions';
import { ltFeature } from './features/lt/index';
import { calendarFeature } from './features/calendar/index';
import { slidesFeature } from './features/slides/index';
import { meetupFeature } from './features/meetup/index';
import { instanceFeature } from './features/instance/index';
import {
  handleCheckPermissionsCommand,
  handleStatusCommand,
  registerCommands,
} from './commands';

/** 機能のフォルダー（features/）の機能。コマンドとボタン・モーダル・セレクトは、ここから登録する。 */
const FEATURES = [ltFeature, calendarFeature, slidesFeature, meetupFeature, instanceFeature];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // アクティビティ集計（activity/collector.ts）用
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
  startActivityCollector(c);
  for (const feature of FEATURES) await feature.onReady?.(c);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      // features/ の機能のコマンドはそちらで受け、残りをここで振り分ける
      if (await dispatchCommand(interaction)) return;
      switch (interaction.commandName) {
        case 'check-permissions':   await handleCheckPermissionsCommand(interaction); break;
        case 'status':              await handleStatusCommand(interaction); break;
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
