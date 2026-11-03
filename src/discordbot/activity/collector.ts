import { Client, Events, GuildMember, Message, PartialGuildMember } from 'discord.js';
import { config } from '../config';
import { ActivityStore, activityStore, VoiceSample } from './store';
import { createPseudonymizer, loadPseudonymSecret } from './pseudonym';

const MINUTE_MS = 60 * 1000;

/**
 * サーバーのアクティビティ（メッセージ・リアクション・VC・参加/退出）を日別に集計する。
 * 本文は読まないので Message Content Intent は要らない。
 * 参加/退出は特権 Intent（Server Members）が要るので ACTIVITY_MEMBER_EVENTS で有効にしたときだけ数える。
 */
export function startActivityCollector(client: Client<true>, store: ActivityStore = activityStore): void {
  const pseudonym = createPseudonymizer(loadPseudonymSecret());
  const inGuild = (guildId: string | null) => guildId === config.guildId;

  client.on(Events.MessageCreate, (message: Message) => {
    if (!message.inGuild() || !inGuild(message.guildId) || message.system) return;
    const channel = message.channel;
    const parent = channel.isThread() && channel.parent
      ? { id: channel.parent.id, name: channel.parent.name }
      : undefined;
    store.recordMessage({
      at: message.createdAt,
      channelId: channel.id,
      channelName: channel.name,
      ...(parent ? { parent } : {}),
      author: pseudonym(message.author.id),
      isBot: message.author.bot || message.webhookId !== null,
      roles: message.member
        ? message.member.roles.cache
          .filter(role => role.id !== message.guildId)
          .map(role => ({ id: role.id, name: role.name }))
        : [],
      mentions: {
        users: message.mentions.users.size,
        roles: message.mentions.roles.size,
        everyone: message.mentions.everyone,
      },
    });
  });

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    // 部分的なユーザーは bot が null になる。リアクションのために fetch はせず人として数える
    if (!inGuild(reaction.message.guildId) || user.bot) return;
    store.recordReaction(new Date(), pseudonym(user.id));
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (!inGuild(newState.guild.id) || oldState.channelId || !newState.channelId) return;
    if (newState.member?.user.bot) return;
    store.recordVoiceJoin(new Date());
  });

  if (config.activityMemberEvents) {
    client.on(Events.GuildMemberAdd, (member: GuildMember) => {
      if (!inGuild(member.guild.id) || member.user.bot) return;
      store.recordMemberJoin(member.joinedAt ?? new Date(), pseudonym(member.id));
    });
    client.on(Events.GuildMemberRemove, (member: GuildMember | PartialGuildMember) => {
      if (!inGuild(member.guild.id) || member.user?.bot) return;
      store.recordMemberLeave(new Date());
    });
  }

  // VC の滞在時間は入退室のペアではなく 1 分ごとの見回りで数える。
  // 再起動中の入退室や日付またぎを気にしなくてよく、多少の取りこぼしは誤差で済むため。
  setInterval(() => {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    const members: VoiceSample['members'][number][] = [];
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channel || state.channelId === guild.afkChannelId) continue;
      if (state.member?.user.bot ?? client.users.cache.get(state.id)?.bot) continue;
      members.push({ user: pseudonym(state.id), channelId: state.channel.id, channelName: state.channel.name });
    }
    store.recordVoiceSample({ at: new Date(), members });
  }, MINUTE_MS);

  setInterval(() => flushSafely(store), MINUTE_MS);

  // systemd の停止（SIGTERM）でメモリ上の集計を失わないよう、書き出してから終了する
  const shutdown = () => {
    flushSafely(store);
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  console.log(`Activity collector is active (member events: ${config.activityMemberEvents ? 'on' : 'off'}).`);
}

function flushSafely(store: ActivityStore): void {
  try {
    store.flush();
  } catch (e) {
    console.error('Failed to flush activity:', e);
  }
}
