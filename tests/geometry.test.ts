import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Series, VolcanoEvent } from '../src/data/series.js';
import { makeClock, resolveWindow } from '../src/geom/clock.js';
import {
  DEFAULT_PARAMS,
  FULL_WINDOW_PRESET,
  SHORT_WINDOW_PRESET,
  configHash,
  greenScale,
  paramsFromHash,
  paramsToHash,
  type Params,
} from '../src/geom/params.js';
import { buildSpiral, radiusAt } from '../src/geom/spiral.js';
import { notchDepth, NOTCH_EDGE_EPSILON } from '../src/geom/notches.js';
import {
  buildBaseDisc,
  buildNotchOverlay,
  buildWall,
  buildWallMesh,
  lowPassAlongArc,
  revolveSegments,
} from '../src/geom/wall.js';
import { checkManifold, checkNotchCoverage, measure, runChecks } from '../src/geom/validate.js';

const dataDir = resolve(import.meta.dirname, '../public/data');
const series = JSON.parse(readFileSync(resolve(dataDir, 'series.json'), 'utf8')) as Series;
const events = JSON.parse(readFileSync(resolve(dataDir, 'events.json'), 'utf8')) as VolcanoEvent[];

/**
 * The baseline for the spiral tests below: the brief's 97-day window at the
 * radii and the gain it was sized for. The app's own default is a revolved
 * vessel whose numbers are chosen for a radial tide, so these cases pin their
 * own window, radii and height rather than inheriting whatever the default
 * happens to be.
 */
const params: Params = {
  ...DEFAULT_PARAMS,
  ...FULL_WINDOW_PRESET,
  clockMode: 'synodic',
  r0: 30,
  r1: 140,
  hBase: 15,
  k: 0.25,
};

describe('built data', () => {
  it('holds 2928 hours of Sep–Dec 1999', () => {
    expect(series.arrays.t.length).toBe(2928);
    expect(series.arrays.t[0]).toBe('1999-08-31T15:00:00.000Z'); // 1 Sep 00 h JST
    expect(series.window.datumCm).toBe(-374.5);
    expect(series.window.datumVerified).toBe(true);
  });

  it('flags exactly the 41 reconstructed hours', () => {
    const filled = series.arrays.filled.reduce((a, b) => a + b, 0);
    expect(filled).toBe(41);
  });

  it('keeps elev = obs + datum and astro = obs - dep to the stored precision', () => {
    for (let i = 0; i < series.arrays.t.length; i += 97) {
      expect(series.arrays.elev[i]).toBeCloseTo(series.arrays.obs[i] + series.window.datumCm, 2);
      expect(series.arrays.astro[i]).toBeCloseTo(series.arrays.obs[i] - series.arrays.dep[i], 1);
    }
  });

  it('has a monotonic unwrapped phase spanning about 4.15 lunations', () => {
    const phase = series.arrays.phase;
    for (let i = 1; i < phase.length; i += 1) expect(phase[i]).toBeGreaterThan(phase[i - 1]);
    expect((phase[phase.length - 1] - phase[0]) / 360).toBeCloseTo(4.15, 1);
  });

  it('carries five events, all inside the window', () => {
    expect(events).toHaveLength(5);
    expect(events.every((event) => !event.outsideWindow)).toBe(true);
    expect(events.filter((event) => event.durationHours === 24).map((e) => e.id)).toEqual([
      'e1',
      'e4',
    ]);
  });
});

