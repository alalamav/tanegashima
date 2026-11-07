import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Series, VolcanoEvent } from '../src/data/series.js';
import {
  approximateLength,
  maxGainForHeight,
  maxWindowHoursForFeature,
  radiusScaleForLength,
  turnGuidance,
} from '../src/geom/advice.js';
import {
  DEFAULT_PARAMS,
  PARAM_RANGES,
  SHORT_WINDOW_PRESET,
  snapDown,
  snapUp,
  type Params,
  type RangedParam,
} from '../src/geom/params.js';
import { buildWall } from '../src/geom/wall.js';
import { runChecks, type Check, type CheckFix, type CheckLevel } from '../src/geom/validate.js';
import { HELP, helpText } from '../src/i18n/help.js';

const dataDir = resolve(import.meta.dirname, '../public/data');
const series = JSON.parse(readFileSync(resolve(dataDir, 'series.json'), 'utf8')) as Series;
const events = JSON.parse(readFileSync(resolve(dataDir, 'events.json'), 'utf8')) as VolcanoEvent[];

const build = (patch: Partial<Params> = {}) => {
  const params: Params = { ...DEFAULT_PARAMS, ...patch };
  const wall = buildWall(series, events, params);
  const { checks, measures } = runChecks(wall, params);
  const guidance = turnGuidance(params, measures.turns, measures.windowHours);
  const find = (id: string): Check => checks.find((check) => check.id === id)!;
  const level = (id: string): CheckLevel => find(id).level;
  return { params, wall, checks, measures, guidance, find, level };
};

describe('spiral length approximation', () => {
  it('matches the real resampled centerline to within 1%', () => {
    for (const patch of [{}, SHORT_WINDOW_PRESET, { r0: 10, r1: 200 }, { clockMode: 'linear' as const, linearTurns: 2 }]) {
      const { measures, params } = build(patch);
      const approximate = approximateLength(params.r0, params.r1, measures.turns);
      const error = Math.abs(approximate - measures.centerlineLengthMm) / measures.centerlineLengthMm;
      expect(error).toBeLessThan(0.01);
    }
  });
});

describe('turn guidance', () => {
  it('reports the turns the configuration actually produces, not the slider', () => {
    const synodic = build({ linearTurns: 11 });
    expect(synodic.guidance.turns).toBeCloseTo(synodic.measures.turns, 9);
    expect(synodic.guidance.turns).toBeGreaterThan(3);
    expect(synodic.guidance.turns).toBeLessThan(3.5);
    expect(synodic.guidance.turnsAreUserSet).toBe(false);
  });

  it('says the turns are the user’s only in linear mode', () => {
    expect(build({ clockMode: 'linear' }).guidance.turnsAreUserSet).toBe(true);
    expect(build({ clockMode: 'springNeap' }).guidance.turnsAreUserSet).toBe(false);
  });

  it('gives a usable range at the defaults', () => {
    const { guidance } = build();
    expect(guidance.minTurns).toBeGreaterThan(1.5);
    expect(guidance.minTurns).toBeLessThan(2);
    expect(guidance.maxTurns).toBeGreaterThan(6);
    expect(guidance.maxTurns).toBeLessThan(6.5);
    // The default synodic configuration sits inside its own range.
    expect(guidance.turns).toBeGreaterThan(guidance.minTurns);
    expect(guidance.turns).toBeLessThan(guidance.maxTurns);
  });

  it('reports no room rather than a negative maximum when r₀ exceeds r₁', () => {
    expect(build({ r0: 140, r1: 30 }).guidance.maxTurns).toBe(0);
  });

  it('explains why spring–neap fails at the default radii', () => {
    const { guidance, measures } = build({ clockMode: 'springNeap' });
    expect(measures.turns).toBeGreaterThan(guidance.maxTurns);
    expect(guidance.suggestedR1Mm).toBeGreaterThan(DEFAULT_PARAMS.r1);
  });
});

