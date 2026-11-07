/**
 * The parameter panel (Tweakpane). Every control writes straight into the one
 * `Params` object, and every change re-derives the geometry, the checks and the
 * URL hash, so a configuration is always shareable and reproducible.
 */

import { Pane } from 'tweakpane';
import type { BladeApi, FolderApi } from '@tweakpane/core';

import {
  DEFAULT_PARAMS,
  PARAM_RANGES,
  SHORT_WINDOW_PRESET,
  type Params,
  type RangedParam,
} from '../geom/params.js';
import { helpText, type HelpContext } from '../i18n/help.js';
import { t, type Lang } from '../i18n/strings.js';
import type { ViewPreset } from './scene.js';
import { helpTarget, type TooltipHost } from './tooltip.js';

export interface PanelCallbacks {
  onChange(): void;
  /** The live numbers the tooltips quote. Read at the moment a tooltip opens. */
  helpContext(): HelpContext;
  onView(preset: ViewPreset): void;
  onAutoRotate(enabled: boolean): void;
  onLanguage(lang: Lang): void;
  onExport(kind: ExportKind): void;
}

export type ExportKind =
  | 'png1'
  | 'png2'
  | 'png4'
  | 'stl'
  | 'glb'
  | 'planSvg'
  | 'stripsSvg'
  | 'pdf'
  | 'specJson'
  | 'specPdf';

export interface PanelHandle {
  /** Rebuild the panel, e.g. after a language change. */
  rebuild(): void;
  /** Push programmatic parameter changes (preset buttons, URL load) into the UI. */
  refresh(): void;
  dispose(): void;
}

const isoDay = (iso: string): string => iso.slice(0, 10);