describe('clock', () => {
  it('spans about 3.25 turns in synodic mode over 26 Sep – 31 Dec', () => {
    const clock = makeClock(series, params);
    expect(clock.turns).toBeGreaterThan(3.1);
    expect(clock.turns).toBeLessThan(3.4);
  });

  it('doubles the turns in spring–neap mode', () => {
    const synodic = makeClock(series, params);
    const springNeap = makeClock(series, { ...params, clockMode: 'springNeap' });
    expect(springNeap.turns).toBeCloseTo(synodic.turns * 2, 6);
  });

  it('takes the turn count from the parameter in linear mode', () => {
    const clock = makeClock(series, { ...params, clockMode: 'linear', linearTurns: 2 });
    expect(clock.turns).toBeCloseTo(2, 9);
  });

  it('starts at 0 and reports the real lunar phase regardless of mode', () => {
    const clock = makeClock(series, { ...params, clockMode: 'linear' });
    expect(clock.thetaStart).toBe(0);
    // 9 Oct 1999 11:34 UTC was a new moon; the readout must say so even in
    // linear mode.
    const newMoonHour =
      (Date.parse('1999-10-09T11:34:00Z') - Date.parse(series.window.startUtc)) / 3_600_000;
    const wrapped = clock.wrappedDegAt(newMoonHour);
    expect(Math.min(wrapped, 360 - wrapped)).toBeLessThan(1);
  });

  it('refuses a window shorter than a day', () => {
    expect(() =>
      resolveWindow(series, {
        ...params,
        windowStartUtc: '1999-10-01T00:00:00Z',
        windowEndUtc: '1999-10-01T06:00:00Z',
      }),
    ).toThrow(/at least 24 hours/);
  });
});

describe('spiral', () => {
  const clock = makeClock(series, params);
  const spiral = buildSpiral(clock, params);

  it('resamples at the requested arc step', () => {
    const gaps: number[] = [];
    for (let i = 1; i < spiral.samples.length; i += 1) {
      gaps.push(spiral.samples[i].s - spiral.samples[i - 1].s);
    }
    const typical = gaps.filter((g) => g > 1e-3);
    for (const gap of typical) expect(gap).toBeLessThanOrEqual(params.arcStepMm + 1e-6);
  });

  it('grows the radius linearly from r0 to r1', () => {
    expect(radiusAt(clock.thetaStart, clock, params)).toBeCloseTo(params.r0, 9);
    expect(radiusAt(clock.thetaEnd, clock, params)).toBeCloseTo(params.r1, 9);
    const first = spiral.samples[0];
    const last = spiral.samples[spiral.samples.length - 1];
    expect(first.r).toBeCloseTo(params.r0, 1);
    expect(last.r).toBeCloseTo(params.r1, 1);
  });

  it('produces about 1.7 m of centerline at the default size', () => {
    expect(spiral.length).toBeGreaterThan(1500);
    expect(spiral.length).toBeLessThan(1900);
  });

  it('spaces the turns by about 34 mm', () => {
    expect(spiral.turnSpacing).toBeGreaterThan(30);
    expect(spiral.turnSpacing).toBeLessThan(38);
  });

  it('keeps every normal a unit vector pointing outward', () => {
    for (let i = 0; i < spiral.samples.length; i += 37) {
      const sample = spiral.samples[i];
      expect(Math.hypot(sample.nx, sample.ny)).toBeCloseTo(1, 6);
      const radial = Math.hypot(sample.x, sample.y);
      expect((sample.nx * sample.x + sample.ny * sample.y) / radial).toBeGreaterThan(0);
    }
  });

  it('increases the arc length monotonically with the hour index', () => {
    const { i0, i1 } = clock.window;
    let previous = -1;
    for (let hour = i0; hour <= i1; hour += 17) {
      const s = spiral.arcLengthAtHour(hour);
      expect(s).toBeGreaterThan(previous);
      previous = s;
    }
    expect(spiral.arcLengthAtHour(i1)).toBeCloseTo(spiral.length, 6);
  });

  it('inserts exact samples at requested arc positions', () => {
    const requested = [100, 500.25, 1000.5];
    const withExtras = buildSpiral(clock, params, requested);
    for (const s of requested) {
      expect(withExtras.samples.some((sample) => Math.abs(sample.s - s) < 1e-9)).toBe(true);
    }
  });
});

describe('notch depths', () => {
  it('scales an instant notch with the plume height', () => {
    const e3 = events.find((event) => event.id === 'e3')!;
    expect(e3.plumeKm).toBe(14);
    expect(notchDepth(e3, params)).toBeCloseTo(
      params.notchDepth0 + params.notchDepthPerKm * 14,
      9,
    );
  });

  it('gives an unknown plume the base depth', () => {
    const e5 = events.find((event) => event.id === 'e5')!;
    expect(e5.plumeKm).toBeNull();
    expect(notchDepth(e5, params)).toBe(params.notchDepth0);
  });

  it('halves the depth for a day-precision event', () => {
    const e1 = events.find((event) => event.id === 'e1')!;
    expect(notchDepth(e1, params)).toBe(params.notchDepth0 / 2);
  });
});

