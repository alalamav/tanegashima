/**
 * Least-squares harmonic fit of a tide signal, used ONLY to fill gaps.
 *
 * The fit is a constant plus six sinusoids at fixed, known astronomical
 * frequencies. We solve for the amplitude pair (a_k, b_k) of each constituent:
 *
 *   s(t) ~= a0 + sum_k [ a_k cos(w_k t) + b_k sin(w_k t) ]
 *
 * which is linear in the unknowns, so one normal-equation solve gives the exact
 * least-squares optimum. (Fitting amplitude and phase directly would be
 * non-linear; the cos/sin pair is the standard reparameterisation, and
 * amplitude = hypot(a,b), phase = atan2(-b,a).)
 *
 * Why these six: two constituents can only be separated if the record is longer
 * than their Rayleigh period 1/|f1 - f2|. Sep 1 – Dec 31 1999 is 122 days, which
 * separates M2/S2/N2 and K1/O1/Q1 comfortably. K2 (vs S2) and P1 (vs K1) need
 * about 183 days, so including them would trade a real signal for an
 * unidentifiable one; they are left out on purpose.
 */

/** Angular speed in degrees per mean solar hour (Doodson/Schureman values). */
export const CONSTITUENT_SPEEDS_DEG_PER_HOUR = {
  M2: 28.9841042, // principal lunar semidiurnal
  S2: 30.0,       // principal solar semidiurnal
  N2: 28.4397295, // larger lunar elliptic semidiurnal
  K1: 15.0410686, // lunisolar diurnal
  O1: 13.9430356, // principal lunar diurnal
  Q1: 13.3986609, // larger lunar elliptic diurnal
} as const;

export type ConstituentName = keyof typeof CONSTITUENT_SPEEDS_DEG_PER_HOUR;

export const DEFAULT_CONSTITUENTS: ConstituentName[] = ['M2', 'S2', 'N2', 'K1', 'O1', 'Q1'];

/** Rayleigh criterion: hours of record needed to separate two speeds (deg/h). */
export function rayleighHours(speedA: number, speedB: number): number {
  return 360 / Math.abs(speedA - speedB);
}

export interface Constituent {
  name: ConstituentName;
  speedDegPerHour: number;
  /** cos coefficient, in the units of the input signal. */
  a: number;
  /** sin coefficient. */
  b: number;
  /** hypot(a, b) — the constituent's amplitude. */
  amplitude: number;
  /** Phase lag in degrees, such that the term equals amplitude * cos(w t - phase). */
  phaseDeg: number;
}

export interface HarmonicFit {
  /** Mean level, in the units of the input signal. */
  mean: number;
  constituents: Constituent[];
  /** Root-mean-square of (observed - fitted) over the fitted samples. */
  residualRms: number;
  /** Number of samples that entered the fit. */
  sampleCount: number;
  /** Fraction of variance explained, 1 - SS_res / SS_tot. */
  rSquared: number;
  /** Evaluate the fitted series at an arbitrary hour index (may be fractional). */
  evaluate(hour: number): number;
}

/**
 * Solve A x = b for a symmetric positive-definite A by Gauss-Jordan elimination
 * with partial pivoting. The design matrix here is 13x13, so a direct solve is
 * both exact enough and trivially auditable.
 */
export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  // Work on an augmented copy so the caller's arrays are untouched.
  const m = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error(`harmonic fit: singular normal matrix at column ${col}`);
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const diagonal = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= diagonal;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row) => row[n]);
}

export interface HarmonicSample {
  /** Hour index from the series origin; integers for hourly data. */
  hour: number;
  value: number;
}

/**
 * Fit `mean + sum(constituents)` to the given samples by ordinary least squares.
 * Missing hours are simply absent from `samples`; the fit does not need an even
 * grid.
 */
