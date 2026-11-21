import { config } from '../../config';
import { MatchStore } from './store';

/** プロセス全体で共有するマッチングの記録。コマンドとボタンの両方が参照する。 */
export const matchStore = new MatchStore(config.matchDir);
