import { Client, GatewayIntentBits, GuildMember, APIInteractionGuildMember, Interaction } from 'discord.js';
import { config } from './config';
import { storage } from './storage';
import { setupScheduler } from './scheduler';
import {
  handleConfirmMeetupCommand,
  handlePreAnnounceCommand,
  handleCreateInstanceCommand,
  handlePostAnnouncementCommand,
  handleCheckPermissionsCommand,
  handleStatusCommand,
  handleGenerateLtImageCommand,
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
  setupScheduler(client);
  console.log('Scheduler is active.');
});

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'confirm-meetup':    await handleConfirmMeetupCommand(interaction); break;
        case 'pre-announce':      await handlePreAnnounceCommand(interaction); break;
        case 'create-instance':   await handleCreateInstanceCommand(interaction); break;
        case 'post-announcement':   await handlePostAnnouncementCommand(interaction); break;
        case 'check-permissions':   await handleCheckPermissionsCommand(interaction); break;
        case 'status':              await handleStatusCommand(interaction); break;
        case 'generate-lt-image':   await handleGenerateLtImageCommand(interaction); break;
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === 'confirm_meetup_yes' || interaction.customId === 'confirm_meetup_no') {
        const member = interaction.member;
        let hasRole = false;
        if (member instanceof GuildMember) {
          hasRole = member.roles.cache.has(config.operatorRoleId);
        } else if (member) {
          hasRole = (member as APIInteractionGuildMember).roles.includes(config.operatorRoleId);
        }

        if (!hasRole) {
          await interaction.reply({ content: '❌ このボタンを押す権限がありません。', ephemeral: true });
          return;
        }

        const isYes = interaction.customId === 'confirm_meetup_yes';
        storage.isScheduled = isYes;

        const answer = isYes ? 'YES (開催する)' : 'NO (開催しない)';
        const result = isYes ? '木曜19時に事前告知を自動投稿します。' : '今週の自動告知は行いません。';
        const userMention = `<@${interaction.user.id}>`;

        await interaction.update({
          content: `【確認】今週エンジニア集会やる？\n→ **${answer}** が選択されました。${result}\n\n${userMention} が選択しました。`,
          components: [],
        });
      }
    }
  } catch (error) {
    console.error('interactionCreate error:', error);
    try {
      const errMsg = { content: '❌ 内部エラーが発生しました。', ephemeral: true };
      if (interaction.isChatInputCommand()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(errMsg);
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
