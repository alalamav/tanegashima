/**
 * 1:1 cutting templates, as SVG in real millimetres.
 *
 * Everything here is scaled UP by 1/(1 - shrinkage): the clay is cut at green
 * size and the fired piece is what the 3D view shows. The SVG root carries
 * `width`/`height` in mm with a matching viewBox in mm, so the file prints at
 * true size in any viewer that honours units — and the 100 mm calibration
 * square on every sheet is there to catch the viewers that do not.
 *
 * Two sheets:
 *   plan    the spiral in plan: centerline, inner and outer wall lines, notch
 *           positions, the new-moon direction, day ticks every 7 days and a
 *           centre cross to set the piece out on the board.
 *
 *           On the revolved form there is no plan to set out — every turn
 *           projects onto the same circle and the piece is the same on every
 *           side — so this sheet becomes the RIB: the silhouette at 1:1, with
 *           the axis of revolution down the left edge. Cut it out of ply or
 *           sheet plastic and it is the tool that makes the pot.
 *   strips  the wall unrolled along its centerline, x = arc length and
 *           y = height, split into pieces no longer than stripMaxMm with
 *           numbered joints and 10 mm overlap tabs. On the revolved form the
 *           same sheet reads as the profile cut into page lengths, since there
 *           arc length is height up the axis and height is radius.
 */

import type { Series } from '../data/series.js';
import { HOUR_MS } from '../data/series.js';
import { configHash, greenScale, type Params } from '../geom/params.js';
import type { Wall } from '../geom/wall.js';
import { shortDate, type Lang } from '../i18n/strings.js';
import { downloadText, exportName } from './download.js';

const INK = '#141414';
const PAPER = '#ffffff';
const RED = '#ff2a2a';
const FAINT = '#9a9a9a';

/** Overlap tab added to the end of each strip, mm. */
export const OVERLAP_MM = 10;
const MARGIN_MM = 18;
const CALIBRATION_MM = 100;

export interface TemplateSheet {
  id: string;
  widthMm: number;
  heightMm: number;
  svg: string;
}

const f = (value: number): string => (Math.abs(value) < 1e-9 ? '0' : value.toFixed(3));

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calibration square, scale note, sheet title and config hash. The square is
 * the only way to be sure a print came out at 100%: if it does not measure
 * 100 mm with a ruler, nothing else on the sheet can be trusted.
 */
function titleBlock(
  x: number,
  y: number,
  title: string,
  params: Params,
  lang: Lang,
  extra: string[],
): string {
  const hash = configHash(params);
  const printAt100 =
    lang === 'es'
      ? 'Imprimir al 100% — sin «ajustar a la página»'
      : 'Print at 100% — no “fit to page”';
  const calibration =
    lang === 'es'
      ? `Cuadrado de calibración: ${CALIBRATION_MM} mm de lado`
      : `Calibration square: ${CALIBRATION_MM} mm per side`;
  const scaleNote =
    lang === 'es'
      ? `Escala en crudo ×${greenScale(params).toFixed(4)} (contracción ${params.shrinkagePct}%)`
      : `Green scale ×${greenScale(params).toFixed(4)} (shrinkage ${params.shrinkagePct}%)`;

  const lines = [printAt100, calibration, scaleNote, ...extra];

  return `
  <g transform="translate(${f(x)} ${f(y)})">
    <rect x="0" y="0" width="${CALIBRATION_MM}" height="${CALIBRATION_MM}"
          fill="none" stroke="${INK}" stroke-width="0.4"/>
    <line x1="0" y1="0" x2="${CALIBRATION_MM}" y2="${CALIBRATION_MM}"
          stroke="${FAINT}" stroke-width="0.2" stroke-dasharray="2 2"/>
    <text x="2" y="-3" font-family="monospace" font-size="4" fill="${INK}">${escapeXml(title)}</text>
    <text x="2" y="${CALIBRATION_MM / 2 - 2}" font-family="monospace" font-size="3.2" fill="${INK}">${CALIBRATION_MM} mm</text>
    ${lines
      .map(
        (line, index) =>
          `<text x="${CALIBRATION_MM + 6}" y="${6 + index * 5}" font-family="monospace" font-size="3.4" fill="${INK}">${escapeXml(line)}</text>`,
      )
      .join('\n    ')}
    <text x="${CALIBRATION_MM + 6}" y="${6 + lines.length * 5}" font-family="monospace" font-size="3.4" fill="${FAINT}">cfg ${hash} · two clocks · Tanegashima TJ 1999 · Pichincha</text>
  </g>`;
}

