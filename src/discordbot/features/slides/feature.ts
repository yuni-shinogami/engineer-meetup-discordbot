import type { BotFeature } from '../../interactions';
import { handleSlidesCommand, slidesCommand } from './commands/slides';

/** 司会進行スライドを Canva から取って投稿するコマンド。開催確認の YES からの自動投稿は、index.ts の postSlidesToChannel を呼ぶ。 */
export const slidesFeature: BotFeature = {
  commands: [
    { definition: slidesCommand, handle: handleSlidesCommand },
  ],
};
