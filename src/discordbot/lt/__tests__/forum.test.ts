import { describe, it, expect } from 'vitest';
import { config } from '../../config';
import { upcomingMeetupDates } from '../dates';
import {
  allCandidatesFull,
  buildLtComponents,
  buildLtThreadName,
  buildPreferredDatesRow,
  buildVideoPlaybackRow,
  LT_DATES_CONSULT_VALUE,
} from '../forum';

interface SelectJson {
  custom_id: string;
  min_values: number;
  max_values: number;
  options: { label: string; value: string; description: string; default: boolean }[];
}

const select = (row: ReturnType<typeof buildPreferredDatesRow>): SelectJson =>
  row.toJSON().components[0] as unknown as SelectJson;

describe('buildPreferredDatesRow', () => {
  const candidates = () => upcomingMeetupDates();

  it('スレッドIDを customId に埋め込む', () => {
    expect(select(buildPreferredDatesRow('1518647607705079828')).custom_id)
      .toBe('lt:dates:1518647607705079828');
  });

  it('候補日と相談用の選択肢を出し、複数選択できる', () => {
    const menu = select(buildPreferredDatesRow('1'));
    expect(menu.options.map(o => o.value)).toEqual([...candidates(), LT_DATES_CONSULT_VALUE]);
    expect(menu.min_values).toBe(1);
    expect(menu.max_values).toBe(menu.options.length);
  });

  it('相談用の選択肢は日付と取り違えない値を持つ', () => {
    expect(LT_DATES_CONSULT_VALUE).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const menu = select(buildPreferredDatesRow('1'));
    expect(menu.options[menu.options.length - 1]!.label).toBe('この中に登壇できる日がない');
  });

  it('1集会1枠なので、空いている日は「空き」と表示する', () => {
    expect(config.ltSlotsPerDay).toBe(1);
    const menu = select(buildPreferredDatesRow('1'));
    const dateOptions = menu.options.filter(o => o.value !== LT_DATES_CONSULT_VALUE);
    expect(dateOptions.every(o => o.description === '空き')).toBe(true);
  });

  it('既に埋まっている日は選べるが埋まっている旨を表示する', () => {
    const taken = candidates()[0]!;
    const menu = select(buildPreferredDatesRow('1', [], new Map([[taken, 1]])));

    const option = menu.options.find(o => o.value === taken)!;
    expect(option.description).toBe('埋まっています（運営と要相談）');
  });

  it('全日程が埋まっていても選択肢は空にならず、相談の導線が残る', () => {
    // 選択肢が 0 件だと Discord がセレクトを拒否するため、満枠の日も残す
    const usage = new Map(candidates().map(date => [date, 1]));
    const menu = select(buildPreferredDatesRow('1', [], usage));

    const dateOptions = menu.options.filter(o => o.value !== LT_DATES_CONSULT_VALUE);
    expect(dateOptions).toHaveLength(candidates().length);
    expect(dateOptions.every(o => o.description === '埋まっています（運営と要相談）')).toBe(true);
    expect(menu.options.map(o => o.value)).toContain(LT_DATES_CONSULT_VALUE);
  });

  it('選択済みの日付は初期選択状態になる', () => {
    const [first, , third] = candidates();
    const menu = select(buildPreferredDatesRow('1', [first!, third!]));

    expect(menu.options.filter(o => o.default).map(o => o.value)).toEqual([first, third]);
  });
});

describe('buildLtThreadName', () => {
  it('応募直後は日程未定と登壇者名になる', () => {
    expect(buildLtThreadName({ speakerName: 'ゆに', eventDate: null, preferredDates: [] }))
      .toBe('日程未定 ゆに');
  });

  it('希望日が選ばれたらその日付を載せる', () => {
    expect(buildLtThreadName({ speakerName: 'ゆに', eventDate: null, preferredDates: ['2026-08-14'] }))
      .toBe('8/14 ゆに');
  });

  it('希望日が複数なら最も早い日を載せる', () => {
    expect(buildLtThreadName({
      speakerName: 'ゆに',
      eventDate: null,
      preferredDates: ['2026-08-14', '2026-09-04'],
    })).toBe('8/14 ゆに');
  });

  it('日程が確定したら希望日より確定日を優先する', () => {
    expect(buildLtThreadName({
      speakerName: 'ゆに',
      eventDate: '2026-09-04',
      preferredDates: ['2026-08-14'],
    })).toBe('9/4 ゆに');
  });

  it('登壇者名が長くてもスレッド名の上限 100 文字に収まる', () => {
    const name = buildLtThreadName({
      speakerName: 'あ'.repeat(200),
      eventDate: '2026-08-14',
      preferredDates: [],
    });
    expect(name.length).toBeLessThanOrEqual(100);
  });
});

describe('buildVideoPlaybackRow', () => {
  it('未回答のうちはどちらも初期選択しない', () => {
    const menu = select(buildVideoPlaybackRow('1', null));
    expect(menu.options.map(o => o.value)).toEqual(['yes', 'no']);
    expect(menu.options.some(o => o.default)).toBe(false);
  });

  it('回答済みならその値が初期選択される', () => {
    expect(select(buildVideoPlaybackRow('1', true)).options.filter(o => o.default).map(o => o.value))
      .toEqual(['yes']);
    expect(select(buildVideoPlaybackRow('1', false)).options.filter(o => o.default).map(o => o.value))
      .toEqual(['no']);
  });

  it('単一選択に限定する', () => {
    const menu = select(buildVideoPlaybackRow('1', null));
    expect(menu.min_values).toBe(1);
    expect(menu.max_values).toBe(1);
  });
});

describe('buildLtComponents', () => {
  // 片方だけ差し替えるともう片方が消えるため、常に2行そろって返る必要がある
  it('希望日と動画再生の2行を必ず返す', () => {
    const rows = buildLtComponents({ id: '1', preferredDates: [], videoPlayback: null });

    expect(rows).toHaveLength(2);
    const customIds = rows.map(row => select(row).custom_id);
    expect(customIds).toEqual(['lt:dates:1', 'lt:video:1']);
  });

  it('レコードの現在値がそれぞれの行に反映される', () => {
    const first = upcomingMeetupDates()[0]!;
    const rows = buildLtComponents({ id: '9', preferredDates: [first], videoPlayback: true });

    expect(select(rows[0]!).options.filter(o => o.default).map(o => o.value)).toEqual([first]);
    expect(select(rows[1]!).options.filter(o => o.default).map(o => o.value)).toEqual(['yes']);
  });
});

describe('allCandidatesFull', () => {
  it('空きがあれば false', () => {
    expect(allCandidatesFull(new Map())).toBe(false);
    const partial = new Map(upcomingMeetupDates().slice(1).map(d => [d, 1]));
    expect(allCandidatesFull(partial)).toBe(false);
  });

  it('候補日がすべて枠数に達していれば true', () => {
    const full = new Map(upcomingMeetupDates().map(d => [d, config.ltSlotsPerDay]));
    expect(allCandidatesFull(full)).toBe(true);
  });

  it('候補期間外の日が埋まっていても影響しない', () => {
    expect(allCandidatesFull(new Map([['2020-01-03', 99]]))).toBe(false);
  });
});
