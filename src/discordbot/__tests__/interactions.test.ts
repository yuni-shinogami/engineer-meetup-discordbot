import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ButtonInteraction } from 'discord.js';
import {
  buildCustomId,
  clearHandlers,
  dispatchButton,
  parseCustomId,
  registerButtonHandler,
} from '../interactions';

const asButton = (customId: string) => ({ customId }) as ButtonInteraction;

describe('parseCustomId', () => {
  it('namespace:action をキーにし、残りを引数にする', () => {
    expect(parseCustomId('lt:date:12345')).toEqual({ key: 'lt:date', args: ['12345'] });
  });

  it('引数が複数でも全て args に入る', () => {
    expect(parseCustomId('lt:announce:12345:x')).toEqual({ key: 'lt:announce', args: ['12345', 'x'] });
  });

  it('引数なしなら args は空', () => {
    expect(parseCustomId('lt:apply')).toEqual({ key: 'lt:apply', args: [] });
  });

  it('コロンを含まない旧形式は文字列全体をキーにする', () => {
    expect(parseCustomId('confirm_meetup_yes')).toEqual({ key: 'confirm_meetup_yes', args: [] });
  });
});

describe('buildCustomId', () => {
  it('キーと引数を : で連結する', () => {
    expect(buildCustomId('lt:date', '12345')).toBe('lt:date:12345');
  });

  it('parseCustomId と往復する', () => {
    const id = buildCustomId('lt:date', '1228185760767807528');
    expect(parseCustomId(id)).toEqual({ key: 'lt:date', args: ['1228185760767807528'] });
  });

  it('100文字を超えるとエラーになる', () => {
    expect(() => buildCustomId('lt:date', 'a'.repeat(100))).toThrow(/100 文字/);
  });
});

describe('dispatchButton', () => {
  beforeEach(() => clearHandlers());

  it('登録済みのキーならハンドラを引数つきで呼ぶ', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerButtonHandler('lt:date', handler);

    const interaction = asButton('lt:date:999');
    await expect(dispatchButton(interaction)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(interaction, ['999']);
  });

  it('未登録なら false を返しハンドラを呼ばない', async () => {
    const handler = vi.fn();
    registerButtonHandler('lt:date', handler);

    await expect(dispatchButton(asButton('lt:unknown:1'))).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('旧形式の customId もそのままルーティングできる', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerButtonHandler('confirm_meetup_yes', handler);

    await expect(dispatchButton(asButton('confirm_meetup_yes'))).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('同じキーを二重登録するとエラーになる', () => {
    registerButtonHandler('lt:date', vi.fn());
    expect(() => registerButtonHandler('lt:date', vi.fn())).toThrow(/重複/);
  });
});
