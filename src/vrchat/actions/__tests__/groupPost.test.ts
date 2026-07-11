import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postToGroup } from '../groupPost';
import { createGroupPost } from '../../api/post';
import { env } from '../../internal/util';
import { GROUP_POST_VISIBILITY, GROUP_POST_SEND_NOTIFICATION } from '../../constants';
import type { VRChatClient } from '../../api/client';

vi.mock('../../api/post', () => ({
  createGroupPost: vi.fn().mockResolvedValue({ id: 'post-id' }),
}));

vi.mock('../../internal/util', () => ({
  env: vi.fn((key: string) => {
    if (key === 'TEST_GROUP_ID') return 'test-group-id';
    if (key === 'GROUP_ID') return 'main-group-id';
    throw new Error(`unexpected env key in test: ${key}`);
  }),
}));

const mockedCreateGroupPost = vi.mocked(createGroupPost);
const mockedEnv = vi.mocked(env);
const client = {} as VRChatClient;

describe('postToGroup', () => {
  beforeEach(() => {
    mockedCreateGroupPost.mockClear();
    mockedEnv.mockClear();
  });

  it('testMode: true のときは TEST_GROUP_ID を投稿先に使う', async () => {
    await postToGroup(client, { testMode: true });

    const [, groupId] = mockedCreateGroupPost.mock.calls[0]!;
    expect(groupId).toBe('test-group-id');
  });

  it('testMode: false かつ groupId 未指定のときは GROUP_ID を投稿先に使う', async () => {
    await postToGroup(client, { testMode: false });

    const [, groupId] = mockedCreateGroupPost.mock.calls[0]!;
    expect(groupId).toBe('main-group-id');
  });

  it('groupId を明示指定した場合はそれを優先する（本番のみ）', async () => {
    await postToGroup(client, { testMode: false, groupId: 'explicit-group-id' });

    const [, groupId] = mockedCreateGroupPost.mock.calls[0]!;
    expect(groupId).toBe('explicit-group-id');
  });

  it('title/bodyText 未指定時はテンプレートファイルからタイトルと本文を読み、プレースホルダーを置換する', async () => {
    await postToGroup(client, {
      testMode: true,
      location: 'テストワールド',
      instanceId: '12345',
      launchUrl: 'https://vrchat.com/i/abcdef',
    });

    const [, , title, body, visibility, sendNotification] = mockedCreateGroupPost.mock.calls[0]!;
    expect(title).toBe('インスタンス立てました！');
    expect(body).toContain('https://vrchat.com/i/abcdef');
    expect(body).not.toContain('{invite_url}');
    expect(visibility).toBe(GROUP_POST_VISIBILITY);
    expect(sendNotification).toBe(GROUP_POST_SEND_NOTIFICATION);
  });

  it('title/bodyText を明示指定した場合はテンプレートより優先される', async () => {
    await postToGroup(client, {
      testMode: true,
      title: 'カスタムタイトル',
      bodyText: 'カスタム本文',
    });

    const [, , title, body] = mockedCreateGroupPost.mock.calls[0]!;
    expect(title).toBe('カスタムタイトル');
    expect(body).toBe('カスタム本文');
  });
});
