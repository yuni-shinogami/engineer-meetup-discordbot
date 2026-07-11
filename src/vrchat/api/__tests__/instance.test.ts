import { describe, it, expect, vi } from 'vitest';
import { createGroupPlusInstance, inviteSelf, inviteUser } from '../instance';
import type { VRChatClient } from '../client';

function makeClient(postImpl: (...args: unknown[]) => unknown): { client: VRChatClient; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn(postImpl);
  return { client: { http: { post } } as unknown as VRChatClient, post };
}

describe('createGroupPlusInstance', () => {
  it('API が instanceId を直接返す場合はそれを使う', async () => {
    const { client } = makeClient(async () => ({
      status: 200,
      data: { location: 'wrld_1:99999~group(grp_1)~groupAccessType(plus)', instanceId: '99999', shortName: 'xyz' },
    }));

    const result = await createGroupPlusInstance(client, 'wrld_1', 'grp_1');
    expect(result.instanceId).toBe('99999');
    expect(result.shortName).toBe('xyz');
  });

  it('API が instanceId を返さない場合は location 文字列から抽出する', async () => {
    const { client } = makeClient(async () => ({
      status: 200,
      data: { location: 'wrld_1:34789~group(grp_1)~groupAccessType(plus)~region(jp)' },
    }));

    const result = await createGroupPlusInstance(client, 'wrld_1', 'grp_1');
    expect(result.instanceId).toBe('34789');
    expect(result.shortName).toBeNull();
  });

  it('location が無い場合は id フィールドをフォールバックに使う', async () => {
    const { client } = makeClient(async () => ({
      status: 200,
      data: { id: 'wrld_1:no-tilde-id' },
    }));

    const result = await createGroupPlusInstance(client, 'wrld_1', 'grp_1');
    expect(result.location).toBe('wrld_1:no-tilde-id');
    expect(result.instanceId).toBe('no-tilde-id');
  });

  it('region 未指定時は jp をデフォルトでリクエストに含める', async () => {
    const { client, post } = makeClient(async () => ({
      status: 200,
      data: { location: 'l', instanceId: 'i' },
    }));

    await createGroupPlusInstance(client, 'wrld_1', 'grp_1');
    expect(post).toHaveBeenCalledWith('/instances', expect.objectContaining({ region: 'jp' }));
  });

  it('region を明示指定した場合はそれをリクエストに含める', async () => {
    const { client, post } = makeClient(async () => ({
      status: 200,
      data: { location: 'l', instanceId: 'i' },
    }));

    await createGroupPlusInstance(client, 'wrld_1', 'grp_1', 'us');
    expect(post).toHaveBeenCalledWith('/instances', expect.objectContaining({ region: 'us' }));
  });

  it('ステータスが200以外ならエラーを投げる', async () => {
    const { client } = makeClient(async () => ({ status: 400, data: { error: 'bad request' } }));
    await expect(createGroupPlusInstance(client, 'wrld_1', 'grp_1')).rejects.toThrow('インスタンス作成失敗 (400)');
  });
});

describe('inviteSelf', () => {
  it('成功時はエラーを投げない', async () => {
    const { client } = makeClient(async () => ({ status: 200, data: {} }));
    await expect(inviteSelf(client, 'user1', 'wrld_1', '123')).resolves.toBeUndefined();
  });

  it('失敗時はステータスコード付きエラーを投げる', async () => {
    const { client } = makeClient(async () => ({ status: 500, data: {} }));
    await expect(inviteSelf(client, 'user1', 'wrld_1', '123')).rejects.toThrow('self-invite 失敗 (500)');
  });
});

describe('inviteUser', () => {
  it('成功時はエラーを投げない', async () => {
    const { client } = makeClient(async () => ({ status: 200, data: {} }));
    await expect(inviteUser(client, 'user1', 'wrld_1', '123')).resolves.toBeUndefined();
  });

  it('失敗時はユーザーIDとステータスコードを含むエラーを投げる', async () => {
    const { client } = makeClient(async () => ({ status: 403, data: {} }));
    await expect(inviteUser(client, 'user1', 'wrld_1', '123')).rejects.toThrow('user1 への招待失敗 (403)');
  });
});
