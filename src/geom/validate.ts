/**
 * Fabrication checks. These are shown live in the panel, so a configuration that
 * cannot be built in clay says so before anyone prints a template.
 */

import type { VolcanoEvent } from '../data/series.js';
import type { MeshData, Wall } from './wall.js';
import {
  greenScale,
  growsOutward,
  outerRadius,
  outerRadiusKey,
  PARAM_RANGES,
  revolved,
  snapDown,
  snapUp,
  SHORT_WINDOW_PRESET,
  type Params,
} from './params.js';
import {
  approximateLength,
  maxGainForHeight,
  maxPitchForKiln,
  maxWindowHoursForFeature,
  gainForSlope,
  pitchForProfileLength,
  pitchForSlope,
  radiusScaleForLength,
  turnGuidance,
  turnsForLength,
} from './advice.js';

/** Period of the principal lunar semidiurnal constituent M2, hours. */
export const M2_PERIOD_HOURS = 12.4206012;

export type CheckLevel = 'ok' | 'warn' | 'fail';

export interface Check {
  id: string;
  labelEs: string;
  labelEn: string;
  level: CheckLevel;
  /** Measured value, already rounded for display. */
  value: string;
  /** The limit it was compared against. */
  limit: string;
  /** What the check is for, in one or two sentences. Always present. */
  explainEs: string;
  explainEn: string;
  /**
   * What to change, with the number to change it to. Null when the check passes,
   * since there is then nothing to act on. Its first sentence is always the fix
   * below, so the button and the words can never disagree.
   */
  adviceEs: string | null;
  adviceEn: string | null;
  /** The one change the panel can make on a click. Null when the check passes. */
  fix: CheckFix | null;
}

/**
 * A single parameter change that clears the check it belongs to.
 *
 * The advice sentence is composed FROM this object rather than beside it, so the
 * button always applies exactly what the first lever in the text says. The
 * numbers are already rounded toward the side that keeps them valid, so applying
 * one lands inside the limit rather than exactly on it.
 */
export interface CheckFix {
  /** Parameters to merge into the current set. */
  patch: Partial<Params>;
  /** Short label, e.g. "r₁ → 148.6 mm". Used as the button's text. */
  labelEs: string;
  labelEn: string;
}

export interface Measures {
  firedOuterDiameterMm: number;
  greenOuterDiameterMm: number;
  turnSpacingMm: number;
  centerlineLengthMm: number;
  tideWavelengthMm: number;
  wallHeightMinMm: number;
  wallHeightMaxMm: number;
  turns: number;
  /** Topmost point above the ground, mm. */
  totalHeightMm: number;
  /** Steepest slope of the revolved silhouette. Zero on a coil. */
  maxSlope: number;
  /** Thickest section the revolved form forces, mm. Zero on a coil. */
  maxClayMm: number;
  /** Height gained per hour on the revolved form, mm. Zero on a coil. */
  mmPerHour: number;
  windowHours: number;
  notchCount: number;
  sampleCount: number;
}

export function measure(wall: Wall, params: Params): Measures {
  const windowHours = wall.clock.window.count - 1;
  return {
    // The widest point of the piece, which the wall itself knows: on the
    // revolved form the tide is radial, so the crest decides the diameter.
    firedOuterDiameterMm: 2 * wall.outerRadiusMm,
    greenOuterDiameterMm: 2 * wall.outerRadiusMm * greenScale(params),
    turnSpacingMm: wall.spiral.turnSpacing,
    centerlineLengthMm: wall.spiral.length,
    // One semidiurnal cycle occupies this much arc length, on average.
    tideWavelengthMm: (wall.spiral.length * M2_PERIOD_HOURS) / Math.max(windowHours, 1),
    wallHeightMinMm: wall.heightRange.min,
    wallHeightMaxMm: wall.heightRange.max,
    turns: wall.spiral.turns,
    totalHeightMm: wall.totalHeightMm,
    maxSlope: wall.profile?.maxSlope ?? 0,
    maxClayMm: wall.profile?.maxClayMm ?? 0,
    mmPerHour: wall.profile?.mmPerHour ?? 0,
    windowHours,
    notchCount: wall.notches.length,
    sampleCount: wall.spiral.samples.length,
  };
}

const n = (value: number, decimals = 1) => value.toFixed(decimals);

/**
 * Relative slack on a limit comparison. A configuration derived from a limit —
 * "set r₁ to 173 mm" — lands on it to the last bit of a double, and a check that
 * reported that as a failure would make its own advice look wrong.
 */
const EPSILON = 1e-9;
const atMost = (value: number, limit: number): boolean =>
  value <= limit + Math.abs(limit) * EPSILON;
const atLeast = (value: number, limit: number): boolean =>
  value >= limit - Math.abs(limit) * EPSILON;

/**
 * Round a suggested value toward the side that keeps it valid.
 *
 * "Drop k to ≤ 0.2767" printed as 0.277 would still fail the check it was meant
 * to fix, so a ceiling is always rounded DOWN and a floor is always rounded UP.
 */
const down = (value: number, decimals = 1): string => {
  const factor = 10 ** decimals;
  return (Math.floor(value * factor) / factor).toFixed(decimals);
};
const up = (value: number, decimals = 1): string => {
  const factor = 10 ** decimals;
  return (Math.ceil(value * factor) / factor).toFixed(decimals);
};

/**
 * Print a value that is already snapped to its parameter's own step: 149 rather
 * than 149.0, 0.27 rather than 0.270.
 */
const show = (value: number): string => String(value);


/**
 * A window end the panel can actually hold.
 *
 * The dates are edited as whole days, and the panel stores the end as 23:00 of
 * the day chosen. A suggestion that lands mid-day would be rounded FORWARD to
 * 23:00 as soon as the panel refreshed — up to twenty-three hours of piece
 * nobody asked for, which on the revolved form is up to twenty-three hours of
 * extra height, enough to push a piece straight back out of the kiln it had
 * just been brought into. So a suggested end is floored to the last whole day
 * that fits, and written in the panel's own form.
 */
function windowEndAfter(startUtc: string, hours: number): string {
  const start = Date.parse(startUtc);
  const target = start + hours * 3_600_000;
  const end = new Date(target);
  end.setUTCHours(23, 0, 0, 0);
  if (end.getTime() > target) end.setUTCDate(end.getUTCDate() - 1);
  // The clock needs at least 24 h, whatever the arithmetic asked for.
  const floor = new Date(start);
  floor.setUTCHours(23, 0, 0, 0);
  if (floor.getTime() < start + 24 * 3_600_000) floor.setUTCDate(floor.getUTCDate() + 1);
  return new Date(Math.max(end.getTime(), floor.getTime())).toISOString();
}

