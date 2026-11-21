import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { config } from '../../../config';
import { storage } from '../../../storage';
import { buildCustomId } from '../../../interactions';
import { formatError, requireOperatorRole } from '../../../shared/interaction';
import { parseVrchatProfile } from '../../../../vrchat/links';
import { getUser, getUserProfile } from '../../../../vrchat/api/user';
import { withSession } from '../../../../vrchat/session';
import { CODE_TTL_MS, hasCode, makeCode, recommend, Recommendation, tonightKey } from '../match';
import { matchStore } from '../match-store';

export const MATCH_VERIFY_BUTTON = 'match:verify';
export const MATCH_TONIGHT_BUTTON = 'match:tonight';

const PROFILE_EXAMPLE = 'https://vrchat.com/home/user/usr_...';

/** 申し込むときに見せる、何を使って誰に何が見えるか */
export const CONSENT_TEXT = [
  '**マッチングに申し込むと**',
  '・集会のワールドで付けたタグ（技術分野）の記録から、あなたが何をやっていそうかを推測します',
  '・集会中に「🤝」ボタンを押した人どうしで、似ている人を薦めます。相手には、あなたの VRChat の表示名・グループ・共通のタグが見えます',
  '・位置の記録や、誰と近くにいたかは使いません',
  '・`/match leave` でいつでもやめられ、記録はすぐ消えます',
].join('\n');

export const matchCommand = new SlashCommandBuilder()
  .setName('match')
  .setDescription('集会で似たことをやっていそうな人を薦めるマッチング')
  .addSubcommand(sub =>
    sub.setName('join')
      .setDescription('マッチングに申し込みます（VRChat アカウントの本人確認をします）')
      .addStringOption(option =>
        option.setName('profile')
          .setDescription(`VRChat のプロフィールURLを貼ってください（例: ${PROFILE_EXAMPLE}）`)
          .setRequired(true)
      )
  )
  .addSubcommand(sub => sub.setName('show').setDescription('申し込みの状態と、推測したグループを表示します'))
  .addSubcommand(sub => sub.setName('leave').setDescription('マッチングをやめて、記録を消します'))
  .addSubcommand(sub => sub.setName('post').setDescription('（運営）このチャンネルに「🤝」ボタンを出します'));

export function tonightButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(MATCH_TONIGHT_BUTTON))
      .setLabel('🤝 今夜話すと良さそうな人')
      .setStyle(ButtonStyle.Primary),
  );
}

export const TONIGHT_MESSAGE = [
  '🤝 **今夜話すと良さそうな人**',
  'ボタンを押すと、今夜このボタンを押した人の中から、集会のタグが似ている人を本人にだけ表示します。',
  'はじめての人は `/match join` で申し込んでください。',
].join('\n');

export async function handleMatchCommand(interaction: ChatInputCommandInteraction) {
  try {
    switch (interaction.options.getSubcommand()) {
      case 'join':
        await handleJoin(interaction);
        return;
      case 'show':
        await handleShow(interaction);
        return;
      case 'leave':
        await handleLeave(interaction);
        return;
      case 'post':
        await handlePost(interaction);
        return;
      default:
        await interaction.reply({ content: '❌ 不明なサブコマンドです。', ephemeral: true });
    }
  } catch (error) {
    console.error('handleMatchCommand failed:', error);
    const content = formatError(error);
    if (interaction.deferred || interaction.replied) await interaction.editReply(content);
    else await interaction.reply({ content, ephemeral: true });
  }
}

async function handleJoin(interaction: ChatInputCommandInteraction) {
  // VRChat ID も本人確認のコードも他の人に見せない
  await interaction.deferReply({ ephemeral: true });
  const parsed = parseVrchatProfile(interaction.options.getString('profile', true));
  if (!parsed.ok) {
    await interaction.editReply(`❌ ${parsed.error}`);
    return;
  }
  const vrcUser = await withSession(({ client }) => getUser(client, parsed.userId));
  if (!vrcUser) {
    await interaction.editReply(`❌ その VRChat ユーザーは見つかりませんでした。プロフィールのURLを貼り直してください（例: ${PROFILE_EXAMPLE}）`);
    return;
  }
  const code = makeCode();
  matchStore.startPending(interaction.user.id, {
    vrcUserId: vrcUser.id,
    displayName: vrcUser.displayName,
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  await interaction.editReply({
    content: [
      CONSENT_TEXT,
      '',
      `**${vrcUser.displayName}** があなたのアカウントか確かめます。`,
      `VRChat のステータスの一言か自己紹介に \`${code}\` を入れてから、下のボタンを押してください（30 分以内）。`,
      '確認が済んだらコードは消して大丈夫です。',
    ].join('\n'),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId(MATCH_VERIFY_BUTTON))
          .setLabel('✅ コードを入れました')
          .setStyle(ButtonStyle.Success),
      ),
    ],
  });
}