function svgRoot(widthMm: number, heightMm: number, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
     width="${f(widthMm)}mm" height="${f(heightMm)}mm"
     viewBox="0 0 ${f(widthMm)} ${f(heightMm)}">
  <rect width="${f(widthMm)}" height="${f(heightMm)}" fill="${PAPER}"/>
${body}
</svg>
`;
}

/** The plan sheet: set the spiral out on the board from this. */
export function planSheet(wall: Wall, params: Params, series: Series, lang: Lang): TemplateSheet {
  // The revolved form has no plan worth printing; it has a profile.
  if (wall.clock.revolved) return profileSheet(wall, params, series, lang);

  const scale = greenScale(params);
  const outerRadius = (params.r1 + params.wallThickness / 2) * scale;
  const diameter = outerRadius * 2;
  const blockHeight = CALIBRATION_MM + 24;
  const width = diameter + MARGIN_MM * 2;
  const height = diameter + MARGIN_MM * 2 + blockHeight;
  const cx = MARGIN_MM + outerRadius;
  const cy = MARGIN_MM + outerRadius;

  const px = (x: number) => cx + x * scale;
  const py = (y: number) => cy - y * scale;

  // Every turn of a constant-radius piece projects onto the same circle in
  // plan, so only the first one is drawn: three overlaid copies would just
  // thicken the line and treble the file.
  const oneTurn = wall.clock.constantRadius
    ? wall.spiral.samples.filter(
        (sample) => sample.theta - wall.clock.thetaStart <= 2 * Math.PI + 1e-9,
      )
    : wall.spiral.samples;
  const samples = oneTurn.length > 1 ? oneTurn : wall.spiral.samples;
  const half = (params.wallThickness / 2) * scale;

  // A full circle has to be closed with Z, or the plotter leaves a gap at the
  // seam where the last sample meets the first.
  const close = wall.clock.constantRadius ? 'Z' : '';
  const polyline = (points: Array<[number, number]>, stroke: string, strokeWidth: number, dash = '') =>
    `<path d="${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('')}${close}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

  const centerline: Array<[number, number]> = [];
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  // One point per ~0.5 mm of fired arc is far more than a plotter needs; take
  // every fourth sample for a file that opens quickly.
  for (let i = 0; i < samples.length; i += 4) {
    const sample = samples[i];
    centerline.push([px(sample.x), py(sample.y)]);
    outer.push([px(sample.x) + sample.nx * half, py(sample.y) - sample.ny * half]);
    inner.push([px(sample.x) - sample.nx * half, py(sample.y) + sample.ny * half]);
  }
  const lastSample = samples[samples.length - 1];
  centerline.push([px(lastSample.x), py(lastSample.y)]);
  outer.push([px(lastSample.x) + lastSample.nx * half, py(lastSample.y) - lastSample.ny * half]);
  inner.push([px(lastSample.x) - lastSample.nx * half, py(lastSample.y) + lastSample.ny * half]);

  // Day ticks every 7 days, from the window start.
  const start = Date.parse(series.window.startUtc);
  const { i0, i1 } = wall.clock.window;
  const ticks: string[] = [];
  for (let hour = i0; hour <= i1; hour += 24 * 7) {
    const s = wall.spiral.arcLengthAtHour(hour);
    const sample = wall.spiral.sampleAtArcLength(s);
    const x1 = px(sample.x) - sample.nx * half * 1.6;
    const y1 = py(sample.y) + sample.ny * half * 1.6;
    const x2 = px(sample.x) + sample.nx * half * 1.6;
    const y2 = py(sample.y) - sample.ny * half * 1.6;
    ticks.push(
      `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${FAINT}" stroke-width="0.3"/>`,
    );
    const label = shortDate(new Date(start + hour * HOUR_MS), lang);
    ticks.push(
      `<text x="${f(x2 + sample.nx * 2)}" y="${f(y2 - sample.ny * 2)}" font-family="monospace" font-size="2.6" fill="${FAINT}">${escapeXml(label)}</text>`,
    );
  }

  // Notches, in red, drawn across the full wall band.
  const notchMarks = wall.notches
    .map((notch) => {
      const steps = Math.max(2, Math.ceil((notch.sEnd - notch.sStart) / 0.5));
      const outerSide: Array<[number, number]> = [];
      const innerSide: Array<[number, number]> = [];
      for (let k = 0; k <= steps; k += 1) {
        const s = notch.sStart + ((notch.sEnd - notch.sStart) * k) / steps;
        const sample = wall.spiral.sampleAtArcLength(s);
        outerSide.push([px(sample.x) + sample.nx * half, py(sample.y) - sample.ny * half]);
        innerSide.push([px(sample.x) - sample.nx * half, py(sample.y) + sample.ny * half]);
      }
      const ring = [...outerSide, ...innerSide.reverse()];
      const label = wall.spiral.sampleAtArcLength(notch.sEnd);
      return `<path d="${ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('')}Z" fill="none" stroke="${RED}" stroke-width="0.4"/>
    <text x="${f(px(label.x) + label.nx * (half + 3))}" y="${f(py(label.y) - label.ny * (half + 3))}" font-family="monospace" font-size="3" fill="${RED}">${escapeXml(notch.eventId)}</text>`;
    })
    .join('\n    ');

  // New-moon direction: theta = 0 in synodic mode, rotated by theta_ref.
  const refRad = (params.thetaRefDeg * Math.PI) / 180;
  const newMoonX = cx + Math.cos(refRad) * outerRadius * 1.04;
  const newMoonY = cy - Math.sin(refRad) * outerRadius * 1.04;
  const newMoonLabel = lang === 'es' ? 'luna nueva 0°' : 'new moon 0°';

  const body = `
  <g>
    <line x1="${f(cx - 12)}" y1="${f(cy)}" x2="${f(cx + 12)}" y2="${f(cy)}" stroke="${INK}" stroke-width="0.3"/>
    <line x1="${f(cx)}" y1="${f(cy - 12)}" x2="${f(cx)}" y2="${f(cy + 12)}" stroke="${INK}" stroke-width="0.3"/>
    <circle cx="${f(cx)}" cy="${f(cy)}" r="0.6" fill="${INK}"/>
    <line x1="${f(cx)}" y1="${f(cy)}" x2="${f(newMoonX)}" y2="${f(newMoonY)}" stroke="${FAINT}" stroke-width="0.3" stroke-dasharray="4 3"/>
    <text x="${f(newMoonX)}" y="${f(newMoonY - 2)}" font-family="monospace" font-size="3.2" fill="${INK}" text-anchor="middle">${escapeXml(newMoonLabel)}</text>
    ${ticks.join('\n    ')}
    ${polyline(centerline, FAINT, 0.25, '3 2')}
    ${polyline(outer, INK, 0.45)}
    ${polyline(inner, INK, 0.45)}
    ${notchMarks}
  </g>
${titleBlock(MARGIN_MM, diameter + MARGIN_MM * 2 + 8, lang === 'es' ? 'PLANTA 1:1' : 'PLAN 1:1', params, lang, [
    lang === 'es'
      ? `Diámetro exterior en crudo ${(diameter).toFixed(1)} mm · espesor ${(params.wallThickness * scale).toFixed(1)} mm`
      : `Green outer diameter ${(diameter).toFixed(1)} mm · thickness ${(params.wallThickness * scale).toFixed(1)} mm`,
    wall.spiral.closed
      ? lang === 'es'
        ? `Anillo cerrado · contorno ${(wall.spiral.length * scale).toFixed(0)} mm · una vuelta`
        : `Closed ring · ${(wall.spiral.length * scale).toFixed(0)} mm around · one turn`
      : lang === 'es'
        ? `Longitud de la línea central ${(wall.spiral.length * scale).toFixed(0)} mm · ${wall.spiral.turns.toFixed(2)} vueltas`
        : `Centerline length ${(wall.spiral.length * scale).toFixed(0)} mm · ${wall.spiral.turns.toFixed(2)} turns`,
  ])}`;

  return { id: 'plan', widthMm: width, heightMm: height, svg: svgRoot(width, height, body) };
}