export function runChecks(wall: Wall, params: Params): { checks: Check[]; measures: Measures } {
  const m = measure(wall, params);
  const guidance = turnGuidance(params, m.turns, m.windowHours);
  const checks: Check[] = [];

  const modeNoteEs =
    params.clockMode === 'linear'
      ? `con este modo las vueltas son suyas: entre ${up(guidance.minTurns, 2)} y ${down(guidance.maxTurns, 2)}`
      : 'en este modo las vueltas las fija la Luna, así que el radio es la palanca';
  const modeNoteEn =
    params.clockMode === 'linear'
      ? `in this mode the turns are yours: between ${up(guidance.minTurns, 2)} and ${down(guidance.maxTurns, 2)}`
      : 'in this mode the Moon fixes the turns, so the radius is the lever';

  // --------------------------------------------------------------------- 1
  // Enough radial room between turns for a hand and a tool.
  //
  // A ring has one turn and no neighbour to be spaced from, so the check does
  // not apply at all in circle mode and is left out rather than reported as a
  // meaningless pass.
  const needed = params.wallThickness + params.clearanceMm;
  if (growsOutward(params.clockMode)) {
    const spacingOk = atLeast(m.turnSpacingMm, needed);

    // Widening r₁ is the obvious lever, but it must not push the piece out of
    // the kiln — a fix that trades one red row for another is not a fix. So the
    // suggestion is capped at the largest r₁ the kiln allows, and when even
    // that cannot hold these turns the lever moves to whatever is still free:
    // the turns in linear mode, r₀ otherwise, and only then the clearance.
    const wantedR1 = snapUp('r1', params.r0 + guidance.requiredSpanMm);
    const cappedR1 = snapDown('r1', guidance.maxOuterRadiusMm);
    const spacingAtCap = Math.abs(m.turns) > 0 ? (cappedR1 - params.r0) / Math.abs(m.turns) : 0;
    // Same clamping trap as the inner radius: snapDown floors at the slider's
    // minimum, so a negative requirement would come back as a usable zero.
    const clearanceRaw = spacingAtCap - params.wallThickness;
    const clearanceAtCap = snapDown('clearanceMm', clearanceRaw);
    const clearanceWorks = clearanceRaw >= 0;
    // Fewer turns means a shorter wall, so the turn count that fits the kiln is
    // only usable if it still leaves one tidal cycle wide enough to carve.
    const turnsAtCap = snapDown('linearTurns', (cappedR1 - params.r0) / needed);
    // Compare the SNAPPED turns, not the raw ones: snapping down can take a
    // value that just cleared the minimum back below it.
    const turnsAtCapReadable = turnsAtCap >= guidance.minTurns;
    // Pulling r₀ inward buys the same span without growing the piece — but only
    // if there is room to pull it to. snapDown clamps to the slider's minimum,
    // which would otherwise hand back a value that does not actually fit.
    const innerRaw = Math.min(params.r1, cappedR1) - guidance.requiredSpanMm;
    const innerForSpan = snapDown('r0', innerRaw);
    const innerWorks = innerRaw >= PARAM_RANGES.r0.min && innerForSpan < params.r0;

    let spacingFix: CheckFix | null = null;
    let spacingLeverEs = '';
    let spacingLeverEn = '';

    if (!spacingOk) {
      if (params.r0 >= params.r1) {
        // The spiral is winding inward; nothing about the turns is wrong.
        spacingFix = {
          patch: { r0: params.r1, r1: params.r0 },
          labelEs: 'intercambiar r₀ y r₁',
          labelEn: 'swap r₀ and r₁',
        };
        spacingLeverEs = 'r₀ es mayor que r₁, así que la espiral se enrolla hacia dentro: intercámbielos';
        spacingLeverEn = 'r₀ is larger than r₁, so the spiral winds inward: swap them';
      } else if (wantedR1 <= cappedR1) {
        spacingFix = { patch: { r1: wantedR1 }, labelEs: `r₁ → ${show(wantedR1)} mm`, labelEn: `r₁ → ${show(wantedR1)} mm` };
        spacingLeverEs = `Suba r₁ a ${show(wantedR1)} mm (ahora ${n(params.r1)})`;
        spacingLeverEn = `Raise r₁ to ${show(wantedR1)} mm (now ${n(params.r1)})`;
      } else if (guidance.turnsAreUserSet && turnsAtCap > 0 && turnsAtCapReadable) {
        spacingFix = {
          patch: { r1: cappedR1, linearTurns: turnsAtCap },
          labelEs: `r₁ → ${show(cappedR1)} mm, vueltas → ${turnsAtCap}`,
          labelEn: `r₁ → ${show(cappedR1)} mm, turns → ${turnsAtCap}`,
        };
        spacingLeverEs = `El horno no admite un r₁ mayor que ${show(cappedR1)} mm, así que suba r₁ hasta ahí y baje las vueltas a ${turnsAtCap}`;
        spacingLeverEn = `The kiln will not take an r₁ past ${show(cappedR1)} mm, so raise r₁ to it and drop the turns to ${turnsAtCap}`;
      } else if (innerWorks) {
        spacingFix = {
          patch: { r0: innerForSpan, r1: Math.min(params.r1, cappedR1) },
          labelEs: `r₀ → ${show(innerForSpan)} mm`,
          labelEn: `r₀ → ${show(innerForSpan)} mm`,
        };
        spacingLeverEs = `El horno no admite un r₁ mayor que ${show(cappedR1)} mm, así que haga sitio hacia dentro: baje r₀ a ${show(innerForSpan)} mm (ahora ${n(params.r0)})`;
        spacingLeverEn = `The kiln will not take an r₁ past ${show(cappedR1)} mm, so make the room inward instead: drop r₀ to ${show(innerForSpan)} mm (now ${n(params.r0)})`;
      } else if (clearanceWorks) {
        spacingFix = {
          patch: { r1: cappedR1, clearanceMm: clearanceAtCap },
          labelEs: `r₁ → ${show(cappedR1)} mm, holgura → ${show(clearanceAtCap)} mm`,
          labelEn: `r₁ → ${show(cappedR1)} mm, clearance → ${show(clearanceAtCap)} mm`,
        };
        spacingLeverEs = `El horno no admite un r₁ mayor que ${show(cappedR1)} mm, así que suba r₁ hasta ahí y acepte una holgura de ${show(clearanceAtCap)} mm`;
        spacingLeverEn = `The kiln will not take an r₁ past ${show(cappedR1)} mm, so raise r₁ to it and accept a clearance of ${show(clearanceAtCap)} mm`;
      } else {
        spacingLeverEs = `Ni con el r₁ máximo del horno (${show(cappedR1)} mm) caben ${n(m.turns, 2)} vueltas de muro de ${n(params.wallThickness)} mm. Acorte la ventana, adelgace el muro o use un horno mayor`;
        spacingLeverEn = `Even at the kiln's largest r₁ (${show(cappedR1)} mm) there is no room for ${n(m.turns, 2)} turns of ${n(params.wallThickness)} mm wall. Shorten the window, thin the wall, or use a bigger kiln`;
      }
    }

    checks.push({
      id: 'turnSpacing',
      labelEs: 'Separación entre vueltas',
      labelEn: 'Turn spacing',
      level: spacingOk ? 'ok' : 'fail',
      value: `${n(m.turnSpacingMm)} mm`,
      limit: `≥ ${n(needed)} mm`,
      explainEs:
        'Distancia radial entre una vuelta y la siguiente, (r₁ − r₀) ÷ vueltas. Tiene que caber el muro más sitio para los dedos y las herramientas.',
      explainEn:
        'Radial distance from one turn to the next, (r₁ − r₀) ÷ turns. It has to fit the wall plus room for fingers and tools.',
      adviceEs: spacingOk ? null : `${spacingLeverEs}; ${modeNoteEs}.`,
      adviceEn: spacingOk ? null : `${spacingLeverEn}; ${modeNoteEn}.`,
      fix: spacingFix,
    });
  }
  // ------------------------------------------------------------------- 1b
  // The revolved form has no neighbouring turn to be spaced from: its turns are
  // slices of the axis, not rings beside each other. The same question — is
  // there room for the tide — is asked of the SILHOUETTE instead, as its slope.
  //
  // The slope is what a rib has to follow on the wheel, and it is also what
  // decides how thick the clay has to get: the inner surface is eroded in by a
  // disc of the wall thickness, and that erosion can force at most
  // t x sqrt(1 + slope^2) of clay. 2 : 1 is a steep flute that still comes out
  // at 2.2 walls of clay, which is ordinary thrown thickness; past 3 : 1 the
  // clay is over three walls thick in places and drying a section like that
  // next to a thin one is what cracks pieces.
  if (revolved(params.clockMode)) {
    const slope = m.maxSlope;
    const gentle = 2;
    const steep = 3;
    const profileLevel: CheckLevel = atMost(slope, gentle)
      ? 'ok'
      : atMost(slope, steep)
        ? 'warn'
        : 'fail';

    // Both levers are exact: the slope goes as k and as 1 / pitch.
    const wantedPitch = snapUp('pitchMm', pitchForSlope(params.pitchMm, slope, gentle));
    const pitchCap = snapDown('pitchMm', maxPitchForKiln(params, m.turns));
    const pitchFits = wantedPitch <= pitchCap && wantedPitch > params.pitchMm;
    const gentlerKRaw = gainForSlope(params.k, slope, gentle);
    const gentlerK = snapDown('k', gentlerKRaw);
    const kWorks = gentlerKRaw >= PARAM_RANGES.k.min;

    let profileFix: CheckFix | null = null;
    let profileLeverEs = '';
    let profileLeverEn = '';
    if (profileLevel !== 'ok') {
      if (pitchFits) {
        const taller = (m.totalHeightMm * wantedPitch) / Math.max(params.pitchMm, 1e-9);
        profileFix = {
          patch: { pitchMm: wantedPitch },
          labelEs: `paso → ${show(wantedPitch)} mm`,
          labelEn: `pitch → ${show(wantedPitch)} mm`,
        };
        profileLeverEs = `Suba el paso a ${show(wantedPitch)} mm (ahora ${n(params.pitchMm, 0)}) para darle altura a cada marea: la pieza pasa a ${up(taller, 0)} mm de alto y la marea conserva su tamaño`;
        profileLeverEn = `Raise the pitch to ${show(wantedPitch)} mm (now ${n(params.pitchMm, 0)}) to give each tide room up the axis: the piece goes to ${up(taller, 0)} mm tall and the tide keeps its size`;
      } else if (kWorks) {
        profileFix = {
          patch: { k: gentlerK },
          labelEs: `k → ${gentlerK} mm/cm`,
          labelEn: `k → ${gentlerK} mm/cm`,
        };
        profileLeverEs = `El horno no admite más de ${show(pitchCap)} mm por vuelta con esta ventana, así que aplane la marea en vez de estirarla: baje k a ${gentlerK} mm/cm (ahora ${n(params.k, 2)})`;
        profileLeverEn = `The kiln will not take more than ${show(pitchCap)} mm per turn at this window, so flatten the tide instead of stretching it: drop k to ${gentlerK} mm/cm (now ${n(params.k, 2)})`;
      } else {
        profileLeverEs = `Con esta ventana el horno limita el paso a ${show(pitchCap)} mm y k ya está en el mínimo. Acorte la ventana: así el paso puede subir sin que la pieza crezca`;
        profileLeverEn = `At this window the kiln caps the pitch at ${show(pitchCap)} mm and k is already at its floor. Shorten the window: that lets the pitch rise without the piece growing`;
      }
    }

    checks.push({
      id: 'profile',
      labelEs: 'Pendiente del perfil',
      labelEn: 'Profile slope',
      level: profileLevel,
      value: `${n(slope, 2)} : 1`,
      limit: `≤ ${n(gentle, 2)} : 1`,
      explainEs: `Pendiente máxima de la silueta, mm de radio por mm de altura, medida sobre la curva horaria. Es lo que una terraja tiene que poder seguir en el torno, y también lo que decide el grosor: la cara interior se erosiona con un disco del espesor del muro, y eso obliga como mucho a espesor × √(1 + pendiente²) de barro. Ahora mismo, ${n(m.maxClayMm)} mm en el punto más gordo.`,
      explainEn: `Steepest slope of the silhouette, mm of radius per mm of height, measured on the hourly curve. It is what a rib has to follow on the wheel, and it is also what sets the thickness: the inner surface is eroded in by a disc of the wall thickness, and that forces at most thickness × √(1 + slope²) of clay. Right now, ${n(m.maxClayMm)} mm at the thickest.`,
      adviceEs:
        profileLevel === 'ok'
          ? null
          : `${profileLeverEs}. El barro llega a ${n(m.maxClayMm)} mm donde el muro mide ${n(params.wallThickness)} mm; secar una sección así junto a una fina es lo que raja las piezas.`,
      adviceEn:
        profileLevel === 'ok'
          ? null
          : `${profileLeverEn}. The clay reaches ${n(m.maxClayMm)} mm where the wall is ${n(params.wallThickness)} mm; drying a section like that next to a thin one is what cracks pieces.`,
      fix: profileFix,
    });
  }

  // --------------------------------------------------------------------- 2
  // The green piece has to fit the kiln.
  const kilnOk = atMost(m.greenOuterDiameterMm, params.kilnLimitMm);
  // Whichever radius is on the outside is the one that has to come in: r₁ for a
  // spiral, r₀ for a ring.
  const outerKey = outerRadiusKey(params);
  const outerName = outerKey === 'r1' ? 'r₁' : 'r₀';
  // On the revolved form r₀ is only the core: the crest stands proud of it, and
  // that relief is what has to come out of the kiln's allowance first.
  const reliefOutward = m.firedOuterDiameterMm / 2 - outerRadius(params);
  const kilnRadiusRaw = guidance.maxOuterRadiusMm - reliefOutward;
  const kilnRadius = snapDown(outerKey, kilnRadiusRaw);
  const kilnRadiusWorks = kilnRadiusRaw >= PARAM_RANGES[outerKey].min;
  checks.push({
    id: 'kiln',
    labelEs: 'Diámetro en crudo',
    labelEn: 'Green diameter',
    level: kilnOk ? 'ok' : 'fail',
    value: `${n(m.greenOuterDiameterMm)} mm`,
    limit: `≤ ${n(params.kilnLimitMm)} mm`,
    explainEs:
      'Diámetro exterior antes de cocer: el cocido dividido por (1 − contracción). Es el tamaño que tiene que entrar en el horno.',
    explainEn:
      'Outer diameter before firing: the fired size divided by (1 − shrinkage). This is what has to fit in the kiln.',
    adviceEs: kilnOk
      ? null
      : `Baje ${outerName} a ${show(kilnRadius)} mm (ahora ${n(outerRadius(params))}), o suba el límite del horno a ${up(m.greenOuterDiameterMm)} mm si cabe de verdad.`,
    adviceEn: kilnOk
      ? null
      : `Drop ${outerName} to ${show(kilnRadius)} mm (now ${n(outerRadius(params))}), or raise the kiln limit to ${up(m.greenOuterDiameterMm)} mm if it really fits.`,
    fix:
      kilnOk || !kilnRadiusWorks
        ? null
        : {
            patch: { [outerKey]: kilnRadius } as Partial<Params>,
            labelEs: `${outerName} → ${show(kilnRadius)} mm`,
            labelEn: `${outerName} → ${show(kilnRadius)} mm`,
          },
  });

  // --------------------------------------------------------------------- 3
  // The tide has to be readable in clay: one semidiurnal cycle must be wider
  // than the smallest feature the material will hold.
  const featureLevel: CheckLevel = atLeast(m.tideWavelengthMm, params.minFeatureMm * 1.5)
    ? 'ok'
    : atLeast(m.tideWavelengthMm, params.minFeatureMm)
      ? 'warn'
      : 'fail';
  const maxHours = maxWindowHoursForFeature(m.centerlineLengthMm, params.minFeatureMm);
  // Aim past the warning band, not at its edge, and round the resulting radii
  // UP, so rounding can only ever lengthen the wall.
  const targetLength = guidance.requiredLengthMm * 1.55;
  const featureTurns = snapUp('linearTurns', turnsForLength(params.r0, params.r1, targetLength));
  const featureScale = Number(up(radiusScaleForLength(m.centerlineLengthMm, targetLength), 2));

  // A ring can only grow until the kiln stops it. Once there, the remaining
  // lever is time: fewer hours around the same circumference.
  // The radius that makes the wall long enough: the target length shared out
  // over however many turns there are, which is one for a ring and several for
  // a cylinder.
  const ringRadius = snapUp('r0', targetLength / (2 * Math.PI * Math.max(Math.abs(m.turns), 1e-9)));
  const ringCap = snapDown('r0', guidance.maxOuterRadiusMm);
  const ringFits = ringRadius <= ringCap;
  const hoursThatFit = Math.max(
    24,
    Math.floor((m.centerlineLengthMm * M2_PERIOD_HOURS) / (params.minFeatureMm * 1.55)),
  );
  const shorterEnd = new Date(
    Date.parse(params.windowStartUtc) + hoursThatFit * 3_600_000,
  ).toISOString();

  let featureFix: CheckFix;
  let featureLeverEs: string;
  let featureLeverEn: string;
  if (revolved(params.clockMode)) {
    // The revolved form's wavelength is mm of height per tidal cycle, and the
    // pitch is the only thing that sets it: the window changes how MUCH record
    // the piece carries, not how much room each tide gets. So the lever is the
    // pitch, and the kiln is what stops it.
    const wantedPitch = snapUp('pitchMm', pitchForProfileLength(targetLength, m.turns));
    const pitchCeiling = snapDown('pitchMm', maxPitchForKiln(params, m.turns));
    if (wantedPitch <= pitchCeiling) {
      featureFix = {
        patch: { pitchMm: wantedPitch },
        labelEs: `paso → ${show(wantedPitch)} mm`,
        labelEn: `pitch → ${show(wantedPitch)} mm`,
      };
      featureLeverEs = `Suba el paso a ${show(wantedPitch)} mm para que el perfil mida ${up(targetLength)} mm de alto (ahora ${n(m.centerlineLengthMm)})`;
      featureLeverEn = `Raise the pitch to ${show(wantedPitch)} mm so the profile stands ${up(targetLength)} mm tall (now ${n(m.centerlineLengthMm)})`;
    } else {
      // The kiln caps the height, so the two have to move together: give each
      // tide the room it needs, then shorten the window until the piece fits.
      const neededMmPerHour = (params.minFeatureMm * 1.55) / M2_PERIOD_HOURS;
      const hoursPerTurn = m.windowHours / Math.max(Math.abs(m.turns), 1e-9);
      const pitchForTide = snapUp('pitchMm', neededMmPerHour * hoursPerTurn);
      const firedLimit = params.kilnLimitMm * (1 - params.shrinkagePct / 100);
      // Same allowance for the Moon's uneven pace as the piece-height check.
      const hoursInKiln = Math.max(24, Math.floor(firedLimit / (neededMmPerHour * 1.15)));
      const tighterEnd = windowEndAfter(params.windowStartUtc, hoursInKiln);
      featureFix = {
        patch: { pitchMm: pitchForTide, windowEndUtc: tighterEnd },
        labelEs: `paso → ${show(pitchForTide)} mm, ventana → ${Math.floor(hoursInKiln / 24)} días`,
        labelEn: `pitch → ${show(pitchForTide)} mm, window → ${Math.floor(hoursInKiln / 24)} days`,
      };
      featureLeverEs = `El horno no admite más de ${show(pitchCeiling)} mm por vuelta con esta ventana, así que mueva los dos: paso ${show(pitchForTide)} mm y ventana de ${Math.floor(hoursInKiln / 24)} días`;
      featureLeverEn = `The kiln will not take more than ${show(pitchCeiling)} mm per turn at this window, so move both: pitch ${show(pitchForTide)} mm and a ${Math.floor(hoursInKiln / 24)}-day window`;
    }
  } else if (!growsOutward(params.clockMode)) {
    if (ringFits) {
      featureFix = {
        patch: { r0: ringRadius },
        labelEs: `r₀ → ${show(ringRadius)} mm`,
        labelEn: `r₀ → ${show(ringRadius)} mm`,
      };
      featureLeverEs = `Suba r₀ a ${show(ringRadius)} mm para que el anillo mida ${up(targetLength)} mm de contorno (ahora ${n(m.centerlineLengthMm)})`;
      featureLeverEn = `Raise r₀ to ${show(ringRadius)} mm so the ring measures ${up(targetLength)} mm around (now ${n(m.centerlineLengthMm)})`;
    } else {
      featureFix = {
        patch: { windowEndUtc: shorterEnd },
        labelEs: `ventana → ${Math.floor(hoursThatFit / 24)} días`,
        labelEn: `window → ${Math.floor(hoursThatFit / 24)} days`,
      };
      featureLeverEs = `El horno no admite un anillo mayor que r₀ = ${show(ringCap)} mm, así que meta menos tiempo en el mismo contorno: acorte la ventana a ${Math.floor(hoursThatFit / 24)} días`;
      featureLeverEn = `The kiln will not take a ring past r₀ = ${show(ringCap)} mm, so put less time around the same circumference: shorten the window to ${Math.floor(hoursThatFit / 24)} days`;
    }
  } else if (guidance.turnsAreUserSet) {
    featureFix = {
      patch: { linearTurns: featureTurns },
      labelEs: `vueltas → ${featureTurns}`,
      labelEn: `turns → ${featureTurns}`,
    };
    featureLeverEs = `Suba las vueltas a ${featureTurns} para alargar el muro a ${up(targetLength)} mm (ahora ${n(m.centerlineLengthMm)})`;
    featureLeverEn = `Raise the turns to ${featureTurns} to lengthen the wall to ${up(targetLength)} mm (now ${n(m.centerlineLengthMm)})`;
  } else {
    featureFix = {
      patch: {
        r0: snapUp('r0', params.r0 * featureScale),
        r1: snapUp('r1', params.r1 * featureScale),
      },
      labelEs: `radios → ${snapUp('r0', params.r0 * featureScale)} / ${snapUp('r1', params.r1 * featureScale)} mm`,
      labelEn: `radii → ${snapUp('r0', params.r0 * featureScale)} / ${snapUp('r1', params.r1 * featureScale)} mm`,
    };
    featureLeverEs = `Multiplique r₀ y r₁ por ${featureScale} para alargar el muro a ${up(targetLength)} mm (ahora ${n(m.centerlineLengthMm)})`;
    featureLeverEn = `Multiply r₀ and r₁ by ${featureScale} to lengthen the wall to ${up(targetLength)} mm (now ${n(m.centerlineLengthMm)})`;
  }

  checks.push({
    id: 'tideWavelength',
    labelEs: 'Longitud de onda de la marea',
    labelEn: 'Tide wavelength',
    level: featureLevel,
    value: `${n(m.tideWavelengthMm)} mm`,
    limit: `≥ ${n(params.minFeatureMm)} mm`,
    explainEs: revolved(params.clockMode)
      ? 'Altura que ocupa un ciclo de marea (12,42 h) sobre el perfil: altura × 12,42 ÷ horas de la ventana. Por debajo del detalle mínimo la marea deja de leerse en la arcilla. Aquí lo fija el paso, no la ventana.'
      : 'Arco que ocupa un ciclo de marea (12,42 h) sobre el borde superior: longitud × 12,42 ÷ horas de la ventana. Por debajo del detalle mínimo la marea deja de leerse en la arcilla.',
    explainEn: revolved(params.clockMode)
      ? 'Height one tidal cycle (12.42 h) occupies up the profile: height × 12.42 ÷ window hours. Below the minimum feature the tide stops reading in clay. Here the pitch sets it, not the window.'
      : 'Arc one tidal cycle (12.42 h) occupies along the top edge: length × 12.42 ÷ window hours. Below the minimum feature the tide stops reading in clay.',
    adviceEs:
      featureLevel === 'ok'
        ? null
        : revolved(params.clockMode)
          ? `${featureLeverEs}. Acortar la ventana no sirve aquí: la pieza se acorta pero cada marea ocupa lo mismo. O acepte el tamaño y suba el suavizado por encima de ${n(params.minFeatureMm)} mm para quitar la oscilación fina a propósito.`
          : `${featureLeverEs}. O acorte la ventana a ≤ ${Math.floor(maxHours / 24)} días. O acepte el tamaño y suba el suavizado por encima de ${n(params.minFeatureMm)} mm para quitar la oscilación fina a propósito.`,
    adviceEn:
      featureLevel === 'ok'
        ? null
        : revolved(params.clockMode)
          ? `${featureLeverEn}. Shortening the window does not help here: the piece gets shorter but each tide still gets the same room. Or accept the size and raise the smoothing above ${n(params.minFeatureMm)} mm to drop the fine oscillation on purpose.`
          : `${featureLeverEn}. Or shorten the window to ≤ ${Math.floor(maxHours / 24)} days. Or accept the size and raise the smoothing above ${n(params.minFeatureMm)} mm to drop the fine oscillation on purpose.`,
    fix: featureLevel === 'ok' ? null : featureFix,
  });

  // --------------------------------------------------------------------- 4
  // Height stays in a buildable band.
  const tooTall = !atMost(m.wallHeightMaxMm, params.maxHeightMm);
  const tooThin = m.wallHeightMinMm < 0.5;
  const heightOk = !tooTall && !tooThin;
  const safeK = snapDown('k', maxGainForHeight(params, wall.signal.range));
  const safeBase = snapUp('hBase', params.hBase + (0.5 - m.wallHeightMinMm));
  const heightFix: CheckFix = tooTall
    ? { patch: { k: safeK }, labelEs: `k → ${safeK} mm/cm`, labelEn: `k → ${safeK} mm/cm` }
    : { patch: { hBase: safeBase }, labelEs: `h_base → ${show(safeBase)} mm`, labelEn: `h_base → ${show(safeBase)} mm` };
  checks.push({
    id: 'wallHeight',
    labelEs: revolved(params.clockMode) ? 'Relieve de la marea' : 'Altura del muro',
    labelEn: revolved(params.clockMode) ? 'Tide relief' : 'Wall height',
    level: heightOk ? 'ok' : 'fail',
    value: `${n(m.wallHeightMinMm)}–${n(m.wallHeightMaxMm)} mm`,
    limit: `≤ ${n(params.maxHeightMm)} mm`,
    explainEs: revolved(params.clockMode)
      ? 'Cuánto sale la marea del radio base, ya con las muescas: h_base en la bajamar más k por cada cm de marea. Es lo que separa la cintura del vientre de la pieza.'
      : 'Altura del borde superior ya con las muescas: h_base en la bajamar más k por cada cm de marea. El máximo es lo que un muro de losa aguanta de pie.',
    explainEn: revolved(params.clockMode)
      ? 'How far the tide stands out from the core radius, with the notches already cut: h_base at low water plus k per cm of tide. It is the difference between the piece\'s waist and its belly.'
      : 'Height of the top edge with the notches already cut: h_base at low water plus k per cm of tide. The maximum is what a slab wall will stand up in.',
    adviceEs: heightOk
      ? null
      : tooTall
        ? `Baje k a ${safeK} mm/cm (ahora ${n(params.k, 2)}), o suba la altura máxima a ${up(m.wallHeightMaxMm)} mm.`
        : `Alguna muesca llega casi al suelo. Suba h_base a ${show(safeBase)} mm, o baje la profundidad de las muescas.`,
    adviceEn: heightOk
      ? null
      : tooTall
        ? `Drop k to ${safeK} mm/cm (now ${n(params.k, 2)}), or raise the maximum height to ${up(m.wallHeightMaxMm)} mm.`
        : `A notch is cutting almost to the floor. Raise h_base to ${show(safeBase)} mm, or make the notches shallower.`,
    fix: heightOk ? null : heightFix,
  });

  // -------------------------------------------------------------------- 5a
  // The revolved form is not built as a length of wall at all: it is thrown or
  // coiled up as one vessel, so what is scarce is the HEIGHT of the kiln rather
  // than the hours at the bench. The window and the height are the same knob
  // here — the pitch fixes the mm per hour, so fewer hours is a shorter piece
  // with the tide unchanged — which makes the window the honest lever.
  if (revolved(params.clockMode)) {
    const greenHeight = m.totalHeightMm * greenScale(params);
    const fits = atMost(greenHeight, params.kilnLimitMm);
    const firedLimit = params.kilnLimitMm * (1 - params.shrinkagePct / 100);
    // mm per hour is a WINDOW AVERAGE, and the piece rises with the Moon's
    // phase rather than with the clock: the same hours near perigee are up to
    // about 12% taller than near apogee. So the suggested window keeps that
    // much in hand, or the one click would land just outside the kiln again.
    const unevenMoon = 1.15;
    const hoursInKiln = Math.max(
      24,
      Math.floor(firedLimit / Math.max(m.mmPerHour * unevenMoon, 1e-9)),
    );
    const kilnEnd = windowEndAfter(params.windowStartUtc, hoursInKiln);
    const kilnHours = (Date.parse(kilnEnd) - Date.parse(params.windowStartUtc)) / 3_600_000;
    const shortEnough = kilnHours < m.windowHours;
    const shorterPitch = snapDown('pitchMm', maxPitchForKiln(params, m.turns));

    checks.push({
      id: 'pieceHeight',
      labelEs: 'Altura de la pieza',
      labelEn: 'Piece height',
      level: fits ? 'ok' : 'fail',
      value: `${n(greenHeight)} mm`,
      limit: `≤ ${n(params.kilnLimitMm)} mm`,
      explainEs:
        'Alto en crudo de la pieza entera: vueltas × paso ÷ (1 − contracción). Se compara con la misma medida del horno que el diámetro, porque es la cámara la que tiene que admitirla de pie.',
      explainEn:
        'Green height of the whole piece: turns × pitch ÷ (1 − shrinkage). It is held against the same kiln measure as the diameter, because it is the chamber that has to take it standing up.',
      adviceEs: fits
        ? null
        : shortEnough
          ? `Acorte la ventana a ${Math.round(kilnHours / 24)} días: la pieza baja a ${down(kilnHours * m.mmPerHour * greenScale(params))} mm en crudo y la marea no cambia de forma, porque los mm por hora los fija el paso.`
          : `Baje el paso a ${show(shorterPitch)} mm. Con esta ventana no hay recorte que baste, pero ojo: bajar el paso cierra la curvatura del perfil.`,
      adviceEn: fits
        ? null
        : shortEnough
          ? `Shorten the window to ${Math.round(kilnHours / 24)} days: the piece comes down to ${down(kilnHours * m.mmPerHour * greenScale(params))} mm green and the tide does not change shape at all, because the pitch is what fixes the mm per hour.`
          : `Drop the pitch to ${show(shorterPitch)} mm. No amount of trimming this window will do it — but mind that a lower pitch tightens the profile's curvature.`,
      fix: fits
        ? null
        : shortEnough
          ? {
              patch: { windowEndUtc: kilnEnd },
              labelEs: `ventana → ${Math.round(kilnHours / 24)} días`,
              labelEn: `window → ${Math.round(kilnHours / 24)} days`,
            }
          : {
              patch: { pitchMm: shorterPitch },
              labelEs: `paso → ${show(shorterPitch)} mm`,
              labelEn: `pitch → ${show(shorterPitch)} mm`,
            },
    });
  }

  // --------------------------------------------------------------------- 5
  // Handwork: how much wall there is to build.
  const lengthLevel: CheckLevel = atMost(m.centerlineLengthMm, 1200)
    ? 'ok'
    : atMost(m.centerlineLengthMm, 2000)
      ? 'warn'
      : 'fail';
  const comfortableTurns = snapDown('linearTurns', turnsForLength(params.r0, params.r1, 1200));
  const comfortableScale = Number(down(radiusScaleForLength(m.centerlineLengthMm, 1200), 2));
  const comfortableRing = snapDown('r0', 1200 / (2 * Math.PI * Math.max(m.turns, 1e-9)));
  // The short window is the brief's own answer to a long wall, so it leads
  // whenever the window is long enough for it to be a real change. In linear
  // mode the window sets no length at all — the turns do — so it is skipped
  // there, and a ring's only lever is its radius.
  // Offering the short window is only honest if it would actually bring the
  // wall under budget. The turns of a lunar mode scale with the window, so the
  // length after the preset can be estimated before proposing it.
  const shortWindowHours =
    (Date.parse(SHORT_WINDOW_PRESET.windowEndUtc!) - Date.parse(SHORT_WINDOW_PRESET.windowStartUtc!)) /
    3_600_000;
  const turnsAfterShort = m.turns * (shortWindowHours / Math.max(m.windowHours, 1));
  const shortWindowHelps =
    m.windowHours > 20 * 24 && approximateLength(params.r0, params.r1, turnsAfterShort) <= 1200;

  let lengthFix: CheckFix;
  let lengthLeverEs: string;
  let lengthLeverEn: string;
  if (!growsOutward(params.clockMode)) {
    lengthFix = {
      patch: { r0: comfortableRing },
      labelEs: `r₀ → ${show(comfortableRing)} mm`,
      labelEn: `r₀ → ${show(comfortableRing)} mm`,
    };
    lengthLeverEs = `Baje r₀ a ${show(comfortableRing)} mm, que da un anillo de 1.2 m de contorno`;
    lengthLeverEn = `Drop r₀ to ${show(comfortableRing)} mm, which gives a ring 1.2 m around`;
  } else if (guidance.turnsAreUserSet) {
    lengthFix = {
      patch: { linearTurns: comfortableTurns },
      labelEs: `vueltas → ${comfortableTurns}`,
      labelEn: `turns → ${comfortableTurns}`,
    };
    lengthLeverEs = `Baje las vueltas a ${comfortableTurns}`;
    lengthLeverEn = `Drop the turns to ${comfortableTurns}`;
  } else if (shortWindowHelps) {
    lengthFix = {
      patch: { ...SHORT_WINDOW_PRESET },
      labelEs: 'ventana del jarrón',
      labelEn: 'vase window',
    };
    lengthLeverEs =
      'Vuelva a la ventana del jarrón (1 – 12 oct, las dos erupciones de octubre)';
    lengthLeverEn = 'Go back to the vase window (1 – 12 Oct, the two October eruptions)';
  } else {
    lengthFix = {
      patch: {
        r0: snapDown('r0', params.r0 * comfortableScale),
        r1: snapDown('r1', params.r1 * comfortableScale),
      },
      labelEs: `radios → ${snapDown('r0', params.r0 * comfortableScale)} / ${snapDown('r1', params.r1 * comfortableScale)} mm`,
      labelEn: `radii → ${snapDown('r0', params.r0 * comfortableScale)} / ${snapDown('r1', params.r1 * comfortableScale)} mm`,
    };
    lengthLeverEs = `Multiplique r₀ y r₁ por ${comfortableScale}`;
    lengthLeverEn = `Multiply r₀ and r₁ by ${comfortableScale}`;
  }

  // Only the coiled forms are built as a strip of wall; the revolved form
  // reports its height above instead.
  if (!revolved(params.clockMode)) checks.push({
    id: 'wallLength',
    labelEs: 'Longitud del muro',
    labelEn: 'Wall length',
    level: lengthLevel,
    value: `${n(m.centerlineLengthMm / 1000, 2)} m`,
    limit: '≤ 1.2 m',
    explainEs:
      'Metros de muro de losa que hay que levantar a mano. No es un límite físico, es el presupuesto de trabajo: por encima de 1,2 m la pieza se vuelve larga de hacer.',
    explainEn:
      'Metres of slab wall to be built by hand. Not a physical limit but a work budget: past 1.2 m the piece gets long to make.',
    adviceEs:
      lengthLevel === 'ok'
        ? null
        : `${lengthLeverEs}. Como alternativa, acorte la ventana a mano o baje los radios.`,
    adviceEn:
      lengthLevel === 'ok'
        ? null
        : `${lengthLeverEn}. Failing that, shorten the window by hand or lower the radii.`,
    fix: lengthLevel === 'ok' ? null : lengthFix,
  });

  // --------------------------------------------------------------------- 6
  // Every event in the window got a notch, and no notch was clamped away.
  //
  // A notch is clamped when it is deeper than the wall is tall WHERE IT SITS, so
  // the limit has to be solved against the lowest crest inside each notch's own
  // span, not against the wall's overall minimum — and against the parameter
  // that actually sets that notch's depth, which is k_e for an event with a
  // plume and d₀ for one without.
  const clamped = wall.clampedNotches;
  const droppedIds = wall.droppedEvents.map((event) => event.id);
  const limits = notchDepthLimits(wall, params);
  const deepest = wall.notches.reduce((worst, notch) => Math.max(worst, notch.depth), 0);
  const perKmOver = params.notchDepthPerKm > limits.maxDepthPerKm;
  const depth0Over = params.notchDepth0 > limits.maxDepth0;
  const safePerKm = snapDown('notchDepthPerKm', limits.maxDepthPerKm);
  const safeDepth0 = snapDown('notchDepth0', limits.maxDepth0);

  const notchFix: CheckFix | null = perKmOver
    ? {
        patch: { notchDepthPerKm: safePerKm },
        labelEs: `prof./km → ${safePerKm} mm/km`,
        labelEn: `depth/km → ${safePerKm} mm/km`,
      }
    : depth0Over
      ? { patch: { notchDepth0: safeDepth0 }, labelEs: `d₀ → ${safeDepth0} mm`, labelEn: `d₀ → ${safeDepth0} mm` }
      : null;

  const notchLeverEs = perKmOver
    ? `Baje la profundidad por km a ${safePerKm} mm/km`
    : depth0Over
      ? `Baje d₀ a ${safeDepth0} mm`
      : 'Suba k o h_base para tener más muro donde cortar';
  const notchLeverEn = perKmOver
    ? `Drop the depth per km to ${safePerKm} mm/km`
    : depth0Over
      ? `Drop d₀ to ${safeDepth0} mm`
      : 'Raise k or h_base for more wall to cut into';

  checks.push({
    id: 'notches',
    labelEs: 'Muescas de erupción',
    labelEn: 'Eruption notches',
    level: clamped.length === 0 ? 'ok' : 'warn',
    value: `${m.notchCount}`,
    limit: clamped.length > 0 ? `recortadas: ${clamped.join(', ')}` : 'sin recortes',
    explainEs:
      'Una muesca por erupción dentro de la ventana. Las de día entero salen anchas y poco profundas; las instantáneas, estrechas y tan hondas como alta fue la pluma. Si una corta más que el muro, se recorta y deja 1 mm de suelo.',
    explainEn:
      'One notch per eruption inside the window. Day-precision events come out wide and shallow; instants come out narrow and as deep as the plume was tall. If one cuts deeper than the wall, it is clamped and 1 mm of floor is left.',
    adviceEs:
      clamped.length > 0
        ? `${notchLeverEs}. ${clamped.join(', ')} corta hasta ${n(deepest)} mm donde el muro mide ${n(limits.lowestCrestAtNotch)} mm; también puede subir k o h_base para tener más muro donde cortar.`
        : null,
    adviceEn:
      clamped.length > 0
        ? `${notchLeverEn}. ${clamped.join(', ')} cuts up to ${n(deepest)} mm where the wall is ${n(limits.lowestCrestAtNotch)} mm tall; you can also raise k or h_base for more wall to cut into.`
        : null,
    fix: clamped.length > 0 ? notchFix : null,
  });

  // --------------------------------------------------------------------- 7
  // Which eruptions made it onto the piece. This is the window's doing, not a
  // parameter to nudge, so it is reported separately from the notch depths and
  // carries no button: only dates to reconsider.
  const totalEvents = m.notchCount + droppedIds.length;
  checks.push({
    id: 'eventCoverage',
    labelEs: 'Erupciones en la ventana',
    labelEn: 'Eruptions in the window',
    level: droppedIds.length === 0 ? 'ok' : 'warn',
    value: `${m.notchCount}/${totalEvents}`,
    limit: droppedIds.length === 0 ? 'todas' : `fuera: ${droppedIds.join(', ')}`,
    explainEs:
      'Cuántas de las erupciones curadas caen dentro de la ventana y reciben muesca. Las que quedan fuera siguen en la lista, atenuadas, pero no están en la pieza.',
    explainEn:
      'How many of the curated eruptions fall inside the window and get a notch. The ones outside stay in the list, dimmed, but they are not on the piece.',
    adviceEs:
      droppedIds.length === 0
        ? null
        : `${droppedIds.join(', ')} ${droppedIds.length === 1 ? 'queda' : 'quedan'} fuera de la ventana. Amplíe las fechas si ${droppedIds.length === 1 ? 'debe' : 'deben'} estar en la pieza; si no, es una decisión, no un error.`,
    adviceEn:
      droppedIds.length === 0
        ? null
        : `${droppedIds.join(', ')} ${droppedIds.length === 1 ? 'falls' : 'fall'} outside the window. Widen the dates if ${droppedIds.length === 1 ? 'it belongs' : 'they belong'} on the piece; otherwise this is a choice, not a mistake.`,
    fix: null,
  });

  return { checks, measures: m };
}

