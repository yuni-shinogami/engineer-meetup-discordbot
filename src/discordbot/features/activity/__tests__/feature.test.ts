import { describe, it, expect, vi } from 'vitest';
import type { Client } from 'discord.js';

const mocks = vi.hoisted(() => ({ startActivityCollector: vi.fn() }));
vi.mock('../collector', () => ({ startActivityCollector: mocks.startActivityCollector }));

import { activityFeature } from '../feature';

// index.ts の ready で直接呼んでいた集計の開始を、onReady から呼ぶ
describe('activityFeature', () => {
  it('起動したら集計を始める', async () => {
    const client = {} as Client<true>;
    await activityFeature.onReady?.(client);
    expect(mocks.startActivityCollector).toHaveBeenCalledWith(client);
  });

  it('コマンドは持たない', () => {
    expect(activityFeature.commands ?? []).toEqual([]);
  });
});
