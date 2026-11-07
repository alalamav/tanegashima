/**
 * The timeline strip: the same data, drawn flat.
 *
 * This is the ground-truth view. The spiral is an interpretation of the record;
 * this is the record. Observed sea level is the solid line, the astronomical
 * tide is the faint line under it, and the shaded band between them is the
 * anomaly — because obs - astro IS the anomaly, the band is not a separate
 * series but the literal difference.
 */

import type { Series, VolcanoEvent } from '../data/series.js';
import { HOUR_MS } from '../data/series.js';
import { illuminatedFraction } from '../data/moon.js';
import type { Params } from '../geom/params.js';
import { shortDate, type Lang } from '../i18n/strings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PADDING = { top: 15, right: 8, bottom: 14, left: 30 };

export interface TimelineHandle {
  element: SVGSVGElement;
  /** Redraw everything. */
  update(state: {
    params: Params;
    cursorHourIndex: number | null;
    activeEventId: string | null;
    lang: Lang;
  }): void;
  /** Map a client x coordinate to a fractional hour index, or null if outside. */
  hourIndexAtClientX(clientX: number): number | null;
  /** Client x coordinate of an hour index. */
  clientXOfHourIndex(hourIndex: number): number;
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export function createTimeline(
  container: HTMLElement,
  series: Series,
  events: VolcanoEvent[],
): TimelineHandle {
  const svg = element('svg', { preserveAspectRatio: 'none' });
  container.append(svg);

  let width = 1;
  let height = 1;
  const hours = series.arrays.t.length;

  const plotWidth = () => Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = () => Math.max(height - PADDING.top - PADDING.bottom, 1);

  const xOfHour = (hourIndex: number) =>
    PADDING.left + (hourIndex / (hours - 1)) * plotWidth();
  const hourOfX = (x: number) => ((x - PADDING.left) / plotWidth()) * (hours - 1);

  // Vertical scale: the full range of both curves, with a small margin, so the
  // strip never clips a spring tide.
  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < hours; i += 1) {
    valueMin = Math.min(valueMin, series.arrays.obs[i], series.arrays.astro[i]);
    valueMax = Math.max(valueMax, series.arrays.obs[i], series.arrays.astro[i]);
  }
  const margin = (valueMax - valueMin) * 0.06;
  valueMin -= margin;
  valueMax += margin;
  const yOfValue = (value: number) =>
    PADDING.top + plotHeight() * (1 - (value - valueMin) / (valueMax - valueMin));

  /** Downsample to at most one point per pixel column; the strip is ~1000 px. */
  const pathOf = (values: number[], step: number): string => {
    const parts: string[] = [];
    for (let i = 0; i < hours; i += step) {
      parts.push(`${i === 0 ? 'M' : 'L'}${xOfHour(i).toFixed(2)} ${yOfValue(values[i]).toFixed(2)}`);
    }
    parts.push(`L${xOfHour(hours - 1).toFixed(2)} ${yOfValue(values[hours - 1]).toFixed(2)}`);
    return parts.join('');
  };