/**
 * The rib: the revolved silhouette at 1:1, axis down the left edge.
 *
 * Everything is drawn in green millimetres like every other sheet, so the rib
 * cut from this makes a pot that comes out of the kiln at the size the 3D view
 * shows. Height runs UP the page because that is how the piece stands and how
 * the tool is held.
 */
function profileSheet(wall: Wall, params: Params, series: Series, lang: Lang): TemplateSheet {
  const scale = greenScale(params);
  const samples = wall.spiral.samples;
  const bore = wall.bore;
  const profileHeight = wall.spiral.length * scale;
  const widest = (params.r0 + Math.max(...wall.undisturbed)) * scale;

  const blockHeight = CALIBRATION_MM + 32;
  const width = widest + MARGIN_MM * 2 + 26;
  const height = profileHeight + MARGIN_MM * 2 + blockHeight;
  const axisX = MARGIN_MM;
  const baseY = MARGIN_MM + profileHeight;

  const px = (radius: number) => axisX + radius * scale;
  const py = (z: number) => baseY - z * scale;

  // One point per ~2 mm of green profile is more than a cutter needs.
  const stride = Math.max(1, Math.round(2 / Math.max(params.arcStepMm * scale, 0.05)));
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i < samples.length; i += stride) {
    const z = samples[i].z;
    outer.push(`${outer.length === 0 ? 'M' : 'L'}${f(px(params.r0 + wall.top[i]))} ${f(py(z))}`);
    if (bore) inner.push(`${inner.length === 0 ? 'M' : 'L'}${f(px(bore[i]))} ${f(py(z))}`);
  }
  const last = samples.length - 1;
  outer.push(`L${f(px(params.r0 + wall.top[last]))} ${f(py(samples[last].z))}`);
  if (bore) inner.push(`L${f(px(bore[last]))} ${f(py(samples[last].z))}`);

  // Day ticks on the axis side, with dates. A week-long window wants days; a
  // long one would drown in them, so the step follows the window.
  const start = Date.parse(series.window.startUtc);
  const { i0, i1 } = wall.clock.window;
  const tickStep = i1 - i0 > 14 * 24 ? 24 * 7 : 24;
  const ticks: string[] = [];
  for (let hour = i0; hour <= i1; hour += tickStep) {
    const z = wall.spiral.arcLengthAtHour(hour);
    const y = py(z);
    ticks.push(
      `<line x1="${f(axisX - 4)}" y1="${f(y)}" x2="${f(axisX + 4)}" y2="${f(y)}" stroke="${FAINT}" stroke-width="0.3"/>
    <text x="${f(axisX + 6)}" y="${f(y - 1.2)}" font-family="monospace" font-size="2.8" fill="${FAINT}">${escapeXml(shortDate(new Date(start + hour * HOUR_MS), lang))}</text>`,
    );
  }

  // Notches in red: on this form a cut is a ring round the piece, so it reads
  // as a step in the profile rather than a slot in an edge.
  const notchMarks = wall.notches
    .map((notch) => {
      const steps = Math.max(2, Math.ceil((notch.sEnd - notch.sStart) / 0.25));
      const points: string[] = [
        `M${f(px(params.r0 + interpolateCrest(wall, notch.sStart)))} ${f(py(notch.sStart))}`,
      ];
      for (let k = 0; k <= steps; k += 1) {
        const s = notch.sStart + ((notch.sEnd - notch.sStart) * k) / steps;
        points.push(`L${f(px(params.r0 + interpolateFloor(wall, s)))} ${f(py(s))}`);
      }
      points.push(`L${f(px(params.r0 + interpolateCrest(wall, notch.sEnd)))} ${f(py(notch.sEnd))}`);
      const middle = (notch.sStart + notch.sEnd) / 2;
      const label = `${notch.eventId}${notch.plumeUnknown ? ' ?' : ''}`;
      return `<path d="${points.join('')}" fill="none" stroke="${RED}" stroke-width="0.4"/>
    <text x="${f(px(params.r0 + interpolateCrest(wall, middle)) + 3)}" y="${f(py(middle))}" font-family="monospace" font-size="3" fill="${RED}">${escapeXml(label)}</text>`;
    })
    .join('\n    ');

  const axisLabel = lang === 'es' ? 'eje de revolución' : 'axis of revolution';
  const coreLabel = lang === 'es' ? `r₀ ${(params.r0 * scale).toFixed(1)} mm` : `r₀ ${(params.r0 * scale).toFixed(1)} mm`;

  const body = `
  <g>
    <line x1="${f(axisX)}" y1="${f(MARGIN_MM - 6)}" x2="${f(axisX)}" y2="${f(baseY + 6)}" stroke="${INK}" stroke-width="0.4" stroke-dasharray="10 2 2 2"/>
    <text x="${f(axisX + 2)}" y="${f(MARGIN_MM - 8)}" font-family="monospace" font-size="3.2" fill="${INK}">${escapeXml(axisLabel)}</text>
    <line x1="${f(px(params.r0))}" y1="${f(MARGIN_MM)}" x2="${f(px(params.r0))}" y2="${f(baseY)}" stroke="${FAINT}" stroke-width="0.25" stroke-dasharray="3 2"/>
    <text x="${f(px(params.r0) + 1.5)}" y="${f(baseY + 8)}" font-family="monospace" font-size="2.8" fill="${FAINT}">${escapeXml(coreLabel)}</text>
    ${ticks.join('\n    ')}
    <path d="${outer.join('')}" fill="none" stroke="${INK}" stroke-width="0.5"/>
    ${bore ? `<path d="${inner.join('')}" fill="none" stroke="${FAINT}" stroke-width="0.35" stroke-dasharray="4 2"/>` : ''}
    <line x1="${f(px(params.r0 + wall.top[0]))}" y1="${f(baseY)}" x2="${f(px(bore ? bore[0] : params.r0))}" y2="${f(baseY)}" stroke="${INK}" stroke-width="0.5"/>
    <line x1="${f(px(params.r0 + wall.top[last]))}" y1="${f(py(samples[last].z))}" x2="${f(px(bore ? bore[last] : params.r0))}" y2="${f(py(samples[last].z))}" stroke="${INK}" stroke-width="0.5"/>
    ${notchMarks}
  </g>
${titleBlock(MARGIN_MM, profileHeight + MARGIN_MM * 2 + 8, lang === 'es' ? 'PERFIL 1:1 (TERRAJA)' : 'PROFILE 1:1 (RIB)', params, lang, [
    lang === 'es'
      ? `Altura en crudo ${profileHeight.toFixed(0)} mm · diámetro máximo ${(2 * widest).toFixed(0)} mm · mínimo ${(2 * (params.r0 + Math.min(...wall.undisturbed)) * scale).toFixed(0)} mm`
      : `Green height ${profileHeight.toFixed(0)} mm · largest diameter ${(2 * widest).toFixed(0)} mm · smallest ${(2 * (params.r0 + Math.min(...wall.undisturbed)) * scale).toFixed(0)} mm`,
    lang === 'es'
      ? `Línea continua: cara exterior. Discontinua: taladro, con el muro de ${(params.wallThickness * scale).toFixed(1)} mm erosionado hacia dentro`
      : `Solid line: outer face. Dashed: the bore, the ${(params.wallThickness * scale).toFixed(1)} mm wall eroded inward`,
    lang === 'es'
      ? `${wall.spiral.turns.toFixed(2)} vueltas (lunaciones) · paso ${(params.pitchMm * scale).toFixed(0)} mm por vuelta · ${(wall.profile ? wall.profile.mmPerHour * scale : 0).toFixed(2)} mm por hora`
      : `${wall.spiral.turns.toFixed(2)} turns (lunations) · ${(params.pitchMm * scale).toFixed(0)} mm rise per turn · ${(wall.profile ? wall.profile.mmPerHour * scale : 0).toFixed(2)} mm per hour`,
    lang === 'es'
      ? 'Gire alrededor del eje de la izquierda: la pieza es igual por todos lados'
      : 'Revolve about the left-hand axis: the piece is the same on every side',
  ])}`;

  return { id: 'plan', widthMm: width, heightMm: height, svg: svgRoot(width, height, body) };
}

