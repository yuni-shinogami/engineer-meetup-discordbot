import type { BotFeature } from '../../interactions';
import {
  confirmMeetupCommand,
  handleConfirmMeetupButton,
  handleConfirmMeetupCommand,
  handleLatePreAnnounceButton,
} from './commands/confirm-meetup';
import { handlePostAnnouncementCommand, postAnnouncementCommand } from './commands/post-announcement';
import { handlePreAnnounceCommand, preAnnounceCommand } from './commands/pre-announce';
import { CONFIRM_MEETUP_NO, CONFIRM_MEETUP_YES, LATE_PRE_ANNOUNCE_BUTTON } from './meetup';

/**
 * 開催確認・事前告知・開催告知のコマンドと、開催確認のボタン。
 * 毎週の定期実行（月曜の開催確認・木曜の事前告知）は scheduler.ts が index.ts の trigger* を呼ぶ。
 */
export const meetupFeature: BotFeature = {
  commands: [
    { definition: confirmMeetupCommand, handle: handleConfirmMeetupCommand },
    { definition: preAnnounceCommand, handle: handlePreAnnounceCommand },
    { definition: postAnnouncementCommand, handle: handlePostAnnouncementCommand },
  ],
  buttons: {
    [CONFIRM_MEETUP_YES]: handleConfirmMeetupButton,
    [CONFIRM_MEETUP_NO]: handleConfirmMeetupButton,
    [LATE_PRE_ANNOUNCE_BUTTON]: handleLatePreAnnounceButton,
  },
};