describe('wall', () => {
  const wall = buildWall(series, events, params);

  it('cuts one notch per event when the whole window is shown', () => {
    expect(wall.notches).toHaveLength(events.length);
    expect(wall.droppedEvents).toHaveLength(0);
    const coverage = checkNotchCoverage(wall, events);
    expect(coverage.complete).toBe(true);
  });

  it('puts the wall height at h_base where the signal is lowest', () => {
    const lowest = Math.min(...wall.undisturbed);
    expect(lowest).toBeCloseTo(params.hBase, 1);
  });

  it('spans k x range of height above h_base', () => {
    const highest = Math.max(...wall.undisturbed);
    // The arc stations do not land exactly on the hour of the highest water, so
    // the built wall reaches slightly under k x range rather than over it.
    const expected = params.k * wall.signal.range;
    expect(highest - params.hBase).toBeLessThanOrEqual(expected + 1e-6);
    expect(highest - params.hBase).toBeGreaterThan(expected - 0.5);
    // The brief estimated ~57 mm from the 228 cm largest DAILY range. The
    // window's full min-to-max range is larger (~270 cm), so the wall rises
    // ~68 mm above h_base.
    expect(highest - params.hBase).toBeGreaterThan(60);
    expect(highest - params.hBase).toBeLessThan(75);
    expect(wall.signal.range).toBeGreaterThan(260);
  });

  it('makes instant notches exactly notchWidth wide', () => {
    for (const notch of wall.notches) {
      if (notch.dayPrecision) continue;
      expect(notch.sEnd - notch.sStart).toBeCloseTo(params.notchWidth, 6);
    }
  });

  it('makes day-precision notches much wider and shallower', () => {
    const day = wall.notches.filter((notch) => notch.dayPrecision);
    expect(day.length).toBe(2);
    for (const notch of day) {
      // 24 h is only ~7 mm of arc on the innermost turn and ~30 mm on the
      // outermost, so a day notch is always wider than the 3 mm instant notch
      // but not by a fixed factor.
      expect(notch.sEnd - notch.sStart).toBeGreaterThan(params.notchWidth * 2);
      expect(notch.depth).toBe(params.notchDepth0 / 2);
    }
  });

  it('cuts only inside notches and nowhere else', () => {
    const inside = (s: number) =>
      wall.notches.some((notch) => s > notch.sStart && s < notch.sEnd);
    for (let i = 0; i < wall.spiral.samples.length; i += 1) {
      const s = wall.spiral.samples[i].s;
      if (!inside(s)) expect(wall.cut[i]).toBeCloseTo(0, 9);
    }
    expect(Math.max(...wall.cut)).toBeGreaterThan(1);
  });

  it('keeps notch sides vertical within the edge epsilon', () => {
    const samples = wall.spiral.samples;
    for (const notch of wall.notches) {
      const atStart = samples.findIndex((sample) => Math.abs(sample.s - notch.sStart) < 1e-9);
      expect(atStart).toBeGreaterThan(-1);
      const next = samples[atStart + 1];
      expect(next.s - notch.sStart).toBeCloseTo(NOTCH_EDGE_EPSILON, 6);
    }
  });
});

describe('mesh', () => {
  const wall = buildWall(series, events, params);
  const mesh = buildWallMesh(wall, params);
  const report = checkManifold(mesh);

  it('is watertight', () => {
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.degenerateTriangles).toBe(0);
    expect(report.watertight).toBe(true);
  });

  it('is a closed surface of genus 0 (Euler characteristic 2)', () => {
    expect(report.eulerCharacteristic).toBe(2);
  });

  it('faces outward, with a plausible clay volume', () => {
    expect(report.volumeMm3).toBeGreaterThan(0);
    // ~1.7 m of 6 mm wall, 15–75 mm tall: a few hundred cm^3.
    const litres = report.volumeMm3 / 1e6;
    expect(litres).toBeGreaterThan(0.2);
    expect(litres).toBeLessThan(0.8);
  });

  it('scales to green size by 1/(1 - shrinkage)', () => {
    const green = buildWallMesh(wall, params, greenScale(params));
    expect(green.volume / mesh.volume).toBeCloseTo(greenScale(params) ** 3, 4);
    expect(checkManifold(green).watertight).toBe(true);
  });

  it('builds a watertight base disc too', () => {
    const disc = buildBaseDisc(params);
    const discReport = checkManifold(disc);
    expect(discReport.watertight).toBe(true);
    expect(discReport.volumeMm3).toBeGreaterThan(0);
  });
});

