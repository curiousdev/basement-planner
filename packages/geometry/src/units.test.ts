import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { GeometryError, LengthParseError } from './errors.js';
import {
  type Length,
  UNITS_PER_FOOT,
  UNITS_PER_INCH,
  addLengths,
  area,
  clampLength,
  divideLength,
  feet,
  feetInches,
  formatDecimalFeet,
  formatFeetInches,
  formatInches,
  formatLength,
  formatSquareFeet,
  inches,
  isExactInches,
  isLength,
  length,
  millimeters,
  multiplyLengths,
  parseLength,
  roundToNearest,
  scaleLength,
  subLengths,
  sumLengths,
  toFeet,
  toInches,
  toMillimeters,
  toSquareFeet,
  tryParseLength,
} from './units.js';

const anyLength = fc.integer({ min: -1_000_000, max: 1_000_000 }).map((n) => length(n));

describe('length construction', () => {
  it('treats 1/32 inch as the unit', () => {
    expect(inches(1)).toBe(32);
    expect(feet(1)).toBe(384);
    expect(UNITS_PER_INCH).toBe(32);
    expect(UNITS_PER_FOOT).toBe(384);
  });

  it('rejects non-integer raw units', () => {
    expect(() => length(1.5)).toThrow(GeometryError);
    expect(() => length(Number.NaN)).toThrow(GeometryError);
    expect(() => length(Number.POSITIVE_INFINITY)).toThrow(GeometryError);
    expect(isLength(1.5)).toBe(false);
    expect(isLength(12)).toBe(true);
  });

  it('represents the dimensions residential construction actually uses, exactly', () => {
    expect(inches(3.5)).toBe(112); // 2x4 stud, actual
    expect(inches(5.5)).toBe(176); // 2x6 stud, actual
    expect(inches(16)).toBe(512); // stud spacing
    expect(inches(7.75)).toBe(248); // max riser, R311.7.5.1
    expect(feetInches(7, 0)).toBe(2688); // min ceiling height, R305.1
    expect(feetInches(6, 8)).toBe(2560); // stair headroom, R311.7.2
    expect(inches(0.5)).toBe(16);
    expect(inches(1 / 32)).toBe(1);
  });

  it('builds from feet, inches, and a fraction', () => {
    expect(feetInches(12, 6, 1, 2)).toBe(12 * 384 + 6 * 32 + 16);
    expect(feetInches(0, 0, 1, 32)).toBe(1);
    expect(feetInches(-3, 6)).toBe(-(3 * 384 + 6 * 32));
  });

  it('refuses mixed signs and bad denominators', () => {
    expect(() => feetInches(1, -6)).toThrow(GeometryError);
    expect(() => feetInches(1, 6, -1, 2)).toThrow(GeometryError);
    expect(() => feetInches(1, 6, 1, 0)).toThrow(GeometryError);
  });

  it('rounds metric input to the nearest 1/32 inch', () => {
    expect(millimeters(25.4)).toBe(32);
    expect(toMillimeters(inches(1))).toBeCloseTo(25.4, 10);
    // 2400 mm is not on the 1/32" grid; it must land on the nearest unit.
    expect(Number.isInteger(millimeters(2400))).toBe(true);
  });

  it('knows which inch values are exactly representable', () => {
    expect(isExactInches(0.5)).toBe(true);
    expect(isExactInches(1 / 32)).toBe(true);
    expect(isExactInches(1 / 3)).toBe(false);
  });
});

describe('length arithmetic', () => {
  it('round-trips through inches and feet', () => {
    fc.assert(
      fc.property(anyLength, (len) => {
        expect(inches(toInches(len))).toBe(len);
        expect(feet(toFeet(len))).toBe(len);
      }),
    );
  });

  it('keeps sums exact regardless of grouping', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), { maxLength: 50 }),
        (raw) => {
          const lengths = raw.map((n) => length(n));
          const viaSum = sumLengths(lengths);
          const viaFold = lengths.reduce<Length>(
            (acc, len) => addLengths(acc, len),
            length(0),
          );
          expect(viaSum).toBe(viaFold);
        },
      ),
    );
  });

  it('never produces a non-integer', () => {
    fc.assert(
      fc.property(
        anyLength,
        fc.double({ min: -100, max: 100, noNaN: true }),
        (len, f) => {
          expect(Number.isSafeInteger(scaleLength(len, f))).toBe(true);
        },
      ),
    );
  });

  it('subtracts and clamps', () => {
    expect(subLengths(feet(10), inches(6))).toBe(3840 - 192);
    expect(clampLength(feet(20), feet(1), feet(10))).toBe(feet(10));
    expect(clampLength(feet(0), feet(1), feet(10))).toBe(feet(1));
    expect(() => clampLength(feet(2), feet(10), feet(1))).toThrow(GeometryError);
  });

  it('rejects division by zero and non-finite scales', () => {
    expect(() => divideLength(feet(1), 0)).toThrow(GeometryError);
    expect(() => scaleLength(feet(1), Number.NaN)).toThrow(GeometryError);
  });

  it('snaps to an increment', () => {
    expect(roundToNearest(inches(5.6), inches(1))).toBe(inches(6));
    expect(roundToNearest(inches(5.4), inches(1))).toBe(inches(5));
    expect(roundToNearest(length(7), inches(16))).toBe(0);
    expect(() => roundToNearest(inches(5), length(0))).toThrow(GeometryError);
  });
});

