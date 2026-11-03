import { Client, Events, GuildMember, Message, PartialGuildMember, User } from 'discord.js';
import { config } from '../config';
import { ActivityStore, activityStore, UserRef, VoiceSample } from './store';

const MINUTE_MS = 60 * 1000;

function userRef(user: User, member?: GuildMember | null): UserRef {
  return {
    id: user.id,
    username: user.username,
    displayName: member?.displayName ?? user.globalName ?? user.username,
  };
}

/**
 * サーバーのアクティビティ（メッセージ・リアクション・VC・参加/退出）を日別・ユーザー別に集計する。
 * 本文は読まないので Message Content Intent は要らない。
 * 参加/退出は特権 Intent（Server Members）が要るので ACTIVITY_MEMBER_EVENTS で有効にしたときだけ数える。
 */
export function startActivityCollector(client: Client<true>, store: ActivityStore = activityStore): void {
  const inGuild = (guildId: string | null) => guildId === config.guildId;

  client.on(Events.MessageCreate, (message: Message) => {
    if (!message.inGuild() || !inGuild(message.guildId) || message.system) return;
    const channel = message.channel;
    const parent = channel.isThread() && channel.parent
      ? { id: channel.parent.id, name: channel.parent.name }
      : undefined;
    // リプライ先は通知をオフにしても repliedUser に入る。Bot へのメンションは人のつながりではないので除く
    const mentioned = new Set(message.mentions.users.filter(user => !user.bot).keys());
    const repliedUser = message.mentions.repliedUser;
    if (repliedUser && !repliedUser.bot) mentioned.add(repliedUser.id);
    store.recordMessage({
      at: message.createdAt,
      channelId: channel.id,
      channelName: channel.name,
      ...(parent ? { parent } : {}),
      author: userRef(message.author, message.member),
      isBot: message.author.bot || message.webhookId !== null,
      roles: message.member
        ? message.member.roles.cache
          .filter(role => role.id !== message.guildId)
          .map(role => ({ id: role.id, name: role.name }))
        : [],
      mentionedUsers: [...mentioned],
      mentionedRoles: message.mentions.roles.size,
      mentionsEveryone: message.mentions.everyone,
    });
  });

  client.on(Events.MessageReactionAdd, async (reaction, partialUser) => {
    if (!inGuild(reaction.message.guildId)) return;
    try {
      // キャッシュに無い人は名前が分からないので取りにいく
      const user = partialUser.partial ? await partialUser.fetch() : partialUser;
      if (user.bot) return;
      store.recordReaction(new Date(), userRef(user, reaction.message.guild?.members.cache.get(user.id)));
    } catch (e) {
      console.error('Failed to record reaction:', e);
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (!inGuild(newState.guild.id) || oldState.channelId || !newState.channelId) return;
    const member = newState.member;
    if (!member || member.user.bot) return;
    store.recordVoiceJoin(new Date(), userRef(member.user, member));
  });

  if (config.activityMemberEvents) {
    client.on(Events.GuildMemberAdd, (member: GuildMember) => {
      if (!inGuild(member.guild.id) || member.user.bot) return;
      store.recordMemberJoin(member.joinedAt ?? new Date(), userRef(member.user, member));
    });
    client.on(Events.GuildMemberRemove, (member: GuildMember | PartialGuildMember) => {
      if (!inGuild(member.guild.id) || member.user?.bot) return;
      store.recordMemberLeave(new Date(), member.id);
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
      const user = state.member?.user ?? client.users.cache.get(state.id);
      if (!user || user.bot) continue;
      members.push({ user: userRef(user, state.member), channelId: state.channel.id, channelName: state.channel.name });
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