export function fitHarmonic(
  samples: HarmonicSample[],
  constituentNames: ConstituentName[] = DEFAULT_CONSTITUENTS,
): HarmonicFit {
  const speeds = constituentNames.map(
    (name) => (CONSTITUENT_SPEEDS_DEG_PER_HOUR[name] * Math.PI) / 180,
  );
  const terms = 1 + speeds.length * 2;
  if (samples.length < terms * 4) {
    throw new Error(
      `harmonic fit: ${samples.length} samples is too few for ${terms} free parameters`,
    );
  }

  // Build one basis row per sample: [1, cos(w1 t), sin(w1 t), cos(w2 t), ...].
  const basis = (hour: number): number[] => {
    const row = new Array<number>(terms);
    row[0] = 1;
    for (let k = 0; k < speeds.length; k += 1) {
      const angle = speeds[k] * hour;
      row[1 + k * 2] = Math.cos(angle);
      row[2 + k * 2] = Math.sin(angle);
    }
    return row;
  };

  // Accumulate the normal equations (A^T A) x = A^T y directly, so we never
  // materialise a 2928 x 13 matrix.
  const ata: number[][] = Array.from({ length: terms }, () => new Array<number>(terms).fill(0));
  const aty = new Array<number>(terms).fill(0);

  for (const sample of samples) {
    const row = basis(sample.hour);
    for (let i = 0; i < terms; i += 1) {
      aty[i] += row[i] * sample.value;
      for (let j = i; j < terms; j += 1) ata[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < terms; i += 1) {
    for (let j = 0; j < i; j += 1) ata[i][j] = ata[j][i];
  }

  const coefficients = solveLinearSystem(ata, aty);

  const evaluate = (hour: number): number => {
    const row = basis(hour);
    let total = 0;
    for (let i = 0; i < terms; i += 1) total += row[i] * coefficients[i];
    return total;
  };

  let sumSquaredResiduals = 0;
  let sumValues = 0;
  for (const sample of samples) {
    const residual = sample.value - evaluate(sample.hour);
    sumSquaredResiduals += residual * residual;
    sumValues += sample.value;
  }
  const meanValue = sumValues / samples.length;
  let sumSquaredTotal = 0;
  for (const sample of samples) {
    const deviation = sample.value - meanValue;
    sumSquaredTotal += deviation * deviation;
  }

  const constituents: Constituent[] = constituentNames.map((name, k) => {
    const a = coefficients[1 + k * 2];
    const b = coefficients[2 + k * 2];
    return {
      name,
      speedDegPerHour: CONSTITUENT_SPEEDS_DEG_PER_HOUR[name],
      a,
      b,
      amplitude: Math.hypot(a, b),
      // a cos(wt) + b sin(wt) = A cos(wt - phi) with phi = atan2(b, a).
      phaseDeg: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    };
  });

  return {
    mean: coefficients[0],
    constituents,
    residualRms: Math.sqrt(sumSquaredResiduals / samples.length),
    sampleCount: samples.length,
    rSquared: sumSquaredTotal === 0 ? 1 : 1 - sumSquaredResiduals / sumSquaredTotal,
    evaluate,
  };
}

/**
 * Linear interpolation across gaps in a sequence, with constant extrapolation at
 * the ends. Used for the anomaly (`dep`), which is weather-driven and smooth on
 * the scale of the gaps here; the astronomical part gets the harmonic fit
 * instead, because linear interpolation across 13 hours would flatten a whole
 * tidal cycle.
 */
export function interpolateGapsLinear(values: Array<number | null>): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(Number.NaN);
  const known: number[] = [];
  for (let i = 0; i < n; i += 1) if (values[i] !== null) known.push(i);
  if (known.length === 0) throw new Error('interpolateGapsLinear: no known values');

  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    if (value !== null) {
      out[i] = value;
      continue;
    }
    // Nearest known index on each side.
    let before = -1;
    let after = -1;
    for (const index of known) {
      if (index < i) before = index;
      else if (after === -1) after = index;
    }
    if (before === -1) out[i] = values[after] as number;
    else if (after === -1) out[i] = values[before] as number;
    else {
      const t = (i - before) / (after - before);
      out[i] = (values[before] as number) * (1 - t) + (values[after] as number) * t;
    }
  }
  return out;
}