describe('area', () => {
  it('converts Length² to square feet', () => {
    expect(toSquareFeet(multiplyLengths(feet(1), feet(1)))).toBe(1);
    expect(toSquareFeet(multiplyLengths(feet(10), feet(7)))).toBe(70);
  });

  it('resolves the R310 threshold without float drift', () => {
    // 5.7 sq ft is 820.8 sq in. A 20" x 41" opening is 820 sq in — just under.
    const justUnder = multiplyLengths(inches(20), inches(41));
    expect(toSquareFeet(justUnder)).toBeLessThan(5.7);
    const justOver = multiplyLengths(inches(20), inches(41.0625));
    expect(toSquareFeet(justOver)).toBeGreaterThan(5.7);
  });

  it('formats square feet', () => {
    expect(formatSquareFeet(multiplyLengths(feet(10), feet(7)))).toBe('70.0 sq ft');
    expect(formatSquareFeet(area(0))).toBe('0.0 sq ft');
  });
});

describe('formatting', () => {
  it('writes architectural notation', () => {
    expect(formatFeetInches(feetInches(12, 6, 1, 2))).toBe(`12'-6 1/2"`);
    expect(formatFeetInches(feet(12))).toBe(`12'-0"`);
    expect(formatFeetInches(length(0))).toBe(`0'-0"`);
    expect(formatFeetInches(inches(6))).toBe(`0'-6"`);
    expect(formatFeetInches(feetInches(-12, 6))).toBe(`-12'-6"`);
  });

  it('always writes the whole-inch part in feet-inches notation', () => {
    // `1'-11/32"` reads as an inch count on a drawing and parses back as 1'-1 1/32".
    expect(formatFeetInches(length(395))).toBe(`1'-0 11/32"`);
    expect(parseLength(formatFeetInches(length(395)))).toBe(length(395));
    expect(formatFeetInches(length(11))).toBe(`0'-0 11/32"`);
  });

  it('reduces fractions to lowest terms', () => {
    expect(formatInches(length(1))).toBe(`1/32"`);
    expect(formatInches(length(2))).toBe(`1/16"`);
    expect(formatInches(length(8))).toBe(`1/4"`);
    expect(formatInches(length(24))).toBe(`3/4"`);
    expect(formatInches(inches(3.5))).toBe(`3 1/2"`);
    expect(formatInches(inches(-3.5))).toBe(`-3 1/2"`);
  });

  it('offers the other display formats', () => {
    expect(formatDecimalFeet(feetInches(12, 6))).toBe(`12.50'`);
    expect(formatLength(feet(2), 'mm')).toBe('610 mm');
    expect(formatLength(feet(2), 'in')).toBe(`24"`);
    expect(formatLength(feet(2), 'decimal-ft')).toBe(`2.00'`);
    expect(formatLength(feet(2))).toBe(`2'-0"`);
  });
});

describe('parsing', () => {
  it('accepts the notations a person actually types', () => {
    expect(parseLength(`12'`)).toBe(feet(12));
    expect(parseLength(`12'6"`)).toBe(feetInches(12, 6));
    expect(parseLength(`12'-6"`)).toBe(feetInches(12, 6));
    expect(parseLength(`12' 6 1/2"`)).toBe(feetInches(12, 6, 1, 2));
    expect(parseLength(`6 1/2"`)).toBe(inches(6.5));
    expect(parseLength(`1/2"`)).toBe(inches(0.5));
    expect(parseLength('6.5in')).toBe(inches(6.5));
    expect(parseLength('12.5ft')).toBe(feet(12.5));
    expect(parseLength('2400mm')).toBe(millimeters(2400));
    expect(parseLength('2.4m')).toBe(millimeters(2400));
    expect(parseLength('96')).toBe(inches(96));
    expect(parseLength(`-6 1/2"`)).toBe(inches(-6.5));
    expect(parseLength('  12ft  ')).toBe(feet(12));
  });

  it('does not split a bare fraction into a whole part and a fraction', () => {
    // The separator between whole inches and the fraction is mandatory: without it,
    // a backtracking match reads `11/32` as `1` + `1/32` and loses a whole inch.
    expect(parseLength(`11/32"`)).toBe(length(11));
    expect(parseLength(`3/32"`)).toBe(length(3));
    expect(parseLength(`15/16"`)).toBe(length(30));
    expect(parseLength(`1 11/32"`)).toBe(length(43));
    expect(parseLength(`12'-0 11/32"`)).toBe(length(12 * 384 + 11));
  });

  it('round-trips its own formatting', () => {
    fc.assert(
      fc.property(fc.integer({ min: -500_000, max: 500_000 }), (raw) => {
        const original = length(raw);
        expect(parseLength(formatFeetInches(original))).toBe(original);
        expect(parseLength(formatInches(original))).toBe(original);
      }),
    );
  });

  it('rejects nonsense', () => {
    expect(() => parseLength('')).toThrow(LengthParseError);
    expect(() => parseLength('   ')).toThrow(LengthParseError);
    expect(() => parseLength('banana')).toThrow(LengthParseError);
    expect(() => parseLength('-')).toThrow(LengthParseError);
    expect(() => parseLength(`6 1/0"`)).toThrow(LengthParseError);
    expect(tryParseLength('banana')).toBeNull();
    expect(tryParseLength(`12'6"`)).toBe(feetInches(12, 6));
  });
});
