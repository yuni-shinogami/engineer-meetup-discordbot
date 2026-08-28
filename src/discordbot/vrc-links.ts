import { config } from './config';
import { VrcLinkStore } from '../vrchat/links';

/** プロセス全体で共有するリンクストア。`/vrc-link` と `/create-instance` の両方が参照する。 */
export const vrcLinkStore = new VrcLinkStore(config.vrcLinkStorePath);
