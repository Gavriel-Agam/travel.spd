import { describe, expect, it } from 'vitest';
import { caretAfterUnits, formatAmountTyping, groupThousands, unitsBefore } from '../amountInput';
import { parseAmount } from '../money';

describe('money fields while typing', () => {
  it('adds thousands separators from the fourth digit', () => {
    expect(formatAmountTyping('123', 2)).toBe('123');
    expect(formatAmountTyping('1234', 2)).toBe('1,234');
    expect(formatAmountTyping('1,2345', 2)).toBe('12,345');
    expect(formatAmountTyping('1234567.5', 2)).toBe('1,234,567.5');
    expect(groupThousands('1000000')).toBe('1,000,000');
  });

  it('keeps one decimal point and the currency’s decimals', () => {
    expect(formatAmountTyping('1,234.567', 2)).toBe('1,234.56');
    expect(formatAmountTyping('12.3.4', 2)).toBe('12.34');
    expect(formatAmountTyping('1234.5', 0)).toBe('1,234'); // yen, dong: no decimals
    expect(formatAmountTyping('1,234.', 2)).toBe('1,234.');
    expect(formatAmountTyping('', 2)).toBe('');
  });

  it('reads a comma typed last (and no point yet) as the decimal separator', () => {
    expect(formatAmountTyping('1,234,', 2)).toBe('1,234.');
    expect(formatAmountTyping('12,', 2)).toBe('12.');
    expect(formatAmountTyping('1,234.5,', 2)).toBe('1,234.5');
  });

  it('drops anything that is not a number', () => {
    expect(formatAmountTyping('₪ 1 2a3', 2)).toBe('123');
  });

  it('stays parseable', () => {
    expect(parseAmount(formatAmountTyping('1234567.89', 2), 'ILS')).toBe(123456789);
  });

  it('keeps the caret after the same digit when separators move', () => {
    // "1,234" + "5" typed at the end -> "12,345", caret at the end
    expect(caretAfterUnits('12,345', unitsBefore('1,2345', 6))).toBe(6);
    // A digit typed in the middle: "1,234" -> "19,234" with the caret after the 9
    const raw = '19,234';
    expect(caretAfterUnits(formatAmountTyping(raw, 2), unitsBefore(raw, 2))).toBe(2);
    // Deleting the first digit of "12,345" -> "2,345", caret at the start
    expect(caretAfterUnits(formatAmountTyping('2,345', 2), unitsBefore('2,345', 0))).toBe(0);
  });
});
