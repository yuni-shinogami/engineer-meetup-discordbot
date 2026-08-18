import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';

/**
 * customId のルーティング。
 *
 * 形式は `namespace:action[:arg...]`（例: `lt:date:1234567890`）。
 * 先頭2セグメントをハンドラのキーとし、残りを引数として渡す。
 * `confirm_meetup_yes` のようなコロンを含まない旧 ID は、文字列全体をキーとして扱うため
 * 既に Discord 上に投稿済みのボタンもそのまま動作する。
 */
export interface ParsedCustomId {
  key: string;
  args: string[];
}

export function parseCustomId(customId: string): ParsedCustomId {
  const parts = customId.split(':');
  if (parts.length < 2) return { key: customId, args: [] };
  return { key: parts.slice(0, 2).join(':'), args: parts.slice(2) };
}

/** ハンドラのキーと引数から customId を組み立てる（Discord の上限は 100 文字）。 */
export function buildCustomId(key: string, ...args: string[]): string {
  const customId = [key, ...args].join(':');
  if (customId.length > 100) {
    throw new Error(`customId が 100 文字を超えています: ${customId}`);
  }
  return customId;
}

export type InteractionHandler<T> = (interaction: T, args: string[]) => Promise<void>;

const buttonHandlers = new Map<string, InteractionHandler<ButtonInteraction>>();
const modalHandlers = new Map<string, InteractionHandler<ModalSubmitInteraction>>();
const selectHandlers = new Map<string, InteractionHandler<StringSelectMenuInteraction>>();

function register<T>(
  registry: Map<string, InteractionHandler<T>>,
  key: string,
  handler: InteractionHandler<T>,
): void {
  if (registry.has(key)) throw new Error(`ハンドラのキーが重複しています: ${key}`);
  registry.set(key, handler);
}

export const registerButtonHandler = (key: string, handler: InteractionHandler<ButtonInteraction>) =>
  register(buttonHandlers, key, handler);
export const registerModalHandler = (key: string, handler: InteractionHandler<ModalSubmitInteraction>) =>
  register(modalHandlers, key, handler);
export const registerSelectHandler = (key: string, handler: InteractionHandler<StringSelectMenuInteraction>) =>
  register(selectHandlers, key, handler);

async function dispatch<T extends { customId: string }>(
  registry: Map<string, InteractionHandler<T>>,
  interaction: T,
): Promise<boolean> {
  const { key, args } = parseCustomId(interaction.customId);
  const handler = registry.get(key);
  if (!handler) return false;
  await handler(interaction, args);
  return true;
}

export const dispatchButton = (interaction: ButtonInteraction) => dispatch(buttonHandlers, interaction);
export const dispatchModal = (interaction: ModalSubmitInteraction) => dispatch(modalHandlers, interaction);
export const dispatchSelect = (interaction: StringSelectMenuInteraction) => dispatch(selectHandlers, interaction);

/** テスト用。登録済みハンドラを全て消す。 */
export function clearHandlers(): void {
  buttonHandlers.clear();
  modalHandlers.clear();
  selectHandlers.clear();
}