describe('low-pass filter', () => {
  it('leaves a constant signal alone', () => {
    const flat = Float64Array.from({ length: 100 }, () => 7);
    const out = lowPassAlongArc(flat, 0.5, 5);
    for (const value of out) expect(value).toBeCloseTo(7, 9);
  });

  it('reduces the amplitude of a wavelength shorter than the window', () => {
    const fine = Float64Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.8));
    const out = lowPassAlongArc(fine, 0.5, 20);
    const amplitudeIn = Math.max(...fine) - Math.min(...fine);
    const amplitudeOut = Math.max(...out) - Math.min(...out);
    expect(amplitudeOut).toBeLessThan(amplitudeIn * 0.3);
  });

  it('is a no-op when the wavelength is below the sample step', () => {
    const values = Float64Array.from({ length: 10 }, (_, i) => i);
    expect(lowPassAlongArc(values, 0.5, 0)).toBe(values);
  });
});

describe('fabrication checks', () => {
  it('passes every check at the default parameters', () => {
    const wall = buildWall(series, events, params);
    const { checks, measures } = runChecks(wall, params);
    const failures = checks.filter((check) => check.level === 'fail');
    expect(failures.map((f) => f.id)).toEqual([]);
    expect(measures.greenOuterDiameterMm).toBeCloseTo(286 / (1 - 0.12), 0);
    expect(measures.tideWavelengthMm).toBeGreaterThan(5);
  });

  it('fails the kiln check when the piece is too big', () => {
    const wall = buildWall(series, events, { ...params, r1: 400 });
    const { checks } = runChecks(wall, { ...params, r1: 400 });
    expect(checks.find((check) => check.id === 'kiln')!.level).toBe('fail');
  });

  it('fails the turn-spacing check when the turns crowd together', () => {
    const crowded: Params = { ...params, clockMode: 'linear', linearTurns: 12 };
    const wall = buildWall(series, events, crowded);
    const { checks } = runChecks(wall, crowded);
    expect(checks.find((check) => check.id === 'turnSpacing')!.level).toBe('fail');
  });

  it('reports the measured values the brief estimated by hand', () => {
    const wall = buildWall(series, events, params);
    const m = measure(wall, params);
    expect(m.firedOuterDiameterMm).toBe(286);
    expect(m.turnSpacingMm).toBeGreaterThan(30);
    expect(m.turnSpacingMm).toBeLessThan(38);
    expect(m.centerlineLengthMm / 1000).toBeGreaterThan(1.5);
    expect(m.tideWavelengthMm).toBeGreaterThan(7);
    expect(m.tideWavelengthMm).toBeLessThan(12);
  });
});

describe('vase window preset', () => {
  const short: Params = { ...params, ...SHORT_WINDOW_PRESET, r0: 40, r1: 110 };

  it('keeps only the two October eruptions', () => {
    const wall = buildWall(series, events, short);
    expect(wall.notches.map((notch) => notch.eventId)).toEqual(['e2', 'e3']);
    expect(wall.droppedEvents.map((event) => event.id)).toEqual(['e1', 'e4', 'e5']);
    expect(checkNotchCoverage(wall, events).complete).toBe(true);
  });

  it('covers about a quarter of a turn in synodic mode', () => {
    const wall = buildWall(series, events, short);
    expect(wall.spiral.turns).toBeGreaterThan(0.2);
    expect(wall.spiral.turns).toBeLessThan(0.3);
  });

  it('still builds a watertight mesh', () => {
    const wall = buildWall(series, events, short);
    expect(checkManifold(buildWallMesh(wall, short)).watertight).toBe(true);
  });
});

