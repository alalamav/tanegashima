/**
 * Fixed-column parsers for JMA "genbo" (原簿 / original-record) tide files.
 *
 * Format reference: https://ds.data.jma.go.jp/kaiyou/db/tide/genbo/format.html
 *
 * These files are column-oriented, NOT whitespace-delimited: adjacent values
 * touch each other ("4103763453223133203413704004244364364264093923783733773..."),
 * so every field must be sliced by its documented column range. Splitting on
 * spaces silently merges values and is the single most likely way to corrupt
 * this dataset.
 *
 *   hry1999MMTJ.txt — observed hourly sea level, cm above the observation datum
 *     cols   1– 72  24 x 3-char hourly values, 00–23 h JST
 *     cols  73– 78  YYMMDD, space-padded (e.g. "9910 1" = 1999-10-01)
 *     cols  79– 80  station code, "TJ"
 *     cols  81–108  up to 4 high waters, 7 chars each: HH MM CCC
 *     cols 109–136  up to 4 low waters,  7 chars each: HH MM CCC
 *     "9999999" in an extremum slot means "no such extremum this day".
 *     An all-blank field means the value is missing.
 *     Every line is exactly 136 characters.
 *
 *   dep1999MMTJ.txt — hourly anomaly (observed minus astronomical tide), cm
 *     cols   1– 96  24 x 4-char hourly values, 00–23 h JST
 *     cols  97–104  YYYYMMDD
 *     cols 105–106  station code, "TJ"
 *     Every line is exactly 106 characters.
 */

export const HRY_LINE_LENGTH = 136;
export const DEP_LINE_LENGTH = 106;
export const NO_EXTREMUM = '9999999';

/** One high or low water, as recorded (JST). */
export interface Extremum {
  /** Hour of day, JST, 0–23. */
  hour: number;
  /** Minute, 0–59. */
  minute: number;
  /** Sea level in cm above the observation datum. */
  cm: number;
}

/** One day of the `hry` file. */
export interface HryDay {
  /** Calendar date in JST, ISO "YYYY-MM-DD". */
  dateJst: string;
  /** 24 hourly observed values in cm above datum; `null` where the file is blank. */
  hourly: Array<number | null>;
  highs: Extremum[];
  lows: Extremum[];
}

/** One day of the `dep` file. */
export interface DepDay {
  dateJst: string;
  /** 24 hourly anomalies in cm; `null` where the file is blank. */
  hourly: Array<number | null>;
}

export class JmaParseError extends Error {
  constructor(message: string, readonly context: Record<string, unknown> = {}) {
    super(`${message} ${JSON.stringify(context)}`);
    this.name = 'JmaParseError';
  }
}

/** Slice a 1-based, inclusive column range, the way the JMA format document numbers them. */
export function columns(line: string, start1: number, length: number): string {
  return line.slice(start1 - 1, start1 - 1 + length);
}

/**
 * Parse a fixed-width integer field. Blank (all spaces) is a missing value and
 * returns `null`. A leading minus sign inside the field is honoured, so " -10"
 * and "-10" both parse to -10. Anything else is a hard error: a field we cannot
 * read is never silently treated as missing.
 */
export function parseIntField(field: string, context: Record<string, unknown>): number | null {
  if (field.trim() === '') return null;
  if (!/^\s*[-+]?\d+\s*$/.test(field)) {
    throw new JmaParseError('unreadable numeric field', { ...context, field });
  }
  return Number.parseInt(field.trim(), 10);
}

/** Split a file into non-empty lines, tolerating CRLF and a trailing newline. */
export function toLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

function assertLineLength(line: string, expected: number, context: Record<string, unknown>): void {
  if (line.length !== expected) {
    throw new JmaParseError('unexpected line length', {
      ...context,
      expected,
      actual: line.length,
    });
  }
}

/** Two-digit JMA year: 99 -> 1999. The archive only reaches back to 1900. */
function expandYear(yy: number): number {
  return yy < 50 ? 2000 + yy : 1900 + yy;
}

function isoDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseExtremumBlock(
  line: string,
  start1: number,
  context: Record<string, unknown>,
): Extremum[] {
  const out: Extremum[] = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const base = start1 + slot * 7;
    const raw = columns(line, base, 7);
    if (raw === NO_EXTREMUM || raw.trim() === '') continue;
    const slotContext = { ...context, slot, raw };
    const hour = parseIntField(columns(line, base, 2), slotContext);
    const minute = parseIntField(columns(line, base + 2, 2), slotContext);
    const cm = parseIntField(columns(line, base + 4, 3), slotContext);
    if (hour === null || minute === null || cm === null) continue;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new JmaParseError('extremum time out of range', { ...slotContext, hour, minute });
    }
    out.push({ hour, minute, cm });
  }
  return out;
}

/** Parse one `hry1999MMTJ.txt` file. */
export function parseHry(text: string, source = 'hry'): HryDay[] {
  const lines = toLines(text);
  return lines.map((line, index) => {
    const context = { source, line: index + 1 };
    assertLineLength(line, HRY_LINE_LENGTH, context);

    const hourly: Array<number | null> = [];
    for (let hour = 0; hour < 24; hour += 1) {
      hourly.push(parseIntField(columns(line, 1 + hour * 3, 3), { ...context, hour }));
    }

    const yy = parseIntField(columns(line, 73, 2), context);
    const mm = parseIntField(columns(line, 75, 2), context);
    const dd = parseIntField(columns(line, 77, 2), context);
    if (yy === null || mm === null || dd === null) {
      throw new JmaParseError('missing date field', context);
    }
    const station = columns(line, 79, 2);
    if (station !== 'TJ') {
      throw new JmaParseError('unexpected station code', { ...context, station });
    }

    return {
      dateJst: isoDate(expandYear(yy), mm, dd),
      hourly,
      highs: parseExtremumBlock(line, 81, { ...context, kind: 'high' }),
      lows: parseExtremumBlock(line, 109, { ...context, kind: 'low' }),
    };
  });
}

/** Parse one `dep1999MMTJ.txt` file. */
export function parseDep(text: string, source = 'dep'): DepDay[] {
  const lines = toLines(text);
  return lines.map((line, index) => {
    const context = { source, line: index + 1 };
    assertLineLength(line, DEP_LINE_LENGTH, context);

    const hourly: Array<number | null> = [];
    for (let hour = 0; hour < 24; hour += 1) {
      hourly.push(parseIntField(columns(line, 1 + hour * 4, 4), { ...context, hour }));
    }

    const yyyy = parseIntField(columns(line, 97, 4), context);
    const mm = parseIntField(columns(line, 101, 2), context);
    const dd = parseIntField(columns(line, 103, 2), context);
    if (yyyy === null || mm === null || dd === null) {
      throw new JmaParseError('missing date field', context);
    }
    const station = columns(line, 105, 2);
    if (station !== 'TJ') {
      throw new JmaParseError('unexpected station code', { ...context, station });
    }

    return { dateJst: isoDate(yyyy, mm, dd), hourly };
  });
}

/** Count blank hourly slots, the file's own "missing" marker. */
export function countMissing(days: Array<{ hourly: Array<number | null> }>): number {
  return days.reduce(
    (total, day) => total + day.hourly.filter((value) => value === null).length,
    0,
  );
}

/**
 * Daily range (max - min of the hourly observed values), skipping days with too
 * few readings to be meaningful. JMA's own daily statistics use a similar rule.
 */
export function dailyRange(day: HryDay, minimumValues = 19): number | null {
  const values = day.hourly.filter((value): value is number => value !== null);
  if (values.length < minimumValues) return null;
  return Math.max(...values) - Math.min(...values);
}
