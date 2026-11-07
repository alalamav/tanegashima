/**
 * Shared shapes for the built data files, plus the sampling helpers that both
 * the build script and the browser use. Keeping the interpolators here means a
 * notch cut at an eruption instant uses exactly the same arithmetic as the
 * readout that reports the sea level at that instant.
 */

export const HOUR_MS = 3600 * 1000;

/** Signals available as the wall's height driver. */
export type SignalName = 'elev' | 'obs' | 'astro' | 'dep';

export interface SeriesWindow {
  /** First sample, ISO UTC. */
  startUtc: string;
  /** Last sample, ISO UTC. */
  endUtc: string;
  /** Number of hourly samples, inclusive of both ends. */
  hours: number;
  /** Elevation of the observation datum, cm, relative to Japan's height datum. */
  datumCm: number;
  /** True when the datum was read from JMA's month page rather than assumed. */
  datumVerified: boolean;
}

export interface SeriesArrays {
  /** ISO UTC timestamp per hour. */
  t: string[];
  /** Observed sea level, cm above the observation datum. */
  obs: number[];
  /** Anomaly: observed minus JMA's astronomical prediction, cm. */
  dep: number[];
  /** Astronomical tide on the same datum: obs - dep, cm. */
  astro: number[];
  /** Elevation above Japan's height datum: obs + datumCm, cm. */
  elev: number[];
  /**
   * Unwrapped moon phase, degrees. `phase[0]` is the wrapped phase at the first
   * sample (0 = new moon) and the value then increases by 360 per synodic month,
   * so it can drive both the angle and the radius of the spiral.
   */
  phase: number[];
  /** 1 where the hour was reconstructed rather than observed. */
  filled: number[];
}

export interface TideExtremum {
  utc: string;
  /** cm above the observation datum. */
  cm: number;
  kind: 'high' | 'low';
}

export interface Series {
  station: {
    code: string;
    nameEs: string;
    nameEn: string;
    nameJa: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  window: SeriesWindow;
  /** The window the site opens on: 26 Sep - 31 Dec 1999, per the brief. */
  defaultWindow: { startUtc: string; endUtc: string };
  arrays: SeriesArrays;
  /** High and low waters as recorded by JMA, for the timeline strip. */
  extremes: TideExtremum[];
  /** Quarter-phase instants inside the window. */
  moonPhases: Array<{ phase: number; utc: string }>;
}

export type EventPrecision = 'minute' | 'hour' | 'advisory' | 'day';

export interface VolcanoEvent {
  id: string;
  /** Event instant in UTC. For day precision, the start of that UTC day. */
  utc: string;
  precision: EventPrecision;
  labelEs: string;
  labelEn: string;
  /** Plume height in km above the summit, or null when not reported. */
  plumeKm: number | null;
  plumeRef: string;
  sourceUrl: string;
  notes: string;
  /** Fractional hour index into the series arrays. */
  hourIndex: number;
  /** Duration in hours: 0 for an instant, 24 for a day-precision event. */
  durationHours: number;
  /** Sampled series values at the event instant. */
  sampled: {
    elev: number;
    obs: number;
    astro: number;
    dep: number;
    phase: number;
    /** Wrapped phase, degrees, 0 = new moon. */
    phaseWrapped: number;
    illumination: number;
  };
  /** True when the instant falls outside the built window. */
  outsideWindow: boolean;
}

export interface BuildMeta {
  scriptVersion: string;
  builtAtUtc: string;
  inputs: Array<{
    path: string;
    url: string;
    retrievedUtc: string;
    sha256: string;
    bytes: number;
  }>;
  datumCm: number;
  datumSource: string;
  datumVerified: boolean;
  harmonicFit: {
    constituents: Array<{ name: string; amplitudeCm: number; phaseDeg: number; speedDegPerHour: number }>;
    meanCm: number;
    residualRmsCm: number;
    rSquared: number;
    sampleCount: number;
    fitWindowUtc: [string, string];
  };
  gaps: Array<{
    startUtc: string;
    endUtc: string;
    hours: number;
    method: string;
  }>;
  counts: {
    hryLines: Record<string, number>;
    depLines: Record<string, number>;
    missingHourly: Record<string, number>;
  };
  checks: Array<{ name: string; expected: string; actual: string; pass: boolean }>;
}

/** Hour index (possibly fractional) of a UTC instant within a series. */
export function hourIndexOf(series: Series, utc: string | Date): number {
  const start = Date.parse(series.window.startUtc);
  const when = typeof utc === 'string' ? Date.parse(utc) : utc.getTime();
  return (when - start) / HOUR_MS;
}

/** UTC instant of a (possibly fractional) hour index. */
export function utcOfHourIndex(series: Series, hourIndex: number): Date {
  return new Date(Date.parse(series.window.startUtc) + hourIndex * HOUR_MS);
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/** Linear sample of an evenly spaced array at a fractional index. */
export function sampleLinear(values: number[], index: number): number {
  const i0 = Math.floor(index);
  const frac = index - i0;
  const a = values[clampIndex(i0, values.length)];
  const b = values[clampIndex(i0 + 1, values.length)];
  return a + (b - a) * frac;
}

/**
 * Catmull-Rom (cubic) sample of an evenly spaced array at a fractional index.
 *
 * Used for sea level, where a straight chord between hourly samples visibly
 * flattens the crest of a tide: the curve passes through every sample and its
 * tangent at each one is the centred difference of its neighbours, which keeps
 * the notch depth at an eruption instant faithful to the tide's curvature.
 */
export function sampleCubic(values: number[], index: number): number {
  const i1 = Math.floor(index);
  const frac = index - i1;
  const p0 = values[clampIndex(i1 - 1, values.length)];
  const p1 = values[clampIndex(i1, values.length)];
  const p2 = values[clampIndex(i1 + 1, values.length)];
  const p3 = values[clampIndex(i1 + 2, values.length)];
  const t = frac;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    ((2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Pick a signal array by name. */
export function signalValues(series: Series, signal: SignalName): number[] {
  return series.arrays[signal];
}

export function signalLabel(signal: SignalName): { es: string; en: string; unit: string } {
  switch (signal) {
    case 'elev':
      return { es: 'elevación del mar', en: 'sea elevation', unit: 'cm' };
    case 'obs':
      return { es: 'nivel observado', en: 'observed level', unit: 'cm' };
    case 'astro':
      return { es: 'marea astronómica', en: 'astronomical tide', unit: 'cm' };
    case 'dep':
      return { es: 'anomalía', en: 'anomaly', unit: 'cm' };
  }
}

export interface SignalStats {
  min: number;
  max: number;
  mean: number;
  range: number;
}

export function signalStats(values: number[]): SignalStats {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let total = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    total += value;
  }
  return { min, max, mean: total / values.length, range: max - min };
}

/** Index range of a sub-window given as ISO dates, clamped to the series. */
export function windowRange(series: Series, startUtc: string, endUtc: string): [number, number] {
  const n = series.arrays.t.length;
  const a = Math.round(hourIndexOf(series, startUtc));
  const b = Math.round(hourIndexOf(series, endUtc));
  return [clampIndex(Math.min(a, b), n), clampIndex(Math.max(a, b), n)];
}
