import { GeometryError, LengthParseError } from './errors.js';

/**
 * The canonical unit of length: an integer count of 1/32 inch.
 *
 * Why 1/32": floats accumulate error across offsets, boolean operations, and wall joins
 * until a room loop fails to close; 1/32" represents every dimension US residential
 * construction actually uses exactly (3-1/2" stud, 16" o.c., 7-3/4" riser); and integer
 * equality makes snapping and dedup trivial.
 *
 * Convert at the UI boundary and nowhere else.
 */
export type Length = number & { readonly __brand: 'Length' };

/** An area in Length² — that is, in (1/32")². May be a half-integer (shoelace / 2). */
export type Area = number & { readonly __brand: 'Area' };

export const UNITS_PER_INCH = 32;
export const UNITS_PER_FOOT = 384;
export const MM_PER_INCH = 25.4;

/** Length² per square foot: 384². */
export const UNITS2_PER_SQUARE_FOOT = UNITS_PER_FOOT * UNITS_PER_FOOT;
/** Length² per square inch: 32². */
export const UNITS2_PER_SQUARE_INCH = UNITS_PER_INCH * UNITS_PER_INCH;

export const ZERO_LENGTH = 0 as Length;
export const ZERO_AREA = 0 as Area;

/** True when `value` is a valid raw Length: a safe integer count of 1/32". */
export function isLength(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Wrap a raw count of 1/32" as a Length. Throws unless the value is a safe integer —
 * this is the guard that keeps floats from leaking into model space.
 */
export function length(units: number): Length {
  if (!Number.isSafeInteger(units)) {
    throw new GeometryError(
      'geometry.non-integer-length',
      `Length must be a safe integer count of 1/32"; got ${String(units)}.`,
    );
  }
  return units as Length;
}

/** Wrap a raw count of (1/32")² as an Area. Half-integers are allowed. */
export function area(units2: number): Area {
  if (!Number.isFinite(units2)) {
    throw new GeometryError(
      'geometry.non-finite-area',
      `Area must be finite; got ${String(units2)}.`,
    );
  }
  return units2 as Area;
}

// ---------------------------------------------------------------------------
// Construction from human units. Every constructor here rounds to the nearest
// 1/32" — this is the UI boundary, and it is the only place rounding is allowed.
// ---------------------------------------------------------------------------

function roundToUnits(value: number, unitsPer: number, what: string): Length {
  if (!Number.isFinite(value)) {
    throw new GeometryError(
      'geometry.non-finite-length',
      `${what} must be finite; got ${String(value)}.`,
    );
  }
  return length(Math.round(value * unitsPer));
}

export function inches(value: number): Length {
  return roundToUnits(value, UNITS_PER_INCH, 'Inches');
}

export function feet(value: number): Length {
  return roundToUnits(value, UNITS_PER_FOOT, 'Feet');
}

export function millimeters(value: number): Length {
  return roundToUnits(value / MM_PER_INCH, UNITS_PER_INCH, 'Millimeters');
}

export function meters(value: number): Length {
  return millimeters(value * 1000);
}

/**
 * Build a length from feet, inches, and a fraction — `feetInches(12, 6, 1, 2)` is
 * 12'-6 1/2". Negative results are expressed by a negative `ft`, or by negating the
 * result; mixed signs across arguments are rejected because they are always a bug.
 */
export function feetInches(ft: number, inch = 0, numerator = 0, denominator = 1): Length {
  if (denominator <= 0 || !Number.isFinite(denominator)) {
    throw new GeometryError(
      'geometry.bad-fraction',
      `Fraction denominator must be positive; got ${String(denominator)}.`,
    );
  }
  if (inch < 0 || numerator < 0) {
    throw new GeometryError(
      'geometry.mixed-sign-length',
      'Inches and fraction must be non-negative; put the sign on feet.',
    );
  }
  const magnitude =
    Math.abs(ft) * UNITS_PER_FOOT + (inch + numerator / denominator) * UNITS_PER_INCH;
  const signed = ft < 0 || Object.is(ft, -0) ? -magnitude : magnitude;
  return length(Math.round(signed));
}

/** True when `value` inches lands exactly on a 1/32" boundary. */
export function isExactInches(value: number): boolean {
  return Number.isInteger(value * UNITS_PER_INCH);
}

// ---------------------------------------------------------------------------
// Conversion out. Display only.
// ---------------------------------------------------------------------------

export function toInches(len: Length): number {
  return len / UNITS_PER_INCH;
}

export function toFeet(len: Length): number {
  return len / UNITS_PER_FOOT;
}

export function toMillimeters(len: Length): number {
  return (len / UNITS_PER_INCH) * MM_PER_INCH;
}

export function toSquareInches(a: Area): number {
  return a / UNITS2_PER_SQUARE_INCH;
}

export function toSquareFeet(a: Area): number {
  return a / UNITS2_PER_SQUARE_FOOT;
}

// ---------------------------------------------------------------------------
// Arithmetic that preserves the brand. `a + b` on two Lengths is integer-safe but
// widens to number, so these exist to keep the type without a cast at every call.
// ---------------------------------------------------------------------------

export function addLengths(a: Length, b: Length): Length {
  return (a + b) as Length;
}

export function subLengths(a: Length, b: Length): Length {
  return (a - b) as Length;
}

export function sumLengths(lengths: readonly Length[]): Length {
  let total = 0;
  for (const len of lengths) total += len;
  return length(total);
}

export function negateLength(a: Length): Length {
  return (0 - a) as Length;
}

export function absLength(a: Length): Length {
  return Math.abs(a) as Length;
}

export function minLength(a: Length, b: Length): Length {
  return (a < b ? a : b) as Length;
}

export function maxLength(a: Length, b: Length): Length {
  return (a > b ? a : b) as Length;
}

export function clampLength(value: Length, low: Length, high: Length): Length {
  if (low > high) {
    throw new GeometryError(
      'geometry.bad-clamp-range',
      `clampLength called with low (${String(low)}) above high (${String(high)}).`,
    );
  }
  return minLength(maxLength(value, low), high);
}

/** Scale a length by a real factor, rounding to the nearest 1/32". */
export function scaleLength(a: Length, factor: number): Length {
  if (!Number.isFinite(factor)) {
    throw new GeometryError(
      'geometry.non-finite-scale',
      `Scale factor must be finite; got ${String(factor)}.`,
    );
  }
  return length(Math.round(a * factor));
}

/** Divide a length by a real divisor, rounding to the nearest 1/32". */
export function divideLength(a: Length, divisor: number): Length {
  if (divisor === 0) {
    throw new GeometryError('geometry.divide-by-zero', 'Cannot divide a length by zero.');
  }
  return scaleLength(a, 1 / divisor);
}

/** Multiply two lengths into an Area. */
export function multiplyLengths(a: Length, b: Length): Area {
  return (a * b) as Area;
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

function requirePositiveIncrement(increment: Length): void {
  if (increment <= 0) {
    throw new GeometryError(
      'geometry.bad-increment',
      `Snap increment must be positive; got ${String(increment)}.`,
    );
  }
}

export function roundToNearest(value: Length, increment: Length): Length {
  requirePositiveIncrement(increment);
  return length(Math.round(value / increment) * increment);
}

export function floorToNearest(value: Length, increment: Length): Length {
  requirePositiveIncrement(increment);
  return length(Math.floor(value / increment) * increment);
}

export function ceilToNearest(value: Length, increment: Length): Length {
  requirePositiveIncrement(increment);
  return length(Math.ceil(value / increment) * increment);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** Split a magnitude in units into whole inches and a reduced 1/32 fraction. */
function splitInches(units: number): {
  whole: number;
  numerator: number;
  denominator: number;
} {
  const whole = Math.floor(units / UNITS_PER_INCH);
  const remainder = units - whole * UNITS_PER_INCH;
  if (remainder === 0) return { whole, numerator: 0, denominator: 1 };
  const divisor = gcd(remainder, UNITS_PER_INCH);
  return {
    whole,
    numerator: remainder / divisor,
    denominator: UNITS_PER_INCH / divisor,
  };
}

function formatInchPart(units: number, alwaysShowWholeInches: boolean): string {
  const { whole, numerator, denominator } = splitInches(units);
  if (numerator === 0) return String(whole);
  const fraction = `${String(numerator)}/${String(denominator)}`;
  if (whole === 0 && !alwaysShowWholeInches) return fraction;
  return `${String(whole)} ${fraction}`;
}

/**
 * Architectural notation: `12'-6 1/2"`. The whole-inch part is always written, even
 * when it is zero — `1'-0 11/32"`, never `1'-11/32"`, which reads as an inch count on
 * a drawing and is ambiguous to parse back.
 */
export function formatFeetInches(len: Length): string {
  const sign = len < 0 ? '-' : '';
  const magnitude = Math.abs(len);
  const wholeFeet = Math.floor(magnitude / UNITS_PER_FOOT);
  const remainder = magnitude - wholeFeet * UNITS_PER_FOOT;
  return `${sign}${String(wholeFeet)}'-${formatInchPart(remainder, true)}"`;
}

/** Inches with a fraction: `6 1/2"`. Used where feet would be noise. */
export function formatInches(len: Length): string {
  const sign = len < 0 ? '-' : '';
  return `${sign}${formatInchPart(Math.abs(len), false)}"`;
}

export function formatDecimalFeet(len: Length, fractionDigits = 2): string {
  return `${toFeet(len).toFixed(fractionDigits)}'`;
}

export function formatMillimeters(len: Length, fractionDigits = 0): string {
  return `${toMillimeters(len).toFixed(fractionDigits)} mm`;
}

export function formatSquareFeet(a: Area, fractionDigits = 1): string {
  return `${toSquareFeet(a).toFixed(fractionDigits)} sq ft`;
}

export type LengthFormat = 'ft-in' | 'in' | 'decimal-ft' | 'mm';

export function formatLength(len: Length, format: LengthFormat = 'ft-in'): string {
  switch (format) {
    case 'ft-in':
      return formatFeetInches(len);
    case 'in':
      return formatInches(len);
    case 'decimal-ft':
      return formatDecimalFeet(len);
    case 'mm':
      return formatMillimeters(len);
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const METRIC_RE = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/i;
const FEET_PREFIX_RE = /^(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet)/i;
const INCH_SUFFIX_RE = /(?:"|in\.?|inch|inches)$/i;

/**
 * Whole inches and a fraction, separated by whitespace: `6 1/2`.
 *
 * The separator is mandatory. Without it `11/32` splits as `1` + `1/32` under a
 * backtracking match, which silently turns 11/32" into 1-1/32" — a 1" error in a
 * dimension a person typed correctly.
 */
const WHOLE_AND_FRACTION_RE = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/;
const FRACTION_ONLY_RE = /^(\d+)\s*\/\s*(\d+)$/;
const DECIMAL_ONLY_RE = /^\d+(?:\.\d+)?$/;

/** Parse the inch portion of a typed length, in inches. An empty string is zero. */
function parseInchExpression(body: string, original: string): number {
  const text = body.replace(INCH_SUFFIX_RE, '').trim();
  if (text === '') return 0;

  const mixed = WHOLE_AND_FRACTION_RE.exec(text);
  if (mixed) {
    const [, whole, numerator, denominator] = mixed;
    const den = Number(denominator);
    if (den === 0) throw new LengthParseError(original, 'fraction denominator is zero');
    return Number(whole) + Number(numerator) / den;
  }

  const fraction = FRACTION_ONLY_RE.exec(text);
  if (fraction) {
    const [, numerator, denominator] = fraction;
    const den = Number(denominator);
    if (den === 0) throw new LengthParseError(original, 'fraction denominator is zero');
    return Number(numerator) / den;
  }

  if (DECIMAL_ONLY_RE.test(text)) return Number(text);

  throw new LengthParseError(original, `cannot read "${text}" as inches`);
}

/**
 * Parse a typed length. Accepts `12'`, `12'6"`, `12'-6 1/2"`, `6 1/2"`, `6.5in`,
 * `1/2"`, `2400mm`, `2.4m`, and a bare number (interpreted as inches).
 *
 * Rounds to the nearest 1/32" like every other constructor. Throws LengthParseError.
 */
export function parseLength(text: string): Length {
  const trimmed = text.trim();
  if (trimmed === '') throw new LengthParseError(text, 'empty input');

  const negative = trimmed.startsWith('-');
  const body = (negative ? trimmed.slice(1) : trimmed).trim();
  if (body === '') throw new LengthParseError(text, 'no value after sign');

  const apply = (units: Length): Length => (negative ? negateLength(units) : units);

  const metric = METRIC_RE.exec(body);
  if (metric) {
    const [, value, unit] = metric;
    const scale =
      unit?.toLowerCase() === 'm' ? 1000 : unit?.toLowerCase() === 'cm' ? 10 : 1;
    return apply(millimeters(Number(value) * scale));
  }

  const feetMatch = FEET_PREFIX_RE.exec(body);
  if (feetMatch) {
    const [matched, feetText] = feetMatch;
    // The separator between feet and inches may be a hyphen, whitespace, or nothing.
    const rest = body.slice(matched.length).replace(/^[-\s]+/, '');
    const totalInches = parseInchExpression(rest, text);
    const units = Number(feetText) * UNITS_PER_FOOT + totalInches * UNITS_PER_INCH;
    return apply(length(Math.round(units)));
  }

  const hasInchMarker = INCH_SUFFIX_RE.test(body);
  const looksLikeInches =
    hasInchMarker ||
    FRACTION_ONLY_RE.test(body) ||
    WHOLE_AND_FRACTION_RE.test(body) ||
    DECIMAL_ONLY_RE.test(body);

  if (!looksLikeInches) throw new LengthParseError(text, 'unrecognised format');
  return apply(inches(parseInchExpression(body, text)));
}

export function tryParseLength(text: string): Length | null {
  try {
    return parseLength(text);
  } catch (error: unknown) {
    if (error instanceof LengthParseError || error instanceof GeometryError) return null;
    throw error;
  }
}
