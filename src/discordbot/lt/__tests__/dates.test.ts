import { describe, it, expect } from 'vitest';
import {
  formatDateKey,
  formatMeetupDate,
  formatShortDate,
  parseDateKey,
  upcomingMeetupDates,
} from '../dates';

describe('formatDateKey / parseDateKey', () => {
  it('ローカル日付を YYYY-MM-DD に整形する', () => {
    expect(formatDateKey(new Date(2026, 7, 14))).toBe('2026-08-14');
    expect(formatDateKey(new Date(2026, 0, 2))).toBe('2026-01-02');
  });

  it('往復して同じ日付に戻る', () => {
    const date = parseDateKey('2026-08-14');
    expect(date).not.toBeNull();
    expect(formatDateKey(date!)).toBe('2026-08-14');
  });

  it('形式が不正なら null', () => {
    expect(parseDateKey('2026/08/14')).toBeNull();
    expect(parseDateKey('2026-8-14')).toBeNull();
    expect(parseDateKey('')).toBeNull();
  });

  it('存在しない日付は繰り上がらずに null', () => {
    expect(parseDateKey('2026-02-31')).toBeNull();
    expect(parseDateKey('2026-13-01')).toBeNull();
  });
});

describe('formatMeetupDate', () => {
  it('曜日つきの日本語表記にする', () => {
    expect(formatMeetupDate('2026-08-14')).toBe('8月14日(金)');
  });

  it('解析できない文字列はそのまま返す', () => {
    expect(formatMeetupDate('未定')).toBe('未定');
  });
});

describe('formatShortDate', () => {
  it('ゼロ埋めしない M/D 形式にする', () => {
    expect(formatShortDate('2026-08-14')).toBe('8/14');
    expect(formatShortDate('2026-01-02')).toBe('1/2');
  });

  it('解析できない文字列はそのまま返す', () => {
    expect(formatShortDate('未定')).toBe('未定');
  });
});

describe('upcomingMeetupDates', () => {
  // 2026-08-11 は火曜、直近の金曜は 2026-08-14
  const tuesday = new Date(2026, 7, 11);

  it('直近の開催曜日から週次で候補を返す', () => {
    expect(upcomingMeetupDates(3, tuesday, 5)).toEqual([
      '2026-08-14',
      '2026-08-21',
      '2026-08-28',
    ]);
  });

  it('当日が開催曜日なら当日を最初の候補に含める', () => {
    const friday = new Date(2026, 7, 14);
    expect(upcomingMeetupDates(2, friday, 5)).toEqual(['2026-08-14', '2026-08-21']);
  });

  it('開催曜日の翌日なら翌週まで飛ぶ', () => {
    const saturday = new Date(2026, 7, 15);
    expect(upcomingMeetupDates(1, saturday, 5)).toEqual(['2026-08-21']);
  });

  it('月をまたいでも正しく進む', () => {
    expect(upcomingMeetupDates(4, new Date(2026, 7, 25), 5)).toEqual([
      '2026-08-28',
      '2026-09-04',
      '2026-09-11',
      '2026-09-18',
    ]);
  });

  it('count が 0 なら空配列', () => {
    expect(upcomingMeetupDates(0, tuesday, 5)).toEqual([]);
  });
});