export interface StripRange {
  index: number;
  total: number;
  /** Arc length where the strip starts, fired mm. */
  sStart: number;
  /** Arc length where the strip's own material ends, fired mm. */
  sEnd: number;
  /** Arc length including the overlap tab, fired mm. */
  sEndWithTab: number;
}

/** Split the centerline into strips no longer than stripMaxMm at green size. */
export function stripRanges(wall: Wall, params: Params): StripRange[] {
  const scale = greenScale(params);
  // The limit is a paper limit, so it applies to the GREEN length.
  const maxFired = Math.max(params.stripMaxMm / scale - OVERLAP_MM, 20);
  const total = Math.max(1, Math.ceil(wall.spiral.length / maxFired));
  const each = wall.spiral.length / total;
  const ranges: StripRange[] = [];
  for (let index = 0; index < total; index += 1) {
    const sStart = index * each;
    const sEnd = Math.min((index + 1) * each, wall.spiral.length);
    ranges.push({
      index: index + 1,
      total,
      sStart,
      sEnd,
      sEndWithTab: Math.min(sEnd + (index + 1 < total ? OVERLAP_MM : 0), wall.spiral.length),
    });
  }
  return ranges;
}

/**
 * The wall, unrolled. x is arc length along the centerline and y is height, so
 * a strip cut to this outline and stood on edge gives the tide back.
 */