describe('every check explains itself', () => {
  const { checks } = build();

  it('carries explanation text in both languages', () => {
    for (const check of checks) {
      expect(check.explainEs.length).toBeGreaterThan(40);
      expect(check.explainEn.length).toBeGreaterThan(40);
      expect(check.explainEs).not.toBe(check.explainEn);
    }
  });

  it('carries advice exactly when the check is not passing', () => {
    for (const patch of [
      {},
      { clockMode: 'springNeap' as const },
      { r1: 400 },
      { k: 1 },
      { clockMode: 'linear' as const, linearTurns: 0.5 },
      SHORT_WINDOW_PRESET,
    ]) {
      for (const check of build(patch).checks) {
        if (check.level === 'ok') {
          expect(check.adviceEs).toBeNull();
          expect(check.adviceEn).toBeNull();
        } else {
          expect(check.adviceEs).toBeTruthy();
          expect(check.adviceEn).toBeTruthy();
          // Advice has to name a number to act on, not just a direction.
          expect(check.adviceEn!).toMatch(/\d/);
        }
      }
    }
  });

  it('keeps the limit string language-neutral', () => {
    for (const check of checks) {
      expect(check.limit).not.toMatch(/cómodo|comfortable/);
    }
  });
});

describe('the advice actually fixes the check', () => {
  /** Take the number the advice actually printed, not a recomputed one. */
  const printed = (text: string, pattern: RegExp): number => {
    const match = pattern.exec(text);
    expect(match, `no number in: ${text}`).not.toBeNull();
    return Number(match![1]);
  };

  it('turn spacing: the printed r₁ makes spring–neap pass', () => {
    const before = build({ clockMode: 'springNeap' });
    expect(before.level('turnSpacing')).toBe('fail');
    const r1 = printed(before.find('turnSpacing').adviceEn!, /Raise r₁ to (\d+(?:\.\d+)?) mm/);
    expect(after_(r1)).toBe('ok');

    function after_(value: number) {
      return build({ clockMode: 'springNeap', r1: value }).level('turnSpacing');
    }
  });

  it('turn spacing: the maximum turns make linear mode pass', () => {
    const before = build({ clockMode: 'linear', linearTurns: 12 });
    expect(before.level('turnSpacing')).toBe('fail');

    const after = build({
      clockMode: 'linear',
      linearTurns: Math.floor(before.guidance.maxTurns * 100) / 100,
    });
    expect(after.level('turnSpacing')).toBe('ok');
  });

  it('tide wavelength: the minimum turns make a short spiral pass', () => {
    const before = build({ clockMode: 'linear', linearTurns: 0.5 });
    expect(before.level('tideWavelength')).toBe('fail');

    const after = build({
      clockMode: 'linear',
      linearTurns: Math.ceil(before.guidance.minTurns * 100) / 100,
    });
    expect(after.level('tideWavelength')).not.toBe('fail');
  });

  it('tide wavelength: the suggested radius scale makes a short spiral pass', () => {
    const before = build({ clockMode: 'linear', linearTurns: 0.5 });
    const scale = radiusScaleForLength(
      before.measures.centerlineLengthMm,
      before.guidance.requiredLengthMm,
    );
    const after = build({
      clockMode: 'linear',
      linearTurns: 0.5,
      r0: DEFAULT_PARAMS.r0 * scale,
      r1: DEFAULT_PARAMS.r1 * scale,
    });
    expect(after.level('tideWavelength')).not.toBe('fail');
  });

  it('kiln: the printed r₁ brings an oversized piece back inside the limit', () => {
    const before = build({ r1: 400 });
    expect(before.level('kiln')).toBe('fail');
    const r1 = printed(before.find('kiln').adviceEn!, /Drop r₁ to (\d+(?:\.\d+)?) mm/);
    expect(build({ r1 }).level('kiln')).toBe('ok');
  });

  it('wall height: the printed k brings an over-tall wall back under the limit', () => {
    const before = build({ k: 1 });
    expect(before.level('wallHeight')).toBe('fail');
    const k = printed(before.find('wallHeight').adviceEn!, /Drop k to (\d+(?:\.\d+)?) mm\/cm/);
    expect(build({ k }).level('wallHeight')).toBe('ok');
    // And the exact limit agrees with the printed, safely rounded one.
    expect(k).toBeLessThanOrEqual(maxGainForHeight(before.params, before.wall.signal.range));
  });

  it('wall length: the suggested radius scale brings it inside the budget', () => {
    const before = build({ clockMode: 'springNeap' });
    expect(before.level('wallLength')).toBe('fail');
    const scale = radiusScaleForLength(before.measures.centerlineLengthMm, 1200);
    const after = build({
      clockMode: 'springNeap',
      r0: DEFAULT_PARAMS.r0 * scale,
      r1: DEFAULT_PARAMS.r1 * scale,
    });
    expect(after.measures.centerlineLengthMm).toBeLessThanOrEqual(1210);
  });

  it('notches: the suggested depth per km stops the clamping', () => {
    const before = build(SHORT_WINDOW_PRESET);
    expect(before.level('notches')).toBe('warn');
    const suggested = /Drop the depth per km to (\d+(?:\.\d+)?) mm\/km/.exec(before.find('notches').adviceEn!);
    expect(suggested).not.toBeNull();
    const after = build({ ...SHORT_WINDOW_PRESET, notchDepthPerKm: Number(suggested![1]) });
    expect(after.wall.clampedNotches).toEqual([]);
    expect(after.level('notches')).toBe('ok');
  });

  it('does not offer the short-window preset when the window is already short', () => {
    const { checks } = build({ ...SHORT_WINDOW_PRESET, r0: 4, r1: 8 });
    const advice = checks.filter((check) => check.level !== 'ok').map((check) => check.adviceEn ?? '');
    for (const text of advice) expect(text).not.toContain('short window');
  });

  it('names the real problem when r₀ is larger than r₁', () => {
    const { find } = build({ r0: 140, r1: 30 });
    expect(find('turnSpacing').adviceEn).toContain('winds inward');
    expect(find('turnSpacing').adviceEs).toContain('hacia dentro');
  });
});