export function createPanel(
  container: HTMLElement,
  params: Params,
  flags: { transparentPng: boolean; greenMesh: boolean },
  tooltips: TooltipHost,
  callbacks: PanelCallbacks,
): PanelHandle {
  let pane: Pane | null = null;
  /** The turns slider is only live in linear mode; kept here so it can be
   *  re-disabled whenever the clock mode changes. */
  let turnsBinding: BladeApi | null = null;

  // Dates are edited as plain YYYY-MM-DD text; the hours come from the series.
  const dates = {
    start: isoDay(params.windowStartUtc),
    end: isoDay(params.windowEndUtc),
  };

  const applyDates = (): void => {
    const start = `${dates.start}T00:00:00.000Z`;
    const end = `${dates.end}T23:00:00.000Z`;
    if (!Number.isNaN(Date.parse(start))) params.windowStartUtc = start;
    if (!Number.isNaN(Date.parse(end))) params.windowEndUtc = end;
    callbacks.onChange();
  };

  const build = (): void => {
    pane?.dispose();
    tooltips.hide();
    const lang = params.lang;
    pane = new Pane({ container });

    const helpLabel = lang === 'es' ? 'Qué hace este parámetro' : 'What this parameter does';

    /** Give a row an ⓘ icon that reads its text fresh every time it opens. */
    const withHelp = <T extends BladeApi>(api: T, key: string): T => {
      tooltips.attach(
        helpTarget(api.element),
        () => helpText(key, callbacks.helpContext(), params.lang),
        helpLabel,
      );
      return api;
    };

    /** Slider bounds come from PARAM_RANGES, the same table the one-click fixes
     *  snap their proposed values to. */
    const range = (key: RangedParam, label: string) => ({ label, ...PARAM_RANGES[key] });

    /** The turns slider does nothing outside linear mode, so it is disabled
     *  there rather than left to look live and respond to nothing. */
    const syncTurnsEnabled = (): void => {
      if (turnsBinding) turnsBinding.disabled = params.clockMode !== 'linear';
    };

    const changed = () => {
      syncTurnsEnabled();
      callbacks.onChange();
    };

    // ---- clock ----------------------------------------------------------
    const clock: FolderApi = pane.addFolder({ title: t('clock', lang), expanded: true });
    withHelp(
      clock
        .addBinding(params, 'clockMode', {
          label: t('clockMode', lang),
          options: {
            [t('synodic', lang)]: 'synodic',
            [t('springNeap', lang)]: 'springNeap',
            [t('linear', lang)]: 'linear',
          },
        })
        .on('change', changed),
      'clockMode',
    );
    turnsBinding = withHelp(
      clock
        .addBinding(params, 'linearTurns', range('linearTurns', t('linearTurns', lang)))
        .on('change', changed),
      'linearTurns',
    );
    syncTurnsEnabled();
    withHelp(clock.addBinding(dates, 'start', { label: t('windowStart', lang) }).on('change', applyDates), 'windowStart');
    withHelp(clock.addBinding(dates, 'end', { label: t('windowEnd', lang) }).on('change', applyDates), 'windowEnd');
    withHelp(clock.addButton({ title: t('shortWindow', lang) }), 'shortWindow').on('click', () => {
      Object.assign(params, SHORT_WINDOW_PRESET);
      dates.start = isoDay(params.windowStartUtc);
      dates.end = isoDay(params.windowEndUtc);
      pane?.refresh();
      changed();
    });
    withHelp(clock.addButton({ title: t('fullWindow', lang) }), 'fullWindow').on('click', () => {
      params.windowStartUtc = DEFAULT_PARAMS.windowStartUtc;
      params.windowEndUtc = DEFAULT_PARAMS.windowEndUtc;
      params.r0 = DEFAULT_PARAMS.r0;
      params.r1 = DEFAULT_PARAMS.r1;
      dates.start = isoDay(params.windowStartUtc);
      dates.end = isoDay(params.windowEndUtc);
      pane?.refresh();
      changed();
    });

    // ---- spiral ---------------------------------------------------------
    const spiral = pane.addFolder({ title: t('spiral', lang), expanded: false });
    withHelp(spiral.addBinding(params, 'r0', range('r0', t('r0', lang))).on('change', changed), 'r0');
    withHelp(spiral.addBinding(params, 'r1', range('r1', t('r1', lang))).on('change', changed), 'r1');
    withHelp(
      spiral
        .addBinding(params, 'thetaRefDeg', range('thetaRefDeg', t('thetaRef', lang)))
        .on('change', changed),
      'thetaRef',
    );
    withHelp(
      spiral
        .addBinding(params, 'arcStepMm', range('arcStepMm', t('arcStep', lang)))
        .on('change', changed),
      'arcStep',
    );

    // ---- wall -----------------------------------------------------------
    const wall = pane.addFolder({ title: t('wall', lang), expanded: true });
    withHelp(
      wall
        .addBinding(params, 'signal', {
          label: t('signal', lang),
          options: {
            elev: 'elev',
            obs: 'obs',
            astro: 'astro',
            dep: 'dep',
          },
        })
        .on('change', changed),
      'signal',
    );
    withHelp(wall.addBinding(params, 'hBase', range('hBase', t('hBase', lang))).on('change', changed), 'hBase');
    withHelp(wall.addBinding(params, 'k', range('k', t('kGain', lang))).on('change', changed), 'k');
    withHelp(
      wall
        .addBinding(params, 'smoothingMm', range('smoothingMm', t('smoothing', lang)))
        .on('change', changed),
      'smoothing',
    );
    withHelp(
      wall
        .addBinding(params, 'wallThickness', range('wallThickness', t('wallThickness', lang)))
        .on('change', changed),
      'wallThickness',
    );
    withHelp(wall.addBinding(params, 'baseDisc', { label: t('baseDisc', lang) }).on('change', changed), 'baseDisc');

    // ---- notches --------------------------------------------------------
    const notches = pane.addFolder({ title: t('notches', lang), expanded: false });
    withHelp(
      notches
        .addBinding(params, 'notchWidth', range('notchWidth', t('notchWidth', lang)))
        .on('change', changed),
      'notchWidth',
    );
    withHelp(
      notches
        .addBinding(params, 'notchDepth0', range('notchDepth0', t('notchDepth0', lang)))
        .on('change', changed),
      'notchDepth0',
    );
    withHelp(
      notches
        .addBinding(params, 'notchDepthPerKm', range('notchDepthPerKm', t('notchDepthPerKm', lang)))
        .on('change', changed),
      'notchDepthPerKm',
    );

    // ---- fabrication ----------------------------------------------------
    const fabrication = pane.addFolder({ title: t('fabrication', lang), expanded: false });
    withHelp(
      fabrication
        .addBinding(params, 'shrinkagePct', range('shrinkagePct', t('shrinkage', lang)))
        .on('change', changed),
      'shrinkage',
    );
    withHelp(
      fabrication
        .addBinding(params, 'kilnLimitMm', range('kilnLimitMm', t('kilnLimit', lang)))
        .on('change', changed),
      'kilnLimit',
    );
    withHelp(
      fabrication
        .addBinding(params, 'clearanceMm', range('clearanceMm', t('clearance', lang)))
        .on('change', changed),
      'clearance',
    );
    withHelp(
      fabrication
        .addBinding(params, 'minFeatureMm', range('minFeatureMm', t('minFeature', lang)))
        .on('change', changed),
      'minFeature',
    );
    withHelp(
      fabrication
        .addBinding(params, 'maxHeightMm', range('maxHeightMm', t('maxHeight', lang)))
        .on('change', changed),
      'maxHeight',
    );
    withHelp(
      fabrication
        .addBinding(params, 'stripMaxMm', range('stripMaxMm', t('stripMax', lang)))
        .on('change', changed),
      'stripMax',
    );
    withHelp(
      fabrication
        .addBinding(params, 'pageSize', {
          label: t('pageSize', lang),
          options: { A4: 'A4', A3: 'A3', Letter: 'Letter' },
        })
        .on('change', changed),
      'pageSize',
    );

    // ---- view -----------------------------------------------------------
    const view = pane.addFolder({ title: t('view', lang), expanded: false });
    withHelp(view.addButton({ title: t('viewPlan', lang) }), 'viewPlan').on('click', () => callbacks.onView('plan'));
    withHelp(view.addButton({ title: t('viewThreeQuarter', lang) }), 'viewThreeQuarter').on('click', () =>
      callbacks.onView('threeQuarter'),
    );
    withHelp(view.addButton({ title: t('viewElevation', lang) }), 'viewElevation').on('click', () =>
      callbacks.onView('elevation'),
    );
    const rotate = { on: true };
    withHelp(
      view
        .addBinding(rotate, 'on', { label: t('autoRotate', lang) })
        .on('change', (event) => callbacks.onAutoRotate(event.value)),
      'autoRotate',
    );
    withHelp(
      view.addButton({ title: `${t('language', lang)}: ${lang === 'es' ? 'English' : 'Español'}` }),
      'language',
    ).on('click', () => callbacks.onLanguage(lang === 'es' ? 'en' : 'es'));

    // ---- exports --------------------------------------------------------
    const exports = pane.addFolder({ title: t('exports', lang), expanded: false });
    withHelp(exports.addBinding(flags, 'transparentPng', { label: t('transparentBg', lang) }), 'transparentPng');
    withHelp(exports.addButton({ title: t('exportPng1', lang) }), 'exportPng').on('click', () => callbacks.onExport('png1'));
    exports.addButton({ title: t('exportPng2', lang) }).on('click', () => callbacks.onExport('png2'));
    exports.addButton({ title: t('exportPng4', lang) }).on('click', () => callbacks.onExport('png4'));
    withHelp(exports.addBinding(flags, 'greenMesh', { label: t('greenSize', lang) }), 'greenMesh');
    withHelp(exports.addButton({ title: t('exportStl', lang) }), 'exportStl').on('click', () => callbacks.onExport('stl'));
    withHelp(exports.addButton({ title: t('exportGlb', lang) }), 'exportGlb').on('click', () => callbacks.onExport('glb'));
    withHelp(exports.addButton({ title: t('exportPlanSvg', lang) }), 'exportPlanSvg').on('click', () =>
      callbacks.onExport('planSvg'),
    );
    withHelp(exports.addButton({ title: t('exportStripsSvg', lang) }), 'exportStripsSvg').on('click', () =>
      callbacks.onExport('stripsSvg'),
    );
    withHelp(exports.addButton({ title: t('exportPdf', lang) }), 'exportPdf').on('click', () => callbacks.onExport('pdf'));
    withHelp(exports.addButton({ title: t('exportSpecJson', lang) }), 'exportSpecJson').on('click', () =>
      callbacks.onExport('specJson'),
    );
    withHelp(exports.addButton({ title: t('exportSpecPdf', lang) }), 'exportSpecPdf').on('click', () =>
      callbacks.onExport('specPdf'),
    );
  };

  build();

  return {
    rebuild: build,
    refresh: () => {
      dates.start = isoDay(params.windowStartUtc);
      dates.end = isoDay(params.windowEndUtc);
      if (turnsBinding) turnsBinding.disabled = params.clockMode !== 'linear';
      pane?.refresh();
    },
    dispose: () => {
      tooltips.hide();
      pane?.dispose();
    },
  };
}