export async function handleVerifyButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const pending = matchStore.getPending(interaction.user.id);
    if (!pending) {
      await interaction.editReply('ℹ️ 確認待ちの申し込みがありません。`/match join` からやり直してください。');
      return;
    }
    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      await interaction.editReply('⌛ コードの有効時間（30 分）が過ぎました。`/match join` からやり直してください。');
      return;
    }
    const profile = await withSession(({ client }) => getUserProfile(client, pending.vrcUserId));
    if (!profile || !hasCode([profile.statusDescription, profile.bio], pending.code)) {
      await interaction.editReply(
        `❌ **${pending.displayName}** のステータスの一言にも自己紹介にも \`${pending.code}\` が見つかりませんでした。`
        + '保存してから少し待って、もう一度押してください。',
      );
      return;
    }
    matchStore.confirm(interaction.user.id);
    await interaction.editReply(
      `✅ **${profile.displayName}** で申し込みました。コードは消して大丈夫です。\n`
      + 'タグの記録から作るグループは 1 時間ごとに更新されます。集会中に「🤝」ボタンを押すと、今夜押した人の中から似ている人を表示します。',
    );
  } catch (error) {
    console.error('handleVerifyButton failed:', error);
    await interaction.editReply(formatError(error));
  }
}

async function handleShow(interaction: ChatInputCommandInteraction) {
  const optin = matchStore.getOptin(interaction.user.id);
  if (!optin) {
    const pending = matchStore.getPending(interaction.user.id);
    await interaction.reply({
      content: pending
        ? `⏳ **${pending.displayName}** の本人確認の途中です。\`/match join\` のボタンを押すか、やり直してください。`
        : 'ℹ️ マッチングには申し込んでいません。`/match join` で申し込めます。',
      ephemeral: true,
    });
    return;
  }
  const profile = matchStore.profiles().profiles[optin.vrcUserId];
  const lines = [`**${optin.displayName}** で申し込んでいます（${optin.joinedAt.slice(0, 10)}）。`];
  if (profile) {
    lines.push(`推測したグループ: **${profile.group}**`, `主なタグ: ${profile.tags.join('・') || '—'}`);
  } else {
    lines.push('まだタグの記録から推測できていません。集会のワールドでタグを付けると、翌日までに反映されます。');
  }
  lines.push('やめるときは `/match leave`。');
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleLeave(interaction: ChatInputCommandInteraction) {
  const removed = matchStore.remove(interaction.user.id);
  await interaction.reply({
    content: removed
      ? '🗑️ マッチングをやめて、申し込みと今夜の記録・推測したグループを消しました。'
      : 'ℹ️ マッチングには申し込んでいません。',
    ephemeral: true,
  });
}

async function handlePost(interaction: ChatInputCommandInteraction) {
  if (!await requireOperatorRole(interaction)) return;
  const channel = interaction.channel;
  if (!channel || !('send' in channel)) {
    await interaction.reply({ content: '❌ このチャンネルには投稿できません。', ephemeral: true });
    return;
  }
  await channel.send({ content: TONIGHT_MESSAGE, components: [tonightButtonRow()] });
  await interaction.reply({ content: '✅ ボタンを出しました。', ephemeral: true });
}

export function describeRecommendations(recs: Recommendation[], checkedIn: number): string {
  if (recs.length === 0) {
    return `今夜ボタンを押した人（あなたを入れて ${checkedIn} 人）の中に、まだ薦められる人がいません。`
      + '押す人が増えたら、もう一度押してみてください。';
  }
  return [
    '🤝 **今夜話すと良さそうな人**（今夜このボタンを押した人の中から）',
    ...recs.map((r, i) => {
      const shared = r.sharedTags.length ? `共通のタグ: ${r.sharedTags.join('・')}` : '共通のタグはなし';
      return `${i + 1}. **${r.displayName}** — ${r.group}（${shared}）`;
    }),
    '',
    'VRChat の表示名で探してみてください。押す人が増えると変わるので、時間をおいてもう一度押してもかまいません。',
  ].join('\n');
}

export async function handleTonightButton(interaction: ButtonInteraction) {
  const self = interaction.user.id;
  const optin = matchStore.getOptin(self);
  if (!optin) {
    await interaction.reply({
      content: `ℹ️ マッチングに申し込むと使えます。\`/match join\` に VRChat のプロフィールURLを貼ってください。\n\n${CONSENT_TEXT}`,
      ephemeral: true,
    });
    return;
  }
  const checkedIn = matchStore.checkIn(tonightKey(), self);
  const optins = matchStore.optins();
  const { profiles } = matchStore.profiles();
  if (!profiles[optin.vrcUserId]) {
    await interaction.reply({
      content: 'まだあなたのタグの記録がないので、似ている人を探せません。集会のワールドでタグを付けると、翌日までに反映されます。\n'
        + '今夜ボタンを押した記録は付けたので、ほかの人にはあなたが薦められることはありません（グループがわからないため）。',
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    content: describeRecommendations(recommend(self, checkedIn, optins, profiles), checkedIn.length),
    ephemeral: true,
  });
}

/** 集会のある週の夜に、公開チャンネルへボタンを出す（scheduler.ts の cron から呼ぶ） */
export async function postTonightButton(client: Client) {
  if (!storage.isScheduled || !config.publicChannelId) return;
  try {
    const channel = await client.channels.fetch(config.publicChannelId) as TextChannel | null;
    await channel?.send({ content: TONIGHT_MESSAGE, components: [tonightButtonRow()] });
  } catch (error) {
    console.error('Failed to post the match button:', error);
  }
}