describe('parameters', () => {
  it('round-trips through the URL hash', () => {
    const custom: Params = { ...params, r1: 180, k: 0.4, clockMode: 'springNeap', baseDisc: true };
    expect(paramsFromHash(paramsToHash(custom))).toEqual(custom);
  });

  it('omits defaults from the hash', () => {
    expect(paramsToHash(DEFAULT_PARAMS)).toBe('');
    expect(paramsFromHash('')).toEqual(DEFAULT_PARAMS);
  });

  it('ignores unknown and malformed keys', () => {
    expect(paramsFromHash('nonsense=1&r1=abc&k=0.3')).toEqual({ ...DEFAULT_PARAMS, k: 0.3 });
  });

  it('hashes the config stably and distinctly', () => {
    expect(configHash(params)).toBe(configHash({ ...params }));
    expect(configHash(params)).not.toBe(configHash({ ...params, r1: 141 }));
    expect(configHash(params)).toMatch(/^[0-9a-f]{8}$/);
  });
});


describe('circle mode', () => {
  // The site opens on the revolved form now, so the ring pins its own mode.
  const circle: Params = { ...DEFAULT_PARAMS, clockMode: 'circle' };

  it('closes the centerline into a ring', () => {
    const wall = buildWall(series, events, circle);
    expect(wall.spiral.closed).toBe(true);
    expect(wall.clock.closed).toBe(true);
  });

  it('is exactly one turn, whatever the window', () => {
    for (const patch of [{}, SHORT_WINDOW_PRESET, { windowEndUtc: '1999-10-26T00:00:00.000Z' }]) {
      const wall = buildWall(series, events, { ...circle, ...patch });
      expect(wall.clock.turns).toBe(1);
      expect(wall.spiral.turns).toBe(1);
    }
  });

  it('holds the radius at r₀ and ignores r₁ entirely', () => {
    const wall = buildWall(series, events, circle);
    for (let i = 0; i < wall.spiral.samples.length; i += 29) {
      // Resampling a circle by arc length cuts the corner by a micron or two.
      expect(wall.spiral.samples[i].r).toBeCloseTo(circle.r0, 3);
    }
    // r₁ moves, nothing about the ring does.
    const widened = buildWall(series, events, { ...circle, r1: 399 });
    expect(widened.spiral.length).toBeCloseTo(wall.spiral.length, 9);
    expect(measure(widened, { ...circle, r1: 399 }).firedOuterDiameterMm).toBe(
      measure(wall, circle).firedOuterDiameterMm,
    );
  });

  it('measures 2πr₀ around', () => {
    const wall = buildWall(series, events, circle);
    expect(wall.spiral.length).toBeCloseTo(2 * Math.PI * circle.r0, 0);
  });

  it('takes its outer diameter from r₀, not r₁', () => {
    const m = measure(buildWall(series, events, circle), circle);
    expect(m.firedOuterDiameterMm).toBe(2 * (circle.r0 + circle.wallThickness / 2));
  });

  it('builds a watertight closed tube — a torus, not a sphere', () => {
    const mesh = buildWallMesh(buildWall(series, events, circle), circle);
    const report = checkManifold(mesh);
    expect(report.watertight).toBe(true);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    // A tube bent into a ring has genus 1, so its Euler characteristic is 0.
    expect(report.eulerCharacteristic).toBe(0);
    expect(report.volumeMm3).toBeGreaterThan(0);
  });

  it('has no duplicated sample at the seam', () => {
    const wall = buildWall(series, events, circle);
    const first = wall.spiral.samples[0];
    const last = wall.spiral.samples[wall.spiral.samples.length - 1];
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(0.01);
    expect(wall.spiral.length - last.s).toBeGreaterThan(0);
  });

  it('wraps arc length round the seam', () => {
    const wall = buildWall(series, events, circle);
    const { length } = wall.spiral;
    // A whole lap round lands back where it started...
    const atStart = wall.spiral.sampleAtArcLength(0);
    const fullLap = wall.spiral.sampleAtArcLength(length);
    expect(fullLap.x).toBeCloseTo(atStart.x, 6);
    expect(fullLap.y).toBeCloseTo(atStart.y, 6);
    // ...and a lap plus a bit lands at that bit, rather than being clamped to
    // the end the way an open spiral would be.
    const past = wall.spiral.sampleAtArcLength(length + 5);
    const five = wall.spiral.sampleAtArcLength(5);
    expect(past.x).toBeCloseTo(five.x, 6);
    expect(past.y).toBeCloseTo(five.y, 6);
  });

  it('keeps every normal pointing outward from the centre', () => {
    const wall = buildWall(series, events, circle);
    for (let i = 0; i < wall.spiral.samples.length; i += 31) {
      const sample = wall.spiral.samples[i];
      const radial = Math.hypot(sample.x, sample.y);
      expect((sample.nx * sample.x + sample.ny * sample.y) / radial).toBeCloseTo(1, 2);
    }
  });

  it('carries the two October eruptions at the shipped window', () => {
    const wall = buildWall(series, events, circle);
    expect(wall.notches.map((notch) => notch.eventId)).toEqual(['e2', 'e3']);
    // The 7 October eruption is the one the piece is built around.
    expect(wall.notches.some((notch) => notch.eventId === 'e3')).toBe(true);
  });

  it('cuts one notch per event when the whole record is shown', () => {
    const wall = buildWall(series, events, { ...circle, ...FULL_WINDOW_PRESET });
    expect(wall.notches).toHaveLength(events.length);
    expect(wall.droppedEvents).toHaveLength(0);
  });

  it('drops the turn-spacing check, which a ring has no neighbour for', () => {
    const { checks } = runChecks(buildWall(series, events, circle), circle);
    expect(checks.map((check) => check.id)).not.toContain('turnSpacing');
    const spiralChecks = runChecks(buildWall(series, events, params), params).checks;
    expect(spiralChecks.map((check) => check.id)).toContain('turnSpacing');
  });

  it('fails nothing at the shipped numbers', () => {
    const { checks } = runChecks(buildWall(series, events, circle), circle);
    expect(checks.filter((check) => check.level === 'fail').map((c) => c.id)).toEqual([]);
  });
});


