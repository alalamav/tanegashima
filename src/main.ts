/**
 * Two clocks — entry point.
 *
 * The Moon's clock drives the angle; the volcano's clock cuts the notches. This
 * module owns the state (one `Params` object, a cursor and a selected event),
 * derives the geometry whenever that state changes, and keeps the URL hash in
 * step so any configuration can be shared and rebuilt exactly.
 */

import './styles.css';

import { illuminatedFraction, phaseLabel } from './data/moon.js';
import {
  HOUR_MS,
  sampleCubic,
  sampleLinear,
  signalLabel,
  type BuildMeta,
  type Series,
  type VolcanoEvent,
} from './data/series.js';
import { turnGuidance } from './geom/advice.js';
import { configHash, paramsFromHash, paramsToHash, type Params } from './geom/params.js';
import { resolveWindow } from './geom/clock.js';
import { measure, runChecks, type CheckFix } from './geom/validate.js';
import { buildWall, type Wall } from './geom/wall.js';
import { exportPng } from './export/png.js';
import { exportGlb, exportStl } from './export/mesh.js';
import {
  exportPlanSvg,
  exportStripsSvg,
  planSheet,
  wallStripSheet,
} from './export/templates.js';
import { exportTemplatesPdf, exportSpecPdf } from './export/pdf.js';
import { buildSpec, exportSpecJson } from './export/spec.js';
import { createPanel, type ExportKind } from './ui/panel.js';
import { createScene, type ViewPreset } from './ui/scene.js';
import { createTimeline } from './ui/timeline2d.js';
import { attachScrubber, shiftWindow, windowFromPicks } from './ui/scrubber.js';
import { precisionLabel, shortDate, t, timeInZone, type Lang } from './i18n/strings.js';
import { helpText, type HelpContext } from './i18n/help.js';
import { createTooltipHost } from './ui/tooltip.js';

/** Quito is UTC-5 all year; Tanegashima is UTC+9 all year. No DST either side. */
const QUITO_OFFSET = -5;
const JST_OFFSET = 9;

const statusElement = document.getElementById('status') as HTMLElement;

