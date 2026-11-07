/**
 * Interface text. Spanish is the default — the piece is about Quito's volcano —
 * with English available from the panel.
 */

export type Lang = 'es' | 'en';

export const STRINGS = {
  title: { es: 'Dos relojes', en: 'Two clocks' },
  subtitle: {
    es: 'El nivel del mar medido en Tanegashima durante las erupciones del Pichincha, 1999',
    en: "Tanegashima's measured sea level during Pichincha's 1999 eruptions",
  },
  framing: {
    es: 'El ángulo es la Luna, el radio es el tiempo transcurrido, la altura del muro es la marea observada y las muescas rojas son las erupciones. Si las erupciones se agrupan cerca de un ángulo, la forma lo muestra. No lo explica.',
    en: 'Angle is the Moon, radius is elapsed time, wall height is the observed tide, and the red notches are the eruptions. If the eruptions bunch near one angle, the form shows it. It does not explain it.',
  },

  // readout
  utc: { es: 'UTC', en: 'UTC' },
  quito: { es: 'Quito', en: 'Quito' },
  tanegashima: { es: 'Tanegashima', en: 'Tanegashima' },
  elevation: { es: 'Elevación del mar', en: 'Sea elevation' },
  anomaly: { es: 'Anomalía', en: 'Anomaly' },
  astro: { es: 'Marea astronómica', en: 'Astronomical tide' },
  observed: { es: 'Nivel observado', en: 'Observed level' },
  moon: { es: 'Luna', en: 'Moon' },
  illuminated: { es: 'iluminada', en: 'illuminated' },
  nearestEvent: { es: 'Erupción más cercana', en: 'Nearest eruption' },
  filledHour: { es: 'hora reconstruida', en: 'reconstructed hour' },
  observedHour: { es: 'hora observada', en: 'observed hour' },
  wallHeight: { es: 'Altura del muro', en: 'Wall height' },
  arcPosition: { es: 'Posición en el muro', en: 'Position along the wall' },

  // panel sections
  clock: { es: 'Reloj', en: 'Clock' },
  clockMode: { es: 'Modo', en: 'Mode' },
  circle: { es: 'Círculo (cilindro cerrado)', en: 'Circle (closed cylinder)' },
  synodic: { es: 'Sinódico (fase lunar)', en: 'Synodic (moon phase)' },
  springNeap: { es: 'Sicigias (2 × fase)', en: 'Spring–neap (2 × phase)' },
  linear: { es: 'Lineal (control)', en: 'Linear (control)' },
  linearTurns: { es: 'Vueltas (lineal)', en: 'Turns (linear)' },
  windowStart: { es: 'Inicio de la ventana', en: 'Window start' },
  windowEnd: { es: 'Fin de la ventana', en: 'Window end' },
  shortWindow: { es: 'Ventana del jarrón (1 – 12 oct)', en: 'Vase window (1 – 12 Oct)' },
  fullWindow: { es: 'Registro completo (26 sep – 31 dic)', en: 'Whole record (26 Sep – 31 Dec)' },

  spiral: { es: 'Espiral', en: 'Spiral' },
  r0: { es: 'Radio inicial r₀', en: 'Inner radius r₀' },
  r1: { es: 'Radio final r₁', en: 'Outer radius r₁' },
  thetaRef: { es: 'Rotación θ_ref', en: 'Rotation θ_ref' },
  arcStep: { es: 'Paso de remuestreo', en: 'Resampling step' },

  wall: { es: 'Muro', en: 'Wall' },
  signal: { es: 'Señal', en: 'Signal' },
  hBase: { es: 'Altura base h_base', en: 'Base height h_base' },
  kGain: { es: 'Ganancia k (mm/cm)', en: 'Gain k (mm/cm)' },
  smoothing: { es: 'Suavizado (mm)', en: 'Smoothing (mm)' },
  wallThickness: { es: 'Espesor del muro', en: 'Wall thickness' },
  baseDisc: { es: 'Disco de base', en: 'Base disc' },

  notches: { es: 'Muescas', en: 'Notches' },
  notchWidth: { es: 'Ancho', en: 'Width' },
  notchDepth0: { es: 'Profundidad base d₀', en: 'Base depth d₀' },
  notchDepthPerKm: { es: 'Profundidad por km de pluma', en: 'Depth per km of plume' },

  fabrication: { es: 'Fabricación', en: 'Fabrication' },
  shrinkage: { es: 'Contracción (%)', en: 'Shrinkage (%)' },
  kilnLimit: { es: 'Límite del horno', en: 'Kiln limit' },
  clearance: { es: 'Holgura entre vueltas', en: 'Clearance between turns' },
  minFeature: { es: 'Detalle mínimo', en: 'Minimum feature' },
  maxHeight: { es: 'Altura máxima', en: 'Maximum height' },
  stripMax: { es: 'Tira máxima', en: 'Maximum strip' },
  pageSize: { es: 'Tamaño de página', en: 'Page size' },

  checks: { es: 'Comprobaciones', en: 'Checks' },
  applyFix: { es: 'Aplicar', en: 'Apply' },
  fixApplied: { es: 'Aplicado — «atrás» lo deshace', en: 'Applied — Back undoes it' },
  exports: { es: 'Exportaciones', en: 'Exports' },
  exportPng1: { es: 'PNG 1×', en: 'PNG 1×' },
  exportPng2: { es: 'PNG 2×', en: 'PNG 2×' },
  exportPng4: { es: 'PNG 4×', en: 'PNG 4×' },
  transparentBg: { es: 'Fondo transparente', en: 'Transparent background' },
  exportStl: { es: 'STL (binario)', en: 'STL (binary)' },
  exportGlb: { es: 'GLB', en: 'GLB' },
  greenSize: { es: 'Tamaño en crudo', en: 'Green size' },
  exportPlanSvg: { es: 'SVG: planta 1:1', en: 'SVG: 1:1 plan' },
  exportStripsSvg: { es: 'SVG: tiras del muro', en: 'SVG: wall strips' },
  exportPdf: { es: 'PDF por mosaico', en: 'Tiled PDF' },
  exportSpecJson: { es: 'Ficha técnica (JSON)', en: 'Spec sheet (JSON)' },
  exportSpecPdf: { es: 'Ficha técnica (PDF)', en: 'Spec sheet (PDF)' },

  view: { es: 'Vista', en: 'View' },
  viewPlan: { es: 'Planta', en: 'Plan' },
  viewThreeQuarter: { es: 'Tres cuartos', en: 'Three-quarter' },
  viewElevation: { es: 'Alzado', en: 'Elevation' },
  autoRotate: { es: 'Giro automático', en: 'Auto-rotate' },
  language: { es: 'Idioma', en: 'Language' },

  events: { es: 'Erupciones', en: 'Eruptions' },
  precision: { es: 'Precisión', en: 'Precision' },
  precisionMinute: { es: 'al minuto', en: 'to the minute' },
  precisionHour: { es: 'a la hora', en: 'to the hour' },
  precisionAdvisory: { es: 'hora del aviso', en: 'advisory time' },
  precisionDay: { es: 'solo al día', en: 'day only' },
  plume: { es: 'Pluma sobre la cima', en: 'Plume above summit' },
  plumeUnknown: { es: 'pluma desconocida', en: 'plume unknown' },
  source: { es: 'Fuente', en: 'Source' },
  outsideWindow: { es: 'fuera de la ventana', en: 'outside the window' },

  data: { es: 'Datos', en: 'Data' },
  datum: { es: 'Plano de referencia', en: 'Observation datum' },
  gapsFilled: { es: 'horas reconstruidas', en: 'reconstructed hours' },
  fitRms: { es: 'RMS residual del ajuste', en: 'fit residual RMS' },
  loading: { es: 'Cargando datos…', en: 'Loading data…' },
  loadError: {
    es: 'No se pudieron cargar los datos. Ejecute «npm run build:data».',
    en: 'Could not load the data. Run “npm run build:data”.',
  },
  timelineTitle: {
    es: 'Nivel del mar observado, Tanegashima',
    en: 'Observed sea level, Tanegashima',
  },
  dragHint: {
    es: 'Pase el ratón para recorrer · clic en el inicio y el fin para fijar la ventana · arrastre la ventana para moverla',
    en: 'Hover to travel · click the start and the end to set the window · drag the window to move it',
  },
  pickEnd: {
    es: 'Ahora haga clic en el fin de la ventana (Esc para cancelar)',
    en: 'Now click the end of the window (Esc to cancel)',
  },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang];
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short date label, e.g. "7 oct" / "7 Oct". */
export function shortDate(date: Date, lang: Lang): string {
  const months = lang === 'es' ? MONTHS_ES : MONTHS_EN;
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

/** Full timestamp in a named zone, as a fixed-offset shift from UTC. */
export function timeInZone(date: Date, offsetHours: number, lang: Lang): string {
  const shifted = new Date(date.getTime() + offsetHours * 3600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${shortDate(shifted, lang)} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export function precisionLabel(precision: string, lang: Lang): string {
  switch (precision) {
    case 'minute':
      return t('precisionMinute', lang);
    case 'hour':
      return t('precisionHour', lang);
    case 'advisory':
      return t('precisionAdvisory', lang);
    default:
      return t('precisionDay', lang);
  }
}