describe('derived limits', () => {
  it('maxWindowHoursForFeature inverts the wavelength check', () => {
    const { measures, params } = build();
    const hours = maxWindowHoursForFeature(measures.centerlineLengthMm, params.minFeatureMm);
    expect(hours).toBeGreaterThan(measures.windowHours);
    // At exactly that many hours the wavelength equals the minimum feature.
    const wavelength = (measures.centerlineLengthMm * 12.4206012) / hours;
    expect(wavelength).toBeCloseTo(params.minFeatureMm, 6);
  });

  it('radiusScaleForLength is the identity when nothing has to change', () => {
    expect(radiusScaleForLength(1000, 1000)).toBe(1);
    expect(radiusScaleForLength(0, 500)).toBe(1);
  });
});

describe('help text', () => {
  const { params, guidance, measures } = build();
  const context = { params, guidance, measures };

  const PANEL_KEYS = [
    'clockMode', 'linearTurns', 'windowStart', 'windowEnd', 'shortWindow', 'fullWindow',
    'r0', 'r1', 'thetaRef', 'arcStep',
    'signal', 'hBase', 'k', 'smoothing', 'wallThickness', 'baseDisc',
    'notchWidth', 'notchDepth0', 'notchDepthPerKm',
    'shrinkage', 'kilnLimit', 'clearance', 'minFeature', 'maxHeight', 'stripMax', 'pageSize',
    'viewPlan', 'viewThreeQuarter', 'viewElevation', 'autoRotate', 'language',
    'transparentPng', 'greenMesh', 'exportPng', 'exportStl', 'exportGlb',
    'exportPlanSvg', 'exportStripsSvg', 'exportPdf', 'exportSpecJson', 'exportSpecPdf',
    'checks', 'events', 'data',
  ];

  it('covers every control the panel wires up', () => {
    for (const key of PANEL_KEYS) expect(HELP[key], `missing help for ${key}`).toBeDefined();
  });

  it('has no entries the panel never shows', () => {
    for (const key of Object.keys(HELP)) expect(PANEL_KEYS).toContain(key);
  });

  it('returns substantial text in both languages for every key', () => {
    for (const key of PANEL_KEYS) {
      for (const lang of ['es', 'en'] as const) {
        const text = helpText(key, context, lang);
        expect(text, key).toBeTruthy();
        expect(text!.length, key).toBeGreaterThan(60);
      }
    }
  });

  it('returns null for an unknown key rather than throwing', () => {
    expect(helpText('nope', context, 'en')).toBeNull();
  });

  it('describes every option of each dropdown', () => {
    const clock = helpText('clockMode', context, 'en')!;
    for (const option of ['Synodic', 'Spring–neap', 'Linear']) expect(clock).toContain(option);
    const signal = helpText('signal', context, 'en')!;
    for (const option of ['elev', 'obs', 'astro', 'dep']) expect(signal).toContain(option);
  });

  it('quotes the live numbers, so it changes when the configuration does', () => {
    const wide = build({ r1: 300 });
    const a = helpText('r1', context, 'en')!;
    const b = helpText('r1', { params: wide.params, guidance: wide.guidance, measures: wide.measures }, 'en')!;
    expect(a).not.toBe(b);
    expect(a).toContain('110 mm');
  });

  it('tells the user why the turns slider is dead outside linear mode', () => {
    const en = helpText('linearTurns', context, 'en')!;
    expect(en).toContain('Disabled');
    expect(en).toContain('Linear');
    const linear = build({ clockMode: 'linear' });
    const live = helpText(
      'linearTurns',
      { params: linear.params, guidance: linear.guidance, measures: linear.measures },
      'en',
    )!;
    expect(live).not.toContain('Disabled');
    expect(live).toContain('Useful range');
  });
});

