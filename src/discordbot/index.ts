import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import { config } from './config';
import { setupScheduler } from './scheduler';
import { dispatchButton, dispatchModal, dispatchSelect } from './interactions';
import { registerInteractionHandlers } from './handlers';
import { logLtForumStatus } from './lt/forum';
import {
  handleConfirmMeetupCommand,
  handlePreAnnounceCommand,
  handleCreateInstanceCommand,
  handlePostAnnouncementCommand,
  handleCheckPermissionsCommand,
  handleStatusCommand,
  handleGenerateLtImageCommand,
  handleLtApplyCommand,
  handleLtMaterialCommand,
  handleSlidesCommand,
  registerCommands,
} from './commands';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  process.env.CLIENT_ID = c.user.id;
  await registerCommands();
  registerInteractionHandlers();
  setupScheduler(c);
  console.log('Scheduler is active.');
  await logLtForumStatus(c);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'confirm-meetup':      await handleConfirmMeetupCommand(interaction); break;
        case 'pre-announce':        await handlePreAnnounceCommand(interaction); break;
        case 'create-instance':     await handleCreateInstanceCommand(interaction); break;
        case 'post-announcement':   await handlePostAnnouncementCommand(interaction); break;
        case 'check-permissions':   await handleCheckPermissionsCommand(interaction); break;
        case 'status':              await handleStatusCommand(interaction); break;
        case 'generate-lt-image':   await handleGenerateLtImageCommand(interaction); break;
        case 'lt-apply':            await handleLtApplyCommand(interaction); break;
        case 'lt-material':         await handleLtMaterialCommand(interaction); break;
        case 'slides':              await handleSlidesCommand(interaction); break;
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
