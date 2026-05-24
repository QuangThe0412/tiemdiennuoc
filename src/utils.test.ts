import { describe, it, expect } from 'vitest';
import { removeAccents, getFormattedDate, getFormattedTime, removeVietnameseTones, formatVND } from './utils';

describe('utils', () => {
  it('removeAccents should remove standard diacritics', () => {
    expect(removeAccents('Tiếng Việt')).toBe('Tieng Viet');
    expect(removeAccents('Xin chào')).toBe('Xin chao');
    expect(removeAccents('Đường dẫn')).toBe('duong dan');
  });

  it('removeVietnameseTones should remove tones and return ASCII', () => {
    expect(removeVietnameseTones('Tiếng Việt')).toBe('Tieng Viet');
    expect(removeVietnameseTones('Xin chào')).toBe('Xin chao');
    expect(removeVietnameseTones('Đường dẫn')).toBe('Duong dan');
    expect(removeVietnameseTones('Thử nghiệm 123')).toBe('Thu nghiem 123');
  });

  it('formatVND should format number with vi-VN locale', () => {
    expect(formatVND(1000000)).toMatch(/1\.000\.000|1,000,000/);
    expect(formatVND(0)).toBe('0');
  });

  it('getFormattedDate should format date as DD/MM/YYYY', () => {
    const date = new Date(2023, 4, 15); // May 15, 2023
    expect(getFormattedDate(date)).toBe('15/05/2023');
  });

  it('getFormattedTime should format time as HH:mm', () => {
    const date = new Date();
    date.setHours(14, 5, 0); // 14:05
    expect(getFormattedTime(date)).toBe('14:05');
  });
});