/** Thinnest wall left under a notch floor, mm. Mirrors notches.ts. */
const MIN_FLOOR_MM = 1;

export interface NotchDepthLimits {
  /** Largest k_e that leaves a floor under every notch with a plume, mm/km. */
  maxDepthPerKm: number;
  /** Largest d₀ that leaves a floor under every notch without one, mm. */
  maxDepth0: number;
  /** Lowest undisturbed crest found inside any notch, mm. */
  lowestCrestAtNotch: number;
}

/**
 * Solve `crest − depth ≥ 1 mm` for each notch, against the LOWEST crest inside
 * that notch rather than at its leading edge — a 3 mm notch can straddle a
 * falling tide, and the shallow end is what clamps.
 *
 *   with a plume:    d₀ + k_e·km ≤ crest − 1   ⇒   k_e ≤ (crest − 1 − d₀) / km
 *   without, instant:          d₀ ≤ crest − 1
 *   without, day:          d₀ / 2 ≤ crest − 1   ⇒   d₀ ≤ 2 (crest − 1)
 *
 * Infinity means no notch of that kind constrains the parameter.
 */
export function notchDepthLimits(wall: Wall, params: Params): NotchDepthLimits {
  const samples = wall.spiral.samples;
  let maxDepthPerKm = Number.POSITIVE_INFINITY;
  let maxDepth0 = Number.POSITIVE_INFINITY;
  let lowestCrest = Number.POSITIVE_INFINITY;

  for (const notch of wall.notches) {
    let crest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i].s;
      if (s < notch.sStart) continue;
      if (s > notch.sEnd) break;
      crest = Math.min(crest, wall.undisturbed[i]);
    }
    if (!Number.isFinite(crest)) continue;
    lowestCrest = Math.min(lowestCrest, crest);

    const room = crest - MIN_FLOOR_MM;
    const plume = notch.event.plumeKm;
    if (plume !== null && plume > 0) {
      maxDepthPerKm = Math.min(maxDepthPerKm, Math.max((room - params.notchDepth0) / plume, 0));
    } else if (notch.dayPrecision) {
      maxDepth0 = Math.min(maxDepth0, Math.max(room * 2, 0));
    } else {
      maxDepth0 = Math.min(maxDepth0, Math.max(room, 0));
    }
  }

  return {
    maxDepthPerKm,
    maxDepth0,
    lowestCrestAtNotch: Number.isFinite(lowestCrest) ? lowestCrest : 0,
  };
}

