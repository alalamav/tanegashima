/**
 * The spec sheet: the label that makes the piece verifiable.
 *
 * Parameters, equations, data sources with URLs and SHA-256 hashes, the datum
 * used, the gap-fill list with its fit residual, the event table with precision
 * flags, the build date and the code version. Anyone holding the fired piece and
 * this sheet can rebuild the same geometry from the same raw files.
 */

import type { BuildMeta, Series, VolcanoEvent } from '../data/series.js';
import { configHash, greenScale, revolved, type Params } from '../geom/params.js';
import { measure, runChecks, checkManifold } from '../geom/validate.js';
import { buildWallMesh, type Wall } from '../geom/wall.js';
import { precisionLabel, type Lang } from '../i18n/strings.js';
import { stripRanges } from './templates.js';
import { downloadText, exportName } from './download.js';

export const EQUATIONS = [
  'astro(t) = obs(t) - dep(t)',
  'elev(t) = obs(t) + d_1999,   d_1999 = -374.5 cm',
  'astro(t) ~ a0 + sum_{k in {M2,S2,N2,K1,O1,Q1}} [ a_k cos(w_k t) + b_k sin(w_k t) ]',
  'theta(t) = unwrapped MoonPhase(t)   [synodic]   |   2 x unwrapped MoonPhase(t)   [spring-neap]',
  'r(theta) = r0 + (r1 - r0) (theta - theta_start) / (theta_end - theta_start)',
  'P(theta) = ( r cos(theta + theta_ref), r sin(theta + theta_ref) )',
  'h(t) = h_base + k ( s(t) - s_min )',
  'z(t) = pitch (theta(t) - theta_start) / 2pi   [revolved: theta drives height, not direction]',
  'R(z) = r0 + h(t(z)),   P = ( R cos phi, R sin phi, z ) for phi in [0, 2pi)   [revolved]',
  'R_in(z) = min over |dz| <= t_wall of [ R(z + dz) - sqrt(t_wall^2 - dz^2) ]   [revolved bore]',
  'notch depth d = d_0 + k_e * plume_km   [instant]   |   d_0 / 2   [day precision]',
  'green size = fired size / (1 - shrinkage)',
];


/**
 * What each dimension of THIS configuration carries.
 *
 * It is not one sentence per mode out of tidiness: the revolved form genuinely
 * swaps two of the rows round — the Moon runs up the axis and the tide becomes
 * the radius — and a spec sheet that said otherwise would be describing a
 * different object from the one its own mesh exports.
 */
function mappingFor(params: Params): Record<string, string> {
  const angle =
    params.clockMode === 'linear'
      ? 'uniform in time (control mode; nothing is aligned)'
      : params.clockMode === 'springNeap'
        ? '2 x lunar phase, unwrapped; 0 deg = new moon and full moon alike'
        : params.clockMode === 'circle'
          ? 'lunar phase, scaled so the window is exactly one turn; 0 deg = new moon at the seam'
          : 'lunar phase, unwrapped; 0 deg = new moon';
  const signal = `${params.signal}, Tanegashima observed hourly sea level`;

  if (revolved(params.clockMode)) {
    return {
      height: `${angle} — on this form the phase drives HEIGHT: ${params.pitchMm} mm of rise per synodic month`,
      radius: `${signal}, measured out from the core radius r0`,
      angle: 'none: the piece is a surface of revolution, identical on every side',
      wall: 'constant thickness where the profile allows, eroded inward by a disc of t_wall where it does not',
      notches: 'Pichincha eruptions, at their UTC instant; a ring cut round the whole piece, deeper for a taller plume',
    };
  }

  return {
    angle,
    radius:
      params.clockMode === 'circle'
        ? 'constant at r0: the wall closes into a ring'
        : 'elapsed time, linear in the angle',
    height: signal,
    notches: 'Pichincha eruptions, at their UTC instant; deeper for a taller plume',
  };
}