  const bandOf = (step: number): string => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i < hours; i += step) {
      top.push(`${i === 0 ? 'M' : 'L'}${xOfHour(i).toFixed(2)} ${yOfValue(series.arrays.obs[i]).toFixed(2)}`);
      bottom.push(`L${xOfHour(i).toFixed(2)} ${yOfValue(series.arrays.astro[i]).toFixed(2)}`);
    }
    return `${top.join('')}${bottom.reverse().join('')}Z`;
  };

  const draw = (state: {
    params: Params;
    cursorHourIndex: number | null;
    activeEventId: string | null;
    lang: Lang;
  }): void => {
    width = container.clientWidth || 800;
    height = container.clientHeight || 120;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.replaceChildren();

    const step = Math.max(1, Math.round(hours / Math.max(plotWidth(), 1)));
    const start = Date.parse(series.window.startUtc);

    // --- reconstructed hours, marked before anything is drawn over them ----
    const filledGroup = element('g');
    for (let i = 0; i < hours; i += 1) {
      if (series.arrays.filled[i] !== 1) continue;
      let end = i;
      while (end + 1 < hours && series.arrays.filled[end + 1] === 1) end += 1;
      filledGroup.append(
        element('rect', {
          class: 'tl-filled',
          x: xOfHour(i),
          y: PADDING.top,
          width: Math.max(xOfHour(end) - xOfHour(i), 1),
          height: plotHeight(),
        }),
      );
      i = end;
    }
    svg.append(filledGroup);

    // --- the window currently on the wall ---------------------------------
    const i0 = Math.max(0, (Date.parse(state.params.windowStartUtc) - start) / HOUR_MS);
    const i1 = Math.min(hours - 1, (Date.parse(state.params.windowEndUtc) - start) / HOUR_MS);
    if (i0 > 0) {
      svg.append(
        element('rect', {
          class: 'tl-outside',
          x: PADDING.left,
          y: PADDING.top,
          width: Math.max(xOfHour(i0) - PADDING.left, 0),
          height: plotHeight(),
        }),
      );
    }
    if (i1 < hours - 1) {
      svg.append(
        element('rect', {
          class: 'tl-outside',
          x: xOfHour(i1),
          y: PADDING.top,
          width: Math.max(xOfHour(hours - 1) - xOfHour(i1), 0),
          height: plotHeight(),
        }),
      );
    }

    // --- axes and week ticks ----------------------------------------------
    const axis = element('g');
    axis.append(
      element('line', {
        class: 'tl-axis',
        x1: PADDING.left,
        y1: PADDING.top + plotHeight(),
        x2: PADDING.left + plotWidth(),
        y2: PADDING.top + plotHeight(),
      }),
    );
    // Week ticks, thinned out until the labels stop colliding: a date label is
    // about 34 px wide, so the strip decides its own interval from its width.
    const pixelsPerWeek = (plotWidth() / (hours - 1)) * 24 * 7;
    const weeksPerTick = Math.max(1, Math.ceil(34 / Math.max(pixelsPerWeek, 1)));
    for (let hour = 0, week = 0; hour < hours; hour += 24 * 7, week += 1) {
      const x = xOfHour(hour);
      axis.append(
        element('line', { class: 'tl-grid', x1: x, y1: PADDING.top, x2: x, y2: PADDING.top + plotHeight() }),
      );
      if (week % weeksPerTick !== 0) continue;
      const label = element('text', { class: 'tl-label', x: x + 2, y: height - 4 });
      label.textContent = shortDate(new Date(start + hour * HOUR_MS), state.lang);
      axis.append(label);
    }
    // Two value gridlines, in cm above the datum.
    for (const value of [valueMin + (valueMax - valueMin) * 0.25, valueMin + (valueMax - valueMin) * 0.75]) {
      const y = yOfValue(value);
      axis.append(
        element('line', { class: 'tl-grid', x1: PADDING.left, y1: y, x2: PADDING.left + plotWidth(), y2: y }),
      );
      const label = element('text', { class: 'tl-label', x: 2, y: y + 3 });
      label.textContent = `${Math.round(value + series.window.datumCm)}`;
      axis.append(label);
    }
    svg.append(axis);

    // --- the three curves -------------------------------------------------
    svg.append(element('path', { class: 'tl-dep', d: bandOf(step) }));
    svg.append(element('path', { class: 'tl-astro', d: pathOf(series.arrays.astro, step) }));
    svg.append(element('path', { class: 'tl-obs', d: pathOf(series.arrays.obs, step) }));

    // --- moon phases ------------------------------------------------------
    const moonGroup = element('g');
    for (const phase of series.moonPhases) {
      if (phase.phase !== 0 && phase.phase !== 180) continue;
      const hour = (Date.parse(phase.utc) - start) / HOUR_MS;
      if (hour < 0 || hour > hours - 1) continue;
      const x = xOfHour(hour);
      const y = PADDING.top - 7;
      moonGroup.append(element('circle', { class: 'tl-moon', cx: x, cy: y, r: 3.2 }));
      const illuminated = illuminatedFraction(new Date(phase.utc));
      if (illuminated > 0.5) {
        moonGroup.append(element('circle', { class: 'tl-moon-fill', cx: x, cy: y, r: 3.2 }));
      }
    }
    svg.append(moonGroup);

    // --- eruptions --------------------------------------------------------
    const eventGroup = element('g');
    for (const event of events) {
      const hour = (Date.parse(event.utc) - start) / HOUR_MS;
      if (hour < -1 || hour > hours) continue;
      const x = xOfHour(hour);
      if (event.durationHours > 0) {
        const x2 = xOfHour(Math.min(hour + event.durationHours, hours - 1));
        eventGroup.append(
          element('rect', {
            class: 'tl-event-band',
            x,
            y: PADDING.top,
            width: Math.max(x2 - x, 1.2),
            height: plotHeight(),
          }),
        );
      } else {
        eventGroup.append(
          element('line', {
            class: 'tl-event',
            x1: x,
            y1: PADDING.top,
            x2: x,
            y2: PADDING.top + plotHeight(),
            'stroke-opacity': event.id === state.activeEventId ? 1 : 0.7,
          }),
        );
      }
      eventGroup.append(
        element('circle', {
          class: 'tl-event-dot',
          cx: x,
          cy: PADDING.top - 7,
          r: event.id === state.activeEventId ? 3.2 : 2.1,
        }),
      );
    }
    svg.append(eventGroup);

    // --- cursor -----------------------------------------------------------
    if (state.cursorHourIndex !== null) {
      const x = xOfHour(state.cursorHourIndex);
      svg.append(
        element('line', {
          class: 'tl-cursor',
          x1: x,
          y1: PADDING.top - 11,
          x2: x,
          y2: PADDING.top + plotHeight(),
        }),
      );
    }
  };

  return {
    element: svg,
    update: draw,
    hourIndexAtClientX: (clientX) => {
      const box = svg.getBoundingClientRect();
      const hour = hourOfX(clientX - box.left);
      if (hour < 0 || hour > hours - 1) return Math.min(Math.max(hour, 0), hours - 1);
      return hour;
    },
    clientXOfHourIndex: (hourIndex) => svg.getBoundingClientRect().left + xOfHour(hourIndex),
  };
}