describe('the turn suggestions are exact, not linearised', () => {
  it('wall length: the suggested turn count lands on the budget', () => {
    const before = build({ clockMode: 'linear', linearTurns: 12 });
    expect(before.level('wallLength')).toBe('fail');
    const suggested = /Drop the turns to (\d+(?:\.\d+)?)/.exec(before.find('wallLength').adviceEn!);
    expect(suggested).not.toBeNull();
    const after = build({ clockMode: 'linear', linearTurns: Number(suggested![1]) });
    expect(after.measures.centerlineLengthMm).toBeLessThanOrEqual(1210);
    expect(after.level('wallLength')).toBe('ok');
  });

  it('tide wavelength: the suggested turn count lands on the limit', () => {
    const before = build({ clockMode: 'linear', linearTurns: 0.5 });
    const suggested = /Raise the turns to (\d+(?:\.\d+)?)/.exec(before.find('tideWavelength').adviceEn!);
    expect(suggested).not.toBeNull();
    const after = build({ clockMode: 'linear', linearTurns: Number(suggested![1]) + 0.01 });
    expect(after.level('tideWavelength')).not.toBe('fail');
  });
});


describe('one-click fixes', () => {
  /** Every configuration the panel is likely to be left in by a wrong turn. */
  const BROKEN: Array<[string, Partial<Params>]> = [
    ['defaults', {}],
    ['spring–neap at default radii', { clockMode: 'springNeap' }],
    ['linear, far too many turns', { clockMode: 'linear', linearTurns: 12 }],
    ['linear, far too few turns', { clockMode: 'linear', linearTurns: 0.5 }],
    ['radius past the kiln', { r1: 400 }],
    ['gain far too high', { k: 1 }],
    ['radii inverted', { r0: 140, r1: 30 }],
    ['short window', SHORT_WINDOW_PRESET],
    ['short window, tiny radii', { ...SHORT_WINDOW_PRESET, r0: 8, r1: 20 }],
    ['thick wall, no clearance room', { wallThickness: 18, clearanceMm: 30 }],
    ['smallest radii the panel allows', { r0: 5, r1: 20 }],
  ];

  it('offers a fix exactly when a check is not passing', () => {
    for (const [name, patch] of BROKEN) {
      for (const check of build(patch).checks) {
        if (check.level === 'ok') {
          expect(check.fix, `${name}/${check.id}`).toBeNull();
        } else {
          // A fix may be absent only when no single parameter can clear it, and
          // the advice then has to say what to do instead.
          if (check.fix === null) {
            expect(check.adviceEn, `${name}/${check.id}`).toMatch(/Shorten|thin the wall|bigger kiln|raise k/i);
          }
        }
      }
    }
  });

  it('clears the check it belongs to, in every broken configuration', () => {
    for (const [name, patch] of BROKEN) {
      const before = build(patch);
      for (const check of before.checks) {
        if (!check.fix) continue;
        const after = build({ ...patch, ...check.fix.patch });
        expect(after.level(check.id), `${name}/${check.id} after ${check.fix.labelEn}`).toBe('ok');
      }
    }
  });

  it('never turns a passing check red', () => {
    // A fix may deepen a warning that was already showing — an 18 mm wall over a
    // 97-day window simply cannot be short, and the length check is already
    // flagged and offering its own fix. What it must never do is break something
    // that was green.
    for (const [name, patch] of BROKEN) {
      const before = build(patch);
      const green = new Set(
        before.checks.filter((check) => check.level === 'ok').map((check) => check.id),
      );
      for (const check of before.checks) {
        if (!check.fix) continue;
        const after = build({ ...patch, ...check.fix.patch });
        const broken = after.checks
          .filter((c) => c.level === 'fail' && green.has(c.id))
          .map((c) => c.id);
        expect(broken, `${name}: ${check.id} fix "${check.fix.labelEn}"`).toEqual([]);
      }
    }
  });

  it('unsettles at most one other check, and only ever to a warning', () => {
    // Trade-offs are real: the short window shortens the wall but squeezes two
    // notches against a lower crest. What a fix may never do is cascade.
    for (const [name, patch] of BROKEN) {
      const before = build(patch);
      const rank = { ok: 0, warn: 1, fail: 2 } as const;
      for (const check of before.checks) {
        if (!check.fix) continue;
        const after = build({ ...patch, ...check.fix.patch });
        const worse = after.checks.filter((c) => {
          const was = before.checks.find((b) => b.id === c.id)!;
          return rank[c.level] > rank[was.level] && c.id !== check.id;
        });
        expect(worse.length, `${name}: ${check.id} fix "${check.fix.labelEn}"`).toBeLessThanOrEqual(1);
        for (const c of worse) {
          const was = before.checks.find((b) => b.id === c.id)!;
          if (was.level === 'ok') {
            expect(c.level, `${name}: ${check.id} fix broke a green ${c.id}`).toBe('warn');
          }
          // And whatever it unsettled offers its own way out.
          expect(c.fix ?? c.adviceEn, `${name}: ${c.id} left with no advice`).toBeTruthy();
        }
      }
    }
  });

  it('is idempotent: applying a fix twice changes nothing the second time', () => {
    for (const [, patch] of BROKEN) {
      const before = build(patch);
      for (const check of before.checks) {
        if (!check.fix) continue;
        const once = build({ ...patch, ...check.fix.patch });
        const repeat = once.checks.find((c) => c.id === check.id)!;
        expect(repeat.fix).toBeNull();
      }
    }
  });

  it('labels the fix with the value it will set', () => {
    for (const [, patch] of BROKEN) {
      for (const check of build(patch).checks) {
        if (!check.fix) continue;
        expect(check.fix.labelEs.length).toBeGreaterThan(2);
        expect(check.fix.labelEn.length).toBeGreaterThan(2);
        // Either a number to set, or a named action like "swap r₀ and r₁".
        expect(check.fix.labelEn).toMatch(/\d|swap|window/);
        // The label names the value, so the button and the panel agree.
        expect(check.fix.labelEn).not.toMatch(/\.\d{3,}|e[+-]\d/);
      }
    }
  });

  it('proposes values the panel can actually hold', () => {
    // A slider with a 1 mm step turns "r₁ → 148.6" into 149 on the way in. If a
    // fix ever proposes an off-step value, the panel silently rounds it — and
    // rounding the wrong way would undo the fix. Every proposed value must
    // therefore already sit exactly on its parameter's own step.
    for (const [name, patch] of BROKEN) {
      for (const check of build(patch).checks) {
        if (!check.fix) continue;
        for (const [key, value] of Object.entries(check.fix.patch)) {
          if (!(key in PARAM_RANGES) || typeof value !== 'number') continue;
          const ranged = key as RangedParam;
          expect(snapUp(ranged, value), `${name}/${check.id}: ${key}`).toBe(value);
          expect(snapDown(ranged, value), `${name}/${check.id}: ${key}`).toBe(value);
          expect(value, `${name}/${check.id}: ${key} below min`).toBeGreaterThanOrEqual(
            PARAM_RANGES[ranged].min,
          );
          expect(value, `${name}/${check.id}: ${key} above max`).toBeLessThanOrEqual(
            PARAM_RANGES[ranged].max,
          );
        }
      }
    }
  });

  it('survives a round trip through the panel’s own rounding', () => {
    for (const [name, patch] of BROKEN) {
      const before = build(patch);
      for (const check of before.checks) {
        if (!check.fix) continue;
        // Simulate Tweakpane writing each value back through its step.
        const rounded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(check.fix.patch)) {
          if (key in PARAM_RANGES && typeof value === 'number') {
            const { step, min } = PARAM_RANGES[key as RangedParam];
            rounded[key] = Number((Math.round((value - min) / step) * step + min).toFixed(4));
          } else {
            rounded[key] = value;
          }
        }
        const after = build({ ...patch, ...(rounded as Partial<Params>) });
        expect(after.level(check.id), `${name}/${check.id}`).toBe('ok');
      }
    }
  });

  it('only patches parameters that exist', () => {
    const keys = new Set(Object.keys(DEFAULT_PARAMS));
    for (const [, patch] of BROKEN) {
      for (const check of build(patch).checks) {
        if (!check.fix) continue;
        for (const key of Object.keys(check.fix.patch)) expect(keys).toContain(key);
      }
    }
  });

  it('says in the advice what the button will do', () => {
    // The advice is composed from the fix, so the first sentence always names it.
    const spacing = build({ clockMode: 'springNeap' }).find('turnSpacing');
    expect(spacing.fix!.labelEn).toBe('r₁ → 149 mm');
    expect(spacing.adviceEn).toMatch(/^Raise r₁ to 149 mm/);

    const inverted = build({ r0: 140, r1: 30 }).find('turnSpacing');
    expect(inverted.fix!.patch).toEqual({ r0: 30, r1: 140 });
    expect(inverted.adviceEn).toContain('swap them');

    const gain = build({ k: 1 }).find('wallHeight');
    expect(gain.adviceEn).toMatch(/^Drop k to 0\.27 mm\/cm/);
    expect(gain.fix!.patch).toEqual({ k: 0.27 });
  });

  it('does not offer the short window in linear mode, where it changes no length', () => {
    const linear = build({ clockMode: 'linear', linearTurns: 12 }).find('wallLength');
    expect(linear.fix!.patch).toHaveProperty('linearTurns');
    expect(linear.fix!.labelEn).toContain('turns');

    const synodic = build({ clockMode: 'springNeap' }).find('wallLength');
    expect(synodic.fix!.labelEn).toBe('short window');
  });

  it('keeps a spacing fix inside the kiln rather than trading red for red', () => {
    const { find } = build({ clockMode: 'linear', linearTurns: 12 });
    const fix = find('turnSpacing').fix as CheckFix;
    const after = build({ clockMode: 'linear', linearTurns: 12, ...fix.patch });
    expect(after.level('turnSpacing')).toBe('ok');
    expect(after.level('kiln')).toBe('ok');
  });
});