export interface SpecSheet {
  piece: {
    title: string;
    builtAtUtc: string;
    configHash: string;
    codeVersion: string;
  };
  mapping: Record<string, string>;
  params: Params;
  derived: ReturnType<typeof measure> & {
    greenScale: number;
    wallVolumeCm3: number;
    watertight: boolean;
    strips: number;
    stripLengthsMm: number[];
  };
  checks: ReturnType<typeof runChecks>['checks'];
  data: {
    station: Series['station'];
    windowUtc: [string, string];
    hoursInWindow: number;
    datumCm: number;
    datumSource: string;
    datumVerified: boolean;
    signal: Params['signal'];
    signalRangeCm: number;
    reconstructedHours: number;
    gaps: BuildMeta['gaps'];
    harmonicFit: BuildMeta['harmonicFit'];
    inputs: BuildMeta['inputs'];
    buildChecks: BuildMeta['checks'];
  };
  events: Array<{
    id: string;
    utc: string;
    precision: string;
    precisionNote: string;
    label: string;
    plumeKm: number | null;
    plumeRef: string;
    sourceUrl: string;
    notes: string;
    moonPhaseDeg: number;
    seaElevationCm: number;
    notchDepthMm: number | null;
    arcPositionMm: number | null;
    inWindow: boolean;
  }>;
  equations: string[];
  framing: string;
}

export function buildSpec(
  wall: Wall,
  params: Params,
  series: Series,
  events: VolcanoEvent[],
  meta: BuildMeta,
  lang: Lang,
): SpecSheet {
  const mesh = buildWallMesh(wall, params);
  const m = measure(wall, params);
  const ranges = stripRanges(wall, params);
  const scale = greenScale(params);

  return {
    piece: {
      title: lang === 'es' ? 'Dos relojes' : 'Two clocks',
      builtAtUtc: new Date().toISOString(),
      configHash: configHash(params),
      codeVersion: meta.scriptVersion,
    },
    mapping: mappingFor(params),
    params,
    derived: {
      ...m,
      greenScale: scale,
      wallVolumeCm3: mesh.volume / 1000,
      watertight: checkManifold(mesh).watertight,
      strips: ranges.length,
      stripLengthsMm: ranges.map((range) => (range.sEndWithTab - range.sStart) * scale),
    },
    checks: runChecks(wall, params).checks,
    data: {
      station: series.station,
      windowUtc: [params.windowStartUtc, params.windowEndUtc],
      hoursInWindow: wall.clock.window.count,
      datumCm: series.window.datumCm,
      datumSource: meta.datumSource,
      datumVerified: meta.datumVerified,
      signal: params.signal,
      signalRangeCm: wall.signal.range,
      reconstructedHours: meta.gaps.reduce((total, gap) => total + gap.hours, 0),
      gaps: meta.gaps,
      harmonicFit: meta.harmonicFit,
      inputs: meta.inputs,
      buildChecks: meta.checks,
    },
    events: events.map((event) => {
      const notch = wall.notches.find((candidate) => candidate.eventId === event.id);
      return {
        id: event.id,
        utc: event.utc,
        precision: event.precision,
        precisionNote: precisionLabel(event.precision, lang),
        label: lang === 'es' ? event.labelEs : event.labelEn,
        plumeKm: event.plumeKm,
        plumeRef: event.plumeRef,
        sourceUrl: event.sourceUrl,
        notes: event.notes,
        moonPhaseDeg: event.sampled.phaseWrapped,
        seaElevationCm: event.sampled.elev,
        notchDepthMm: notch ? notch.depth : null,
        arcPositionMm: notch ? notch.sStart : null,
        inWindow: Boolean(notch),
      };
    }),
    equations: EQUATIONS,
    framing:
      lang === 'es'
        ? 'La alineación con la Luna se muestra, no se explica. Ninguna relación causal entre la marea de Tanegashima y las erupciones del Pichincha se afirma aquí.'
        : "The Moon alignment is shown, not explained. No causal relation between Tanegashima's tide and Pichincha's eruptions is claimed here.",
  };
}

export function exportSpecJson(spec: SpecSheet, params: Params): void {
  downloadText(`${JSON.stringify(spec, null, 2)}\n`, exportName(params, 'spec', 'json'), 'application/json');
}