describe('cylinder mode: the revolved form', () => {
  const cylinder: Params = { ...DEFAULT_PARAMS };

  it('is what the site opens on', () => {
    expect(DEFAULT_PARAMS.clockMode).toBe('cylinder');
  });

  it('runs time up the axis, so arc length IS height', () => {
    const wall = buildWall(series, events, cylinder);
    expect(wall.clock.revolved).toBe(true);
    expect(wall.spiral.closed).toBe(false);
    for (const sample of wall.spiral.samples) {
      expect(sample.z).toBeCloseTo(sample.s, 9);
      // The path is the axis: the station's own radius never moves off r₀.
      expect(sample.r).toBeCloseTo(cylinder.r0, 9);
      // And it has no direction in plan at all.
      expect(Math.hypot(sample.tx, sample.ty)).toBe(0);
    }
    // Which makes the piece exactly as tall as the profile is long.
    expect(wall.totalHeightMm).toBeCloseTo(wall.spiral.length, 9);
    expect(wall.spiral.length).toBeCloseTo(cylinder.pitchMm * wall.clock.turns, 6);
  });

  it('puts the tide out of the circumference, not up the top', () => {
    const wall = buildWall(series, events, cylinder);
    const mesh = buildWallMesh(wall, cylinder);
    const crest = Math.max(...wall.undisturbed);

    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    let widest = 0;
    for (let v = 0; v < mesh.positions.length; v += 3) {
      const radius = Math.hypot(mesh.positions[v], mesh.positions[v + 2]);
      const height = mesh.positions[v + 1];
      if (height < lowest) lowest = height;
      if (height > highest) highest = height;
      if (radius > widest) widest = radius;
    }
    // The height is the record's own length, and nothing stands on top of it.
    expect(lowest).toBeCloseTo(0, 6);
    expect(highest).toBeCloseTo(wall.spiral.length, 1);
    // The width is r₀ plus the tide, which is where the tide now lives.
    expect(widest).toBeCloseTo(cylinder.r0 + crest, 1);
  });

  it('is the same shape on every side: a surface of revolution', () => {
    const wall = buildWall(series, events, cylinder);
    const mesh = buildWallMesh(wall, cylinder);
    const segments = revolveSegments(wall.spiral.samples.length);
    // Vertices are written station by station, two per segment, so one station
    // is one contiguous ring of the buffer.
    for (const station of [0, 97, 311, wall.spiral.samples.length - 1]) {
      const base = station * segments * 2;
      const first = base * 3;
      const outerRadius = Math.hypot(mesh.positions[first], mesh.positions[first + 2]);
      const height = mesh.positions[first + 1];
      for (let k = 0; k < segments; k += 1) {
        const at = (base + k * 2) * 3;
        expect(Math.hypot(mesh.positions[at], mesh.positions[at + 2])).toBeCloseTo(outerRadius, 4);
        expect(mesh.positions[at + 1]).toBeCloseTo(height, 6);
      }
      expect(outerRadius).toBeCloseTo(cylinder.r0 + wall.top[station], 4);
    }
  });

  it('erodes the bore rather than offsetting it, so it can never fold', () => {
    // A pitch this low squashes the profile into a fan of discs: a constant
    // offset inward would turn itself inside out, and an erosion cannot.
    for (const patch of [{}, { pitchMm: 60 }, { k: 0.4 }, { wallThickness: 14 }]) {
      const settings = { ...cylinder, ...patch };
      const wall = buildWall(series, events, settings);
      const bore = wall.bore!;
      expect(bore).not.toBeNull();
      for (let i = 0; i < bore.length; i += 1) {
        const outer = settings.r0 + wall.top[i];
        // Never thinner than the wall asked for, never through the axis, and
        // never outside the surface it is eroded from.
        expect(outer - bore[i]).toBeGreaterThanOrEqual(settings.wallThickness - 1e-9);
        expect(bore[i]).toBeGreaterThan(0);
        expect(bore[i]).toBeLessThan(outer);
      }
      // And the clay it leaves stays inside the bound the slope implies.
      const { maxClayMm, maxSlope } = wall.profile!;
      expect(maxClayMm).toBeGreaterThanOrEqual(settings.wallThickness - 1e-9);
      expect(maxClayMm).toBeLessThanOrEqual(
        settings.wallThickness * Math.sqrt(1 + maxSlope * maxSlope) + 1e-6,
      );
    }
  });

  it('is watertight: a sleeve, so a torus like the ring', () => {
    const report = checkManifold(buildWallMesh(buildWall(series, events, cylinder), cylinder));
    expect(report.watertight).toBe(true);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.eulerCharacteristic).toBe(0);
    expect(report.volumeMm3).toBeGreaterThan(0);
  });

  it('takes its diameter from the crest, not from r₀ alone', () => {
    const wall = buildWall(series, events, cylinder);
    const m = measure(wall, cylinder);
    const crest = Math.max(...wall.undisturbed);
    expect(wall.outerRadiusMm).toBeCloseTo(cylinder.r0 + crest, 9);
    expect(m.firedOuterDiameterMm).toBeCloseTo(2 * (cylinder.r0 + crest), 9);
    // Widening r₁ cannot change it any more than it changes a ring.
    const widened = buildWall(series, events, { ...cylinder, r1: 399 });
    expect(widened.spiral.length).toBeCloseTo(wall.spiral.length, 9);
  });

  it('scales the slope exactly inversely with the pitch', () => {
    const base = buildWall(series, events, cylinder).profile!;
    const doubled = buildWall(series, events, { ...cylinder, pitchMm: cylinder.pitchMm * 2 })
      .profile!;
    expect(doubled.maxSlope).toBeCloseTo(base.maxSlope / 2, 6);
    expect(doubled.mmPerHour).toBeCloseTo(base.mmPerHour * 2, 6);
    // And directly with k, which is the other half of the advice's arithmetic.
    const halved = buildWall(series, events, { ...cylinder, k: cylinder.k / 2 }).profile!;
    expect(halved.maxSlope).toBeCloseTo(base.maxSlope / 2, 6);
  });

  it('checks the profile slope and the piece height, not the coil', () => {
    const ids = runChecks(buildWall(series, events, cylinder), cylinder).checks.map((c) => c.id);
    expect(ids).toContain('profile');
    expect(ids).toContain('pieceHeight');
    expect(ids).not.toContain('turnSpacing');
    expect(ids).not.toContain('wallLength');

    const flat = { ...cylinder, clockMode: 'synodic' as const, r0: 30, r1: 140 };
    const flatIds = runChecks(buildWall(series, events, flat), flat).checks.map((c) => c.id);
    expect(flatIds).toContain('turnSpacing');
    expect(flatIds).toContain('wallLength');
    expect(flatIds).not.toContain('profile');
    expect(flatIds).not.toContain('pieceHeight');
  });

  it('fails the slope check when the profile is squashed, and the fix clears it', () => {
    const squashed = { ...cylinder, pitchMm: 200 };
    const check = runChecks(buildWall(series, events, squashed), squashed).checks.find(
      (c) => c.id === 'profile',
    )!;
    expect(check.level).toBe('fail');
    expect(check.fix!.patch).toHaveProperty('pitchMm');
    const fixed = { ...squashed, ...check.fix!.patch };
    expect(
      runChecks(buildWall(series, events, fixed), fixed).checks.find((c) => c.id === 'profile')!
        .level,
    ).toBe('ok');
  });

  it('shortens the window, not the pitch, when the piece will not fit the kiln', () => {
    const tall = { ...cylinder, ...FULL_WINDOW_PRESET };
    const check = runChecks(buildWall(series, events, tall), tall).checks.find(
      (c) => c.id === 'pieceHeight',
    )!;
    expect(check.level).toBe('fail');
    expect(check.fix!.patch).toHaveProperty('windowEndUtc');
    // Shortening the window leaves the tide's own shape essentially untouched,
    // which is the whole reason it is the lever offered. Essentially, not
    // exactly: the piece rises with the Moon's phase rather than with the
    // clock, so a different stretch of the orbit is a few per cent faster or
    // slower. That is the slack the fix keeps in hand.
    const fixed = { ...tall, ...check.fix!.patch };
    const before = buildWall(series, events, tall).profile!;
    const after = buildWall(series, events, fixed).profile!;
    expect(after.mmPerHour / before.mmPerHour).toBeGreaterThan(0.85);
    expect(after.mmPerHour / before.mmPerHour).toBeLessThan(1.15);
    expect(
      runChecks(buildWall(series, events, fixed), fixed).checks.find((c) => c.id === 'pieceHeight')!
        .level,
    ).toBe('ok');
  });

  it('cuts each eruption as a ring round the whole piece', () => {
    const wall = buildWall(series, events, cylinder);
    expect(wall.notches.map((notch) => notch.eventId)).toEqual(['e2', 'e3']);
    const overlay = buildNotchOverlay(wall, cylinder);
    expect(overlay.indices.length).toBeGreaterThan(0);
    // The cut is axisymmetric, so the overlay has to reach every quadrant.
    const quadrants = new Set<number>();
    for (let v = 0; v < overlay.positions.length; v += 3) {
      const angle = Math.atan2(-overlay.positions[v + 2], overlay.positions[v]);
      quadrants.add(Math.floor(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)));
    }
    expect(quadrants.size).toBe(4);
  });

  it('fails nothing at the defaults the site ships', () => {
    const { checks } = runChecks(buildWall(series, events, cylinder), cylinder);
    expect(checks.filter((check) => check.level === 'fail').map((c) => c.id)).toEqual([]);
  });

  it('leaves the other modes flat on the ground', () => {
    for (const mode of ['circle', 'synodic', 'springNeap', 'linear'] as const) {
      const wall = buildWall(series, events, { ...cylinder, clockMode: mode, r0: 30, r1: 140 });
      expect(wall.clock.revolved).toBe(false);
      expect(wall.clock.climbMmPerTurn).toBe(0);
      expect(wall.profile).toBeNull();
      expect(wall.bore).toBeNull();
      expect(Math.max(...wall.spiral.samples.map((sample) => sample.z))).toBe(0);
      expect(wall.totalHeightMm).toBeCloseTo(Math.max(...wall.undisturbed), 9);
    }
  });
});