export function wallStripSheet(
  wall: Wall,
  params: Params,
  series: Series,
  lang: Lang,
): TemplateSheet {
  const scale = greenScale(params);
  const ranges = stripRanges(wall, params);
  const samples = wall.spiral.samples;

  const maxHeight = Math.max(...wall.undisturbed) * scale;
  const stripHeight = maxHeight + 22;
  const widest = Math.max(...ranges.map((r) => (r.sEndWithTab - r.sStart) * scale));
  const width = widest + MARGIN_MM * 2;
  const height =
    MARGIN_MM * 2 + ranges.length * (stripHeight + 10) + CALIBRATION_MM + 28;

  const start = Date.parse(series.window.startUtc);
  const pieces: string[] = [];

  ranges.forEach((range, rangeIndex) => {
    const originY = MARGIN_MM + rangeIndex * (stripHeight + 10) + stripHeight;
    const originX = MARGIN_MM;
    const sx = (s: number) => originX + (s - range.sStart) * scale;
    const sy = (h: number) => originY - h * scale;

    // Top edge, including the notch floors: this is the cut line.
    const top: string[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (sample.s < range.sStart - 1e-9 || sample.s > range.sEndWithTab + 1e-9) continue;
      top.push(`${top.length === 0 ? 'M' : 'L'}${f(sx(sample.s))} ${f(sy(wall.top[i]))}`);
    }

    const x0 = sx(range.sStart);
    const x1 = sx(range.sEndWithTab);
    const outline = `${top.join('')}L${f(x1)} ${f(originY)}L${f(x0)} ${f(originY)}Z`;

    // Notch outlines in red, so a cut is never mistaken for a tide.
    const notchOutlines = wall.notches
      .filter((notch) => notch.sEnd > range.sStart && notch.sStart < range.sEndWithTab)
      .map((notch) => {
        const points: string[] = [];
        const steps = Math.max(2, Math.ceil((notch.sEnd - notch.sStart) / 0.25));
        points.push(`M${f(sx(notch.sStart))} ${f(sy(interpolateCrest(wall, notch.sStart)))}`);
        for (let k = 0; k <= steps; k += 1) {
          const s = notch.sStart + ((notch.sEnd - notch.sStart) * k) / steps;
          points.push(`L${f(sx(s))} ${f(sy(interpolateFloor(wall, s)))}`);
        }
        points.push(`L${f(sx(notch.sEnd))} ${f(sy(interpolateCrest(wall, notch.sEnd)))}`);
        const label = `${notch.eventId}${notch.plumeUnknown ? ' ?' : ''}`;
        return `<path d="${points.join('')}" fill="none" stroke="${RED}" stroke-width="0.4"/>
    <text x="${f(sx((notch.sStart + notch.sEnd) / 2))}" y="${f(sy(interpolateFloor(wall, (notch.sStart + notch.sEnd) / 2)) - 2)}" font-family="monospace" font-size="3" fill="${RED}" text-anchor="middle">${escapeXml(label)}</text>`;
      })
      .join('\n    ');

    // Day ticks and the strip's date range.
    const ticks: string[] = [];
    const { i0, i1 } = wall.clock.window;
    for (let hour = i0; hour <= i1; hour += 24 * 7) {
      const s = wall.spiral.arcLengthAtHour(hour);
      if (s < range.sStart || s > range.sEndWithTab) continue;
      ticks.push(
        `<line x1="${f(sx(s))}" y1="${f(originY)}" x2="${f(sx(s))}" y2="${f(originY + 4)}" stroke="${FAINT}" stroke-width="0.3"/>
    <text x="${f(sx(s))}" y="${f(originY + 9)}" font-family="monospace" font-size="2.8" fill="${FAINT}" text-anchor="middle">${escapeXml(shortDate(new Date(start + hour * HOUR_MS), lang))}</text>`,
      );
    }

    const hourAtStart = wall.spiral.sampleAtArcLength(range.sStart).hourIndex;
    const hourAtEnd = wall.spiral.sampleAtArcLength(range.sEnd).hourIndex;
    const dates = `${shortDate(new Date(start + hourAtStart * HOUR_MS), lang)} – ${shortDate(new Date(start + hourAtEnd * HOUR_MS), lang)}`;
    const joinsFirst = wall.spiral.closed && range.index === range.total;
    const joint =
      range.sEndWithTab > range.sEnd
        ? `<line x1="${f(sx(range.sEnd))}" y1="${f(sy(0))}" x2="${f(sx(range.sEnd))}" y2="${f(sy(maxHeight / scale))}" stroke="${FAINT}" stroke-width="0.3" stroke-dasharray="2 2"/>
    <text x="${f(sx(range.sEnd) + 1.5)}" y="${f(originY - 2)}" font-family="monospace" font-size="2.8" fill="${FAINT}">${lang === 'es' ? `junta ${range.index}/${range.total} · solape ${OVERLAP_MM} mm` : `joint ${range.index}/${range.total} · overlap ${OVERLAP_MM} mm`}</text>`
        : joinsFirst
          ? `<text x="${f(x1 - 2)}" y="${f(originY - 2)}" font-family="monospace" font-size="2.8" fill="${FAINT}" text-anchor="end">${lang === 'es' ? 'se une con la tira 1' : 'joins strip 1'}</text>`
          : '';

    pieces.push(`
  <g>
    <text x="${f(originX)}" y="${f(originY - stripHeight + 6)}" font-family="monospace" font-size="4" fill="${INK}">${lang === 'es' ? 'TIRA' : 'STRIP'} ${range.index}/${range.total} · ${escapeXml(dates)} · s ${(range.sStart * scale).toFixed(0)}–${(range.sEndWithTab * scale).toFixed(0)} mm</text>
    <path d="${outline}" fill="none" stroke="${INK}" stroke-width="0.5"/>
    <line x1="${f(x0)}" y1="${f(originY)}" x2="${f(x1)}" y2="${f(originY)}" stroke="${INK}" stroke-width="0.5"/>
    ${ticks.join('\n    ')}
    ${joint}
    ${notchOutlines}
  </g>`);
  });

  const body = `${pieces.join('\n')}
${titleBlock(
  MARGIN_MM,
  MARGIN_MM + ranges.length * (stripHeight + 10) + 10,
  lang === 'es' ? 'TIRAS DEL MURO 1:1' : 'WALL STRIPS 1:1',
  params,
  lang,
  [
    lang === 'es'
      ? `${ranges.length} tiras · longitud total ${(wall.spiral.length * scale).toFixed(0)} mm en crudo`
      : `${ranges.length} strips · total length ${(wall.spiral.length * scale).toFixed(0)} mm green`,
    wall.clock.revolved
      ? lang === 'es'
        ? `x = altura por el eje, y = radio desde r₀ · solape ${OVERLAP_MM} mm`
        : `x = height up the axis, y = radius out from r₀ · ${OVERLAP_MM} mm overlap`
      : lang === 'es'
        ? `x = longitud de arco, y = altura · solape ${OVERLAP_MM} mm`
        : `x = arc length, y = height · ${OVERLAP_MM} mm overlap`,
    ...(wall.spiral.closed
      ? [
          lang === 'es'
            ? `Anillo cerrado: la tira ${ranges.length} vuelve a unirse con la tira 1`
            : `Closed ring: strip ${ranges.length} joins back to strip 1`,
        ]
      : []),
    ...(wall.clock.revolved
      ? [
          lang === 'es'
            ? 'Forma de revolución: estas tiras son el mismo perfil que la hoja de la terraja, partido en largos de página'
            : 'Revolved form: these strips are the rib sheet’s own profile, cut into page lengths',
        ]
      : []),
  ],
)}`;

  return { id: 'strips', widthMm: width, heightMm: height, svg: svgRoot(width, height, body) };
}

