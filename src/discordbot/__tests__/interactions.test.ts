import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
  buildCustomId,
  clearHandlers,
  dispatchButton,
  dispatchCommand,
  dispatchModal,
  dispatchSelect,
  parseCustomId,
  registerButtonHandler,
  registerFeature,
} from '../interactions';

const asButton = (customId: string) => ({ customId }) as ButtonInteraction;
const asModal = (customId: string) => ({ customId }) as ModalSubmitInteraction;
const asSelect = (customId: string) => ({ customId }) as StringSelectMenuInteraction;
const asCommand = (commandName: string) => ({ commandName }) as ChatInputCommandInteraction;
const command = (name: string, handle = vi.fn().mockResolvedValue(undefined)) =>
  ({ definition: { name, toJSON: () => ({ name }) }, handle });

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

describe('registerFeature', () => {
  beforeEach(() => clearHandlers());

  it('機能のスラッシュコマンドを名前で振り分ける', async () => {
    const apply = command('lt-apply');
    registerFeature({ commands: [apply] });

    await expect(dispatchCommand(asCommand('lt-apply'))).resolves.toBe(true);
    expect(apply.handle).toHaveBeenCalledTimes(1);
  });

  // 機能のものでないコマンドは、入口の switch が受ける
  it('どの機能のものでもないコマンドなら false を返す', async () => {
    registerFeature({ commands: [command('lt-apply')] });
    await expect(dispatchCommand(asCommand('status'))).resolves.toBe(false);
  });

  it('ボタン・モーダル・セレクトを customId のキーで登録する', async () => {
    const button = vi.fn().mockResolvedValue(undefined);
    const modal = vi.fn().mockResolvedValue(undefined);
    const select = vi.fn().mockResolvedValue(undefined);
    registerFeature({ buttons: { 'lt:edit': button }, modals: { 'lt:apply': modal }, selects: { 'lt:dates': select } });

    await expect(dispatchButton(asButton('lt:edit:1'))).resolves.toBe(true);
    await expect(dispatchModal(asModal('lt:apply'))).resolves.toBe(true);
    await expect(dispatchSelect(asSelect('lt:dates:2'))).resolves.toBe(true);
    expect(button).toHaveBeenCalledWith(expect.anything(), ['1']);
    expect(modal).toHaveBeenCalledWith(expect.anything(), []);
    expect(select).toHaveBeenCalledWith(expect.anything(), ['2']);
  });

  it('同じ名前のスラッシュコマンドを二重登録するとエラーになる', () => {
    registerFeature({ commands: [command('lt-apply')] });
    expect(() => registerFeature({ commands: [command('lt-apply')] })).toThrow(/重複/);
  });

  it('入口で登録したボタンと機能のボタンのキーが重なるとエラーになる', () => {
    registerButtonHandler('lt:edit', vi.fn());
    expect(() => registerFeature({ buttons: { 'lt:edit': vi.fn() } })).toThrow(/重複/);
  });
});