export interface ManifoldReport {
  watertight: boolean;
  triangleCount: number;
  vertexCount: number;
  /** Edges used by exactly two triangles, in opposite directions. */
  properEdges: number;
  /** Edges used once: a hole. */
  boundaryEdges: number;
  /** Edges used more than twice, or twice in the same direction. */
  nonManifoldEdges: number;
  /** Triangles with two identical corners. */
  degenerateTriangles: number;
  /** Signed volume, mm^3. Positive means the surface faces outward. */
  volumeMm3: number;
  /** Euler characteristic V - E + F; 2 for a closed surface of genus 0. */
  eulerCharacteristic: number;
}

/**
 * Manifold check on an indexed mesh.
 *
 * A closed, consistently oriented surface uses every undirected edge exactly
 * twice, once in each direction. Counting directed edges therefore catches both
 * holes (an edge used once) and flipped faces (an edge used twice the same way)
 * in a single pass.
 */
export function checkManifold(mesh: MeshData): ManifoldReport {
  const directed = new Map<string, number>();
  let degenerate = 0;

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    if (a === b || b === c || a === c) {
      degenerate += 1;
      continue;
    }
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = `${from}>${to}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }

  let proper = 0;
  let boundary = 0;
  let nonManifold = 0;
  const seen = new Set<string>();

  for (const [key, count] of directed) {
    const [from, to] = key.split('>');
    const undirected = Number(from) < Number(to) ? `${from}|${to}` : `${to}|${from}`;
    if (seen.has(undirected)) continue;
    seen.add(undirected);

    const forward = count;
    const backward = directed.get(`${to}>${from}`) ?? 0;
    if (forward === 1 && backward === 1) proper += 1;
    else if (forward + backward === 1) boundary += 1;
    else nonManifold += 1;
  }

  const vertexCount = mesh.positions.length / 3;
  const faceCount = mesh.indices.length / 3;
  const edgeCount = seen.size;

  return {
    watertight: boundary === 0 && nonManifold === 0 && degenerate === 0,
    triangleCount: faceCount,
    vertexCount,
    properEdges: proper,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    degenerateTriangles: degenerate,
    volumeMm3: mesh.volume,
    eulerCharacteristic: vertexCount - edgeCount + faceCount,
  };
}

/** Every event either has a notch or is reported as outside the window. */
export function checkNotchCoverage(
  wall: Wall,
  events: VolcanoEvent[],
): { covered: number; dropped: string[]; complete: boolean } {
  const dropped = wall.droppedEvents.map((event) => event.id);
  return {
    covered: wall.notches.length,
    dropped,
    complete: wall.notches.length + dropped.length === events.length,
  };
}