/** Undisturbed crest height at an arc position, mm (fired). */
function interpolateCrest(wall: Wall, s: number): number {
  return sampleAt(wall, s, wall.undisturbed);
}

/** Notched top height at an arc position, mm (fired). */
function interpolateFloor(wall: Wall, s: number): number {
  return sampleAt(wall, s, wall.top);
}

function sampleAt(wall: Wall, s: number, values: Float64Array): number {
  const samples = wall.spiral.samples;
  let low = 0;
  let high = samples.length - 1;
  const clamped = Math.min(Math.max(s, samples[0].s), samples[high].s);
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].s <= clamped) low = mid;
    else high = mid;
  }
  const span = samples[high].s - samples[low].s;
  const w = span > 1e-12 ? (clamped - samples[low].s) / span : 0;
  return values[low] + (values[high] - values[low]) * w;
}

/** Save the plan sheet as a standalone 1:1 SVG. */
export function exportPlanSvg(wall: Wall, params: Params, series: Series, lang: Lang): void {
  const sheet = planSheet(wall, params, series, lang);
  downloadText(sheet.svg, exportName(params, 'plan-1to1', 'svg'), 'image/svg+xml');
}

/** Save the unrolled wall strips as a standalone 1:1 SVG. */
export function exportStripsSvg(wall: Wall, params: Params, series: Series, lang: Lang): void {
  const sheet = wallStripSheet(wall, params, series, lang);
  downloadText(sheet.svg, exportName(params, 'wall-strips-1to1', 'svg'), 'image/svg+xml');
}
