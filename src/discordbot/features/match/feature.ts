import type { BotFeature } from '../../interactions';
import {
  handleMatchCommand,
  handleTonightButton,
  handleVerifyButton,
  matchCommand,
  MATCH_TONIGHT_BUTTON,
  MATCH_VERIFY_BUTTON,
} from './commands/match';

/**
 * 集会のタグから似たことをやっていそうな人を薦めるマッチング。申し込んで本人確認をした人だけが対象で、
 * 集会中に「🤝」ボタンを押した人どうしの中から薦める。何をやっていそうかは分析（engineer-meetup-analytics）が
 * タグの記録から作って置いていく（store.ts）。
 */
export const matchFeature: BotFeature = {
  commands: [{ definition: matchCommand, handle: handleMatchCommand }],
  buttons: {
    [MATCH_VERIFY_BUTTON]: handleVerifyButton,
    [MATCH_TONIGHT_BUTTON]: handleTonightButton,
  },
};