function setStatus(text: string, isError = false): void {
  statusElement.textContent = text;
  statusElement.classList.toggle('error', isError);
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  setStatus(t('loading', 'es'));

  let series: Series;
  let events: VolcanoEvent[];
  let meta: BuildMeta;
  try {
    [series, events, meta] = await Promise.all([
      loadJson<Series>('series.json'),
      loadJson<VolcanoEvent[]>('events.json'),
      loadJson<BuildMeta>('build-meta.json'),
    ]);
  } catch (error) {
    setStatus(`${t('loadError', 'es')}\n${(error as Error).message}`, true);
    return;
  }
  setStatus('');

  // ---- state ------------------------------------------------------------
  const params: Params = paramsFromHash(location.hash);
  const flags = { transparentPng: false, greenMesh: false };
  let cursorHourIndex: number | null = null;
  let activeEventId: string | null = null;
  /** First edge of a window being picked on the strip, if any. */
  let pendingWindowStart: number | null = null;
  /** The window as it stood when a drag of the window band began. */
  let windowDragBase: { i0: number; i1: number } | null = null;
  let wall: Wall = buildWall(series, events, params);

  // ---- elements ---------------------------------------------------------
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const readoutValues = document.getElementById('readout-values') as HTMLElement;
  const checksList = document.getElementById('checks-list') as HTMLElement;
  const eventsList = document.getElementById('events-list') as HTMLElement;
  const provenanceValues = document.getElementById('provenance-values') as HTMLElement;
  const timelineContainer = document.getElementById('timeline-svg') as HTMLElement;
  const paneContainer = document.getElementById('tweakpane') as HTMLElement;
  const panelElement = document.getElementById('panel') as HTMLElement;
  const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement;
  const langToggle = document.getElementById('lang-toggle') as HTMLButtonElement;

  const scene = createScene(canvas);
  const timeline = createTimeline(timelineContainer, series, events);
  const tooltips = createTooltipHost();

  /** The live numbers every tooltip and every piece of advice quotes. */
  const helpContext = (): HelpContext => {
    const measures = measure(wall, params);
    return { params, guidance: turnGuidance(params, measures.turns, measures.windowHours), measures };
  };

  // ---- rendering helpers ------------------------------------------------
  const row = (
    parent: HTMLElement,
    label: string,
    value: string,
    className = '',
  ): void => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (className) dd.className = className;
    parent.append(dt, dd);
  };

  const nearestEvent = (hourIndex: number): VolcanoEvent => {
    let best = events[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const event of events) {
      const distance = Math.abs(event.hourIndex + event.durationHours / 2 - hourIndex);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = event;
      }
    }
    return best;
  };

  const drawReadout = (): void => {
    const lang = params.lang;
    readoutValues.replaceChildren();

    const hourIndex = cursorHourIndex ?? wall.clock.window.i0;
    const clamped = Math.min(Math.max(hourIndex, 0), series.arrays.t.length - 1);
    const when = new Date(Date.parse(series.window.startUtc) + clamped * HOUR_MS);
    const label = signalLabel(params.signal);

    row(readoutValues, t('utc', lang), timeInZone(when, 0, lang));
    row(readoutValues, t('quito', lang), timeInZone(when, QUITO_OFFSET, lang));
    row(readoutValues, t('tanegashima', lang), timeInZone(when, JST_OFFSET, lang));
    row(
      readoutValues,
      t('elevation', lang),
      `${sampleCubic(series.arrays.elev, clamped).toFixed(1)} cm`,
    );
    row(readoutValues, t('anomaly', lang), `${sampleLinear(series.arrays.dep, clamped).toFixed(1)} cm`);
    if (params.signal !== 'elev' && params.signal !== 'dep') {
      row(
        readoutValues,
        `${label[lang]}`,
        `${sampleCubic(series.arrays[params.signal], clamped).toFixed(1)} cm`,
      );
    }

    const illumination = illuminatedFraction(when);
    const phase = wall.clock.wrappedDegAt(clamped);
    row(
      readoutValues,
      t('moon', lang),
      `${phase.toFixed(0)}° · ${(illumination * 100).toFixed(0)}% ${t('illuminated', lang)}`,
    );
    row(readoutValues, '', phaseLabel(phase)[lang], 'flag');

    // The framing line names what each axis of the piece carries, and the
    // revolved form swaps two of them round.
    const framing = document.querySelector<HTMLElement>('.framing');
    if (framing) framing.textContent = t(wall.clock.revolved ? 'framingRevolved' : 'framing', lang);

    // Wall height and position, so the readout describes the object too.
    if (clamped >= wall.clock.window.i0 && clamped <= wall.clock.window.i1) {
      const s = wall.spiral.arcLengthAtHour(clamped);
      const sampleIndex = Math.min(
        wall.spiral.samples.length - 1,
        Math.max(0, Math.round((s / wall.spiral.length) * (wall.spiral.samples.length - 1))),
      );
      if (wall.clock.revolved) {
        // On the revolved form the tide is a diameter and the arc is a height,
        // so saying "wall height" and "position along the wall" would describe
        // the wrong object.
        const diameter = 2 * (params.r0 + wall.top[sampleIndex]);
        row(readoutValues, t('vesselDiameter', lang), `${diameter.toFixed(1)} mm`);
        row(readoutValues, t('axisPosition', lang), `${s.toFixed(0)} mm`);
      } else {
        row(readoutValues, t('wallHeight', lang), `${wall.top[sampleIndex].toFixed(1)} mm`);
        row(readoutValues, t('arcPosition', lang), `${s.toFixed(0)} mm`);
      }
    }

    const near = nearestEvent(clamped);
    const nearWhen = new Date(near.utc);
    row(
      readoutValues,
      t('nearestEvent', lang),
      `${near.id} · ${shortDate(nearWhen, lang)}`,
      'accent',
    );
    row(
      readoutValues,
      '',
      series.arrays.filled[Math.round(clamped)] === 1
        ? t('filledHour', lang)
        : t('observedHour', lang),
      'flag',
    );
  };

  const drawChecks = (): void => {
    const lang = params.lang;
    const { checks, measures } = runChecks(wall, params);
    checksList.replaceChildren();

    // A measured summary above the checks, so the turns, the length and the
    // diameter are visible whether or not any check is complaining — and so it
    // is obvious that the turns follow the clock mode rather than the slider.
    const summary = document.createElement('li');
    summary.className = 'measures';
    summary.textContent =
      `${lang === 'es' ? 'vueltas' : 'turns'} ${measures.turns.toFixed(2)} · ` +
      `${measures.centerlineLengthMm.toFixed(0)} mm · ` +
      `⌀ ${measures.firedOuterDiameterMm.toFixed(0)} mm ${lang === 'es' ? 'cocido' : 'fired'}`;
    checksList.append(summary);

    const adviceLabel = lang === 'es' ? 'Qué mide y qué cambiar' : 'What it measures and what to change';

    for (const check of checks) {
      const li = document.createElement('li');
      li.className = check.level;

      const dot = document.createElement('span');
      dot.className = 'dot';

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = lang === 'es' ? check.labelEs : check.labelEn;

      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = check.value;

      const detail = document.createElement('span');
      const advice = lang === 'es' ? check.adviceEs : check.adviceEn;
      detail.className = advice ? 'advice' : 'limit';
      detail.textContent = advice ?? check.limit;

      li.append(dot, name, value, detail);

      // One click applies exactly the lever the advice's first sentence names.
      if (check.fix) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fix';
        const fixLabel = lang === 'es' ? check.fix.labelEs : check.fix.labelEn;
        button.textContent = fixLabel;
        button.setAttribute('aria-label', `${t('applyFix', lang)}: ${fixLabel}`);
        const fix = check.fix;
        button.addEventListener('click', () => applyFix(fix));
        li.append(button);
      }

      checksList.append(li);

      // The ⓘ always explains what the check measures; when it is failing the
      // tooltip leads with the limit and the fix.
      const explain = lang === 'es' ? check.explainEs : check.explainEn;
      tooltips.attach(
        name,
        () =>
          advice
            ? `${explain}\n\n${lang === 'es' ? 'Límite' : 'Limit'}: ${check.limit}\n${lang === 'es' ? 'Qué cambiar' : 'What to change'}: ${advice}`
            : `${explain}\n\n${lang === 'es' ? 'Límite' : 'Limit'}: ${check.limit} — ${lang === 'es' ? 'se cumple' : 'met'}`,
        adviceLabel,
      );
    }
  };

  const drawEvents = (): void => {
    const lang = params.lang;
    eventsList.replaceChildren();
    for (const event of events) {
      const notch = wall.notches.find((candidate) => candidate.eventId === event.id);
      const li = document.createElement('li');
      if (event.id === activeEventId) li.classList.add('active');
      if (!notch) li.classList.add('dropped');

      const button = document.createElement('button');
      button.type = 'button';

      const when = document.createElement('span');
      when.className = 'when';
      const date = new Date(event.utc);
      when.textContent =
        event.precision === 'day'
          ? `${shortDate(date, lang)} · 24 h`
          : `${shortDate(date, lang)} ${timeInZone(date, 0, lang).split(' ').pop()} UTC`;

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = lang === 'es' ? event.labelEs : event.labelEn;

      const meta2 = document.createElement('span');
      meta2.className = 'meta';
      const plume =
        event.plumeKm === null
          ? t('plumeUnknown', lang)
          : `${t('plume', lang)} ${event.plumeKm} km`;
      const parts = [precisionLabel(event.precision, lang), plume];
      if (notch) parts.push(`${notch.depth.toFixed(1)} mm`);
      else parts.push(t('outsideWindow', lang));
      meta2.textContent = parts.join(' · ');

      button.append(when, label, meta2);
      button.addEventListener('click', () => {
        activeEventId = event.id;
        cursorHourIndex = event.hourIndex + event.durationHours / 2;
        if (notch) scene.focusNotch(notch, wall);
        drawAll();
      });

      const link = document.createElement('a');
      link.href = event.sourceUrl;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = t('source', lang);
      link.className = 'meta';

      li.append(button, link);
      eventsList.append(li);
    }
  };

  const drawProvenance = (): void => {
    const lang = params.lang;
    provenanceValues.replaceChildren();
    row(
      provenanceValues,
      t('datum', lang),
      `${meta.datumCm} cm${meta.datumVerified ? '' : ' *'}`,
    );
    row(
      provenanceValues,
      t('gapsFilled', lang),
      String(meta.gaps.reduce((total, gap) => total + gap.hours, 0)),
    );
    row(provenanceValues, t('fitRms', lang), `${meta.harmonicFit.residualRmsCm.toFixed(2)} cm`);
    row(provenanceValues, 'cfg', configHash(params));
    const dt = document.createElement('dt');
    dt.textContent = 'JMA';
    const dd = document.createElement('dd');
    const link = document.createElement('a');
    link.href = 'https://www.data.jma.go.jp/kaiyou/db/tide/genbo/genbo.php?stn=TJ';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'TJ 1999';
    dd.append(link);
    provenanceValues.append(dt, dd);
  };

  /** Section element id -> help key. The provenance section is headed "Datos". */
  const sectionHelpKeys: Record<string, string> = {
    checks: 'checks',
    events: 'events',
    provenance: 'data',
  };

  const applyStaticText = (): void => {
    const lang = params.lang;
    document.documentElement.lang = lang;
    for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n as Parameters<typeof t>[0];
      // The h1 holds the language button, so only its first text node changes.
      if (node.tagName === 'SPAN' || node.tagName === 'P' || node.tagName === 'H2') {
        node.textContent = t(key, lang);
      }
    }
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';
    panelToggle.textContent = `${lang === 'es' ? 'Parámetros' : 'Parameters'} ${panelElement.classList.contains('collapsed') ? '+' : '×'}`;

    // Section headings carry their own ⓘ; they are rebuilt here because the
    // language toggle replaces their text.
    const helpLabel = lang === 'es' ? 'Qué muestra esta sección' : 'What this section shows';
    for (const [sectionId, helpKey] of Object.entries(sectionHelpKeys)) {
      const heading = document.querySelector<HTMLElement>(`#${sectionId} h2`);
      if (!heading) continue;
      // The language toggle calls this again, so clear the previous icon rather
      // than ending up with one per switch.
      heading.querySelector('.help-icon')?.remove();
      tooltips.attach(heading, () => helpText(helpKey, helpContext(), params.lang), helpLabel);
    }
  };

  /**
   * Keep the URL in step with the parameters.
   *
   * Ordinary edits replace the entry — a slider drag would otherwise bury the
   * history under one entry per frame. Applying a check's fix PUSHES one, so the
   * browser's Back button is a real undo for the one action that changes several
   * parameters at once without the user having touched them.
   */
  /**
   * Suppresses URL writes while a fix is being applied.
   *
   * Applying a fix writes several parameters at once and then refreshes the
   * panel, and Tweakpane's refresh fires a change per binding. Each of those
   * would replaceState the PREVIOUS history entry with the post-fix URL, so by
   * the time the push happened there would be nothing left to go back to.
   */
  let suppressHashSync = false;

  const syncHash = (pushHistory = false): void => {
    if (suppressHashSync) return;
    const hash = paramsToHash(params);
    const target = `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`;
    if (pushHistory) history.pushState(null, '', target);
    else if (location.hash !== (hash ? `#${hash}` : '')) history.replaceState(null, '', target);
  };

  const drawAll = (): void => {
    drawReadout();
    drawChecks();
    drawEvents();
    drawProvenance();
    timeline.update({ params, cursorHourIndex, activeEventId, pendingWindowStart, lang: params.lang });
    if (cursorHourIndex !== null) {
      const { i0, i1 } = wall.clock.window;
      if (cursorHourIndex >= i0 && cursorHourIndex <= i1) {
        const s = wall.spiral.arcLengthAtHour(cursorHourIndex);
        const sample = wall.spiral.sampleAtArcLength(s);
        const index = Math.min(
          wall.spiral.samples.length - 1,
          Math.max(0, Math.round((s / wall.spiral.length) * (wall.spiral.samples.length - 1))),
        );
        const relief = wall.top[index];
        if (wall.clock.revolved) {
          // The tide is radial here, so the needle comes out of the
          // circumference at the cursor's own height instead of standing up
          // from the ground.
          const out = params.r0 + relief + 12;
          scene.setCursor({
            base: { x: sample.nx * params.r0, y: sample.ny * params.r0, h: sample.z },
            tip: { x: sample.nx * out, y: sample.ny * out, h: sample.z },
          });
        } else {
          scene.setCursor({
            base: { x: sample.x, y: sample.y, h: 0 },
            tip: { x: sample.x, y: sample.y, h: relief + 12 },
          });
        }
      } else {
        scene.setCursor(null);
      }
    } else {
      scene.setCursor(null);
    }
  };

  const rebuild = (pushHistory = false): void => {
    try {
      wall = buildWall(series, events, params);
      setStatus('');
    } catch (error) {
      setStatus((error as Error).message, true);
      return;
    }
    scene.setWall(wall, params);
    syncHash(pushHistory);
    drawAll();
  };

  /** Apply a check's one-click fix, leaving a history entry to undo it. */
  const applyFix = (fix: CheckFix): void => {
    tooltips.hide();
    suppressHashSync = true;
    Object.assign(params, fix.patch);
    panel.refresh();
    suppressHashSync = false;
    rebuild(true);
    setStatus(t('fixApplied', params.lang));
    window.setTimeout(() => setStatus(''), 2600);
  };

  // ---- exports ----------------------------------------------------------
  const runExport = async (kind: ExportKind): Promise<void> => {
    const lang = params.lang;
    const hash = configHash(params);
    try {
      switch (kind) {
        case 'png1':
          await exportPng(scene, params, 1, flags.transparentPng);
          break;
        case 'png2':
          await exportPng(scene, params, 2, flags.transparentPng);
          break;
        case 'png4':
          await exportPng(scene, params, 4, flags.transparentPng);
          break;
        case 'stl':
          exportStl(wall, params, flags.greenMesh, hash);
          break;
        case 'glb':
          await exportGlb(wall, params, flags.greenMesh, hash);
          break;
        case 'planSvg':
          exportPlanSvg(wall, params, series, lang);
          break;
        case 'stripsSvg':
          exportStripsSvg(wall, params, series, lang);
          break;
        case 'pdf':
          setStatus(lang === 'es' ? 'Generando PDF…' : 'Building PDF…');
          await exportTemplatesPdf(
            [planSheet(wall, params, series, lang), wallStripSheet(wall, params, series, lang)],
            params,
            lang,
          );
          setStatus('');
          break;
        case 'specJson':
          exportSpecJson(buildSpec(wall, params, series, events, meta, lang), params);
          break;
        case 'specPdf':
          exportSpecPdf(buildSpec(wall, params, series, events, meta, lang), params, lang);
          break;
      }
    } catch (error) {
      setStatus(`${kind}: ${(error as Error).message}`, true);
    }
  };

  // ---- panel ------------------------------------------------------------
  const panel = createPanel(paneContainer, params, flags, tooltips, {
    onChange: rebuild,
    helpContext,
    onView: (preset: ViewPreset) => scene.setView(preset),
    onAutoRotate: (enabled) => scene.setAutoRotate(enabled),
    onLanguage: (lang) => {
      params.lang = lang;
      panel.rebuild();
      applyStaticText();
      drawAll();
      syncHash();
    },
    onExport: (kind) => void runExport(kind),
  });

  langToggle.addEventListener('click', () => {
    const next: Lang = params.lang === 'es' ? 'en' : 'es';
    params.lang = next;
    panel.rebuild();
    applyStaticText();
    drawAll();
    syncHash();
  });

  panelToggle.addEventListener('click', () => {
    const collapsed = panelElement.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    applyStaticText();
  });

  // ---- scrubbing --------------------------------------------------------
  const totalHours = series.arrays.t.length;
  const hourToIso = (hour: number): string =>
    new Date(Date.parse(series.window.startUtc) + Math.round(hour) * HOUR_MS).toISOString();

  const setWindow = (
    startHour: number,
    endHour: number,
    options: { pushHistory?: boolean; refreshPanel?: boolean } = {},
  ): void => {
    params.windowStartUtc = hourToIso(startHour);
    params.windowEndUtc = hourToIso(endHour);
    if (options.refreshPanel !== false) panel.refresh();
    rebuild(options.pushHistory === true);
  };

  attachScrubber(timelineContainer, {
    onScrub: (hourIndex) => {
      cursorHourIndex = hourIndex;
      const near = nearestEvent(hourIndex);
      activeEventId = Math.abs(near.hourIndex - hourIndex) < 6 ? near.id : null;
      drawAll();
    },
    onLeave: () => {
      cursorHourIndex = null;
      drawAll();
    },
    hourIndexAtClientX: timeline.hourIndexAtClientX,

    isInsideWindow: (hourIndex) => {
      const { i0, i1 } = resolveWindow(series, params);
      return hourIndex >= i0 && hourIndex <= i1;
    },
    isPicking: () => pendingWindowStart !== null,

    // First click plants an edge, second click completes the window. Picking
    // the window is two clicks rather than a drag so that dragging stays free
    // for sliding the window that is already there.
    onPick: (hourIndex) => {
      if (pendingWindowStart === null) {
        pendingWindowStart = Math.round(hourIndex);
        timelineContainer.classList.add('picking');
        setStatus(t('pickEnd', params.lang));
        drawAll();
        return;
      }
      const { startHour, endHour } = windowFromPicks(pendingWindowStart, hourIndex, totalHours);
      pendingWindowStart = null;
      timelineContainer.classList.remove('picking');
      setStatus('');
      setWindow(startHour, endHour, { pushHistory: true });
    },

    onWindowDragStart: () => {
      windowDragBase = resolveWindow(series, params);
      // Hold the URL still for the duration: rewriting it on every frame of a
      // drag churns history and makes the browser think the page navigated.
      suppressHashSync = true;
    },
    onWindowDrag: (deltaHours) => {
      if (!windowDragBase) return;
      const { startHour, endHour } = shiftWindow(
        windowDragBase.i0,
        windowDragBase.i1,
        deltaHours,
        totalHours,
      );
      // The panel's date fields are rebuilt once at the end rather than on
      // every frame; the strip and the piece follow the drag live.
      setWindow(startHour, endHour, { refreshPanel: false });
    },
    onWindowDragEnd: () => {
      windowDragBase = null;
      // The panel refresh has to happen while the URL is still held: its change
      // events would otherwise replaceState the entry we are about to push on
      // top of, leaving Back with two identical entries and nothing to undo.
      panel.refresh();
      suppressHashSync = false;
      // One history entry for the whole drag, not one per frame.
      syncHash(true);
    },
    onHoverWindow: (inside) => {
      timelineContainer.classList.toggle('over-window', inside && pendingWindowStart === null);
    },
  });

  timelineContainer.addEventListener('scrub-cancel', () => {
    pendingWindowStart = null;
    timelineContainer.classList.remove('picking');
    setStatus('');
    drawAll();
  });

  timelineContainer.addEventListener('scrub-step', (event) => {
    const step = (event as CustomEvent<number>).detail;
    const base = cursorHourIndex ?? wall.clock.window.i0;
    cursorHourIndex = Math.min(Math.max(base + step, 0), series.arrays.t.length - 1);
    drawAll();
  });

  window.addEventListener('resize', () => {
    scene.resize();
    drawAll();
  });

  const restoreFromHash = (): void => {
    Object.assign(params, paramsFromHash(location.hash));
    panel.refresh();
    rebuild();
  };

  window.addEventListener('hashchange', restoreFromHash);
  // Back over an applied fix: popstate fires for every history entry, hashchange
  // only when the fragment differs, so both are wired to the same restore.
  window.addEventListener('popstate', restoreFromHash);

  // ---- dev hook ---------------------------------------------------------
  // Only in `npm run dev`: lets the exports be exercised from the console
  // without downloading a file each time. Stripped from the production build.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__twoClocks = {
      get params() {
        return params;
      },
      get wall() {
        return wall;
      },
      series,
      events,
      meta,
      scene,
      runExport,
      async probe() {
        const sheets = [
          planSheet(wall, params, series, params.lang),
          wallStripSheet(wall, params, series, params.lang),
        ];
        const { tiledPdf } = await import('./export/pdf.js');
        const pdf = await tiledPdf(sheets, params, params.lang);
        const pdfText = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
        const png = await scene.capturePng(2, false);
        const { toBinaryStl } = await import('./export/mesh.js');
        const { buildWallMesh } = await import('./geom/wall.js');
        const stl = toBinaryStl([buildWallMesh(wall, params)], 'probe');
        return {
          planSheetMm: [Math.round(sheets[0].widthMm), Math.round(sheets[0].heightMm)],
          stripSheetMm: [Math.round(sheets[1].widthMm), Math.round(sheets[1].heightMm)],
          pdfKB: Math.round(pdf.size / 1024),
          pdfHeader: pdfText.slice(0, 8),
          pdfPages: (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
          pngKB: Math.round(png.size / 1024),
          stlKB: Math.round(stl.byteLength / 1024),
          checks: runChecks(wall, params).checks.map((check) => `${check.id}:${check.level}`),
        };
      },
    };
  }

  // ---- first paint ------------------------------------------------------
  // A phone has no room for the panel and the 3D view at once, so the panel
  // starts folded away and the piece gets the screen.
  if (window.innerWidth <= 860) {
    panelElement.classList.add('collapsed');
    panelToggle.setAttribute('aria-expanded', 'false');
  }
  applyStaticText();
  scene.setWall(wall, params);
  scene.setView('threeQuarter');
  syncHash();
  drawAll();
}

void main();
