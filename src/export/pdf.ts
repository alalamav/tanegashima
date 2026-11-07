/**
 * Tiled PDF output.
 *
 * A 1:1 template is bigger than any sheet of paper this will be printed on, so
 * each SVG is laid over a grid of pages and every page carries what is needed to
 * reassemble it: crop marks at the corners, registration ticks at the edge
 * midpoints, the page's row and column, "page n of N", and the config hash.
 *
 * The PDF is created in mm units, and each page draws the WHOLE svg translated
 * so that the page's own tile falls inside the media box. Everything outside the
 * media box is simply not rendered, which is the cheapest correct way to tile.
 */

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

import { configHash, type PageSize, type Params } from '../geom/params.js';
import type { SpecSheet } from './spec.js';
import type { TemplateSheet } from './templates.js';
import { download, exportName } from './download.js';

/** Printable page sizes, mm. */
export const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
};

/** Printer margin kept clear on every page, mm. */
const PAGE_MARGIN = 10;
/** Length of a crop mark, mm. */
const CROP = 6;

function parseSvg(svgText: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = parsed.documentElement as unknown as SVGSVGElement;
  // svg2pdf measures the element, so it has to be in the document.
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-10000px';
  holder.style.top = '0';
  holder.append(root);
  document.body.append(holder);
  return root;
}

function pageFurniture(
  pdf: jsPDF,
  pageWidth: number,
  pageHeight: number,
  label: string,
): void {
  pdf.setDrawColor(20, 20, 20);
  pdf.setLineWidth(0.2);

  // Corner crop marks.
  for (const [x, y, dx, dy] of [
    [PAGE_MARGIN, PAGE_MARGIN, 1, 1],
    [pageWidth - PAGE_MARGIN, PAGE_MARGIN, -1, 1],
    [PAGE_MARGIN, pageHeight - PAGE_MARGIN, 1, -1],
    [pageWidth - PAGE_MARGIN, pageHeight - PAGE_MARGIN, -1, -1],
  ] as Array<[number, number, number, number]>) {
    pdf.line(x, y, x + dx * CROP, y);
    pdf.line(x, y, x, y + dy * CROP);
  }

  // Registration ticks at the edge midpoints: line these up between sheets.
  pdf.line(pageWidth / 2, PAGE_MARGIN - 3, pageWidth / 2, PAGE_MARGIN);
  pdf.line(pageWidth / 2, pageHeight - PAGE_MARGIN, pageWidth / 2, pageHeight - PAGE_MARGIN + 3);
  pdf.line(PAGE_MARGIN - 3, pageHeight / 2, PAGE_MARGIN, pageHeight / 2);
  pdf.line(pageWidth - PAGE_MARGIN, pageHeight / 2, pageWidth - PAGE_MARGIN + 3, pageHeight / 2);

  pdf.setFontSize(6.5);
  pdf.setTextColor(20, 20, 20);
  pdf.text(label, PAGE_MARGIN, pageHeight - PAGE_MARGIN + 6);
}

/** Lay one template sheet over a grid of pages. */
export async function tiledPdf(
  sheets: TemplateSheet[],
  params: Params,
  lang: 'es' | 'en',
): Promise<Blob> {
  const size = PAGE_SIZES[params.pageSize];
  const tileWidth = size.width - PAGE_MARGIN * 2;
  const tileHeight = size.height - PAGE_MARGIN * 2;
  const hash = configHash(params);

  const pdf = new jsPDF({ unit: 'mm', format: [size.width, size.height], compress: true });
  pdf.deletePage(1);

  // Count the pages first, so "page n of N" is right on the first page.
  const plans = sheets.map((sheet) => ({
    sheet,
    columns: Math.max(1, Math.ceil(sheet.widthMm / tileWidth)),
    rows: Math.max(1, Math.ceil(sheet.heightMm / tileHeight)),
  }));
  const totalPages = plans.reduce((total, plan) => total + plan.columns * plan.rows, 0);

  let pageNumber = 0;
  for (const plan of plans) {
    const root = parseSvg(plan.sheet.svg);
    try {
      for (let row = 0; row < plan.rows; row += 1) {
        for (let column = 0; column < plan.columns; column += 1) {
          pageNumber += 1;
          pdf.addPage([size.width, size.height], size.width > size.height ? 'landscape' : 'portrait');

          await svg2pdf(root, pdf, {
            x: PAGE_MARGIN - column * tileWidth,
            y: PAGE_MARGIN - row * tileHeight,
            width: plan.sheet.widthMm,
            height: plan.sheet.heightMm,
          });

          const of = lang === 'es' ? 'de' : 'of';
          pageFurniture(
            pdf,
            size.width,
            size.height,
            `${plan.sheet.id} · r${row + 1}c${column + 1} · ${lang === 'es' ? 'página' : 'page'} ${pageNumber} ${of} ${totalPages} · cfg ${hash} · 100%`,
          );
        }
      }
    } finally {
      root.parentElement?.remove();
    }
  }

  return pdf.output('blob');
}

export async function exportTemplatesPdf(
  sheets: TemplateSheet[],
  params: Params,
  lang: 'es' | 'en',
): Promise<void> {
  const blob = await tiledPdf(sheets, params, lang);
  download(blob, exportName(params, `templates-${params.pageSize}`, 'pdf'));
}

/** The one-page spec sheet: plain text on white, meant to be read in a studio. */
export function exportSpecPdf(spec: SpecSheet, params: Params, lang: 'es' | 'en'): void {
  const size = PAGE_SIZES[params.pageSize];
  const pdf = new jsPDF({ unit: 'mm', format: [size.width, size.height], compress: true });
  const left = 14;
  const right = size.width - 14;
  let y = 18;

  const line = (text: string, fontSize = 7.4, colour: [number, number, number] = [20, 20, 20]) => {
    if (y > size.height - 14) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...colour);
    const wrapped = pdf.splitTextToSize(text, right - left) as string[];
    for (const part of wrapped) {
      pdf.text(part, left, y);
      y += fontSize * 0.46;
    }
  };
  const rule = () => {
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.15);
    pdf.line(left, y, right, y);
    y += 3.4;
  };
  const heading = (text: string) => {
    y += 2.2;
    line(text.toUpperCase(), 7, [20, 20, 20]);
    rule();
  };

  pdf.setFont('helvetica', 'normal');
  line(spec.piece.title, 15);
  line(
    lang === 'es'
      ? 'El nivel del mar medido en Tanegashima durante las erupciones del Pichincha, 1999'
      : "Tanegashima's measured sea level during Pichincha's 1999 eruptions",
    8,
    [90, 90, 90],
  );
  y += 1.5;
  line(
    `cfg ${spec.piece.configHash} · ${lang === 'es' ? 'generado' : 'built'} ${spec.piece.builtAtUtc} · ${lang === 'es' ? 'versión de datos' : 'data version'} ${spec.piece.codeVersion}`,
    6.6,
    [90, 90, 90],
  );
  rule();

  heading(lang === 'es' ? 'Correspondencia' : 'Mapping');
  for (const [key, value] of Object.entries(spec.mapping)) line(`${key}: ${value}`);

  heading(lang === 'es' ? 'Dimensiones (cocido, mm)' : 'Dimensions (fired, mm)');
  const d = spec.derived;
  line(
    `${lang === 'es' ? 'diámetro exterior' : 'outer diameter'} ${d.firedOuterDiameterMm.toFixed(1)} · ${lang === 'es' ? 'en crudo' : 'green'} ${d.greenOuterDiameterMm.toFixed(1)} (×${d.greenScale.toFixed(4)})`,
  );
  line(
    `${lang === 'es' ? 'línea central' : 'centerline'} ${d.centerlineLengthMm.toFixed(1)} · ${lang === 'es' ? 'vueltas' : 'turns'} ${d.turns.toFixed(3)} · ${lang === 'es' ? 'separación' : 'spacing'} ${d.turnSpacingMm.toFixed(1)}`,
  );
  line(
    `${lang === 'es' ? 'altura' : 'height'} ${d.wallHeightMinMm.toFixed(1)}–${d.wallHeightMaxMm.toFixed(1)} · ${lang === 'es' ? 'espesor' : 'thickness'} ${spec.params.wallThickness} · ${lang === 'es' ? 'volumen' : 'volume'} ${d.wallVolumeCm3.toFixed(1)} cm³`,
  );
  line(
    `${lang === 'es' ? 'longitud de onda de la marea' : 'tide wavelength'} ${d.tideWavelengthMm.toFixed(2)} · ${lang === 'es' ? 'tiras' : 'strips'} ${d.strips} (${d.stripLengthsMm.map((v) => v.toFixed(0)).join(', ')} mm) · ${lang === 'es' ? 'hermético' : 'watertight'} ${d.watertight ? 'sí/yes' : 'no'}`,
  );

  heading(lang === 'es' ? 'Comprobaciones de fabricación' : 'Fabrication checks');
  for (const check of spec.checks) {
    line(
      `[${check.level}] ${lang === 'es' ? check.labelEs : check.labelEn}: ${check.value} (${check.limit})`,
      7,
      check.level === 'fail' ? [255, 42, 42] : [20, 20, 20],
    );
  }

  heading(lang === 'es' ? 'Ecuaciones' : 'Equations');
  pdf.setFont('courier', 'normal');
  for (const equation of spec.equations) line(equation, 6.4);
  pdf.setFont('helvetica', 'normal');

  heading(lang === 'es' ? 'Datos' : 'Data');
  line(
    `${spec.data.station.nameEn} (${spec.data.station.code}) ${spec.data.station.latitude}°N ${spec.data.station.longitude}°E · JST = UTC+9`,
  );
  line(`${lang === 'es' ? 'ventana' : 'window'} ${spec.data.windowUtc[0]} → ${spec.data.windowUtc[1]} (${spec.data.hoursInWindow} h)`);
  line(
    `${lang === 'es' ? 'plano de referencia' : 'datum'} ${spec.data.datumCm} cm · ${spec.data.datumVerified ? (lang === 'es' ? 'verificado' : 'verified') : (lang === 'es' ? 'asumido' : 'assumed')} · ${spec.data.datumSource}`,
  );
  line(
    `${lang === 'es' ? 'señal' : 'signal'} ${spec.data.signal} · ${lang === 'es' ? 'rango' : 'range'} ${spec.data.signalRangeCm.toFixed(1)} cm · ${spec.data.reconstructedHours} ${lang === 'es' ? 'horas reconstruidas' : 'reconstructed hours'}`,
  );
  line(
    `${lang === 'es' ? 'ajuste armónico' : 'harmonic fit'}: ${spec.data.harmonicFit.constituents.map((c) => `${c.name} ${c.amplitudeCm.toFixed(1)}cm`).join(' · ')} · RMS ${spec.data.harmonicFit.residualRmsCm.toFixed(2)} cm · R² ${spec.data.harmonicFit.rSquared}`,
  );
  for (const gap of spec.data.gaps) {
    line(`${lang === 'es' ? 'hueco' : 'gap'} ${gap.startUtc} → ${gap.endUtc} (${gap.hours} h): ${gap.method}`, 6.4, [90, 90, 90]);
  }

  heading(lang === 'es' ? 'Archivos de origen (SHA-256)' : 'Source files (SHA-256)');
  pdf.setFont('courier', 'normal');
  for (const input of spec.data.inputs) {
    line(`${input.path}  ${input.sha256}`, 5.6, [60, 60, 60]);
    line(`  ${input.url}`, 5.2, [120, 120, 120]);
  }
  pdf.setFont('helvetica', 'normal');

  heading(lang === 'es' ? 'Erupciones' : 'Eruptions');
  for (const event of spec.events) {
    line(
      `${event.id} · ${event.utc} · ${event.precisionNote} · ${lang === 'es' ? 'fase' : 'phase'} ${event.moonPhaseDeg.toFixed(1)}° · ${lang === 'es' ? 'elev' : 'elev'} ${event.seaElevationCm.toFixed(1)} cm · ${lang === 'es' ? 'pluma' : 'plume'} ${event.plumeKm === null ? (lang === 'es' ? 'desconocida' : 'unknown') : `${event.plumeKm} km`} · ${lang === 'es' ? 'muesca' : 'notch'} ${event.notchDepthMm === null ? '—' : `${event.notchDepthMm.toFixed(1)} mm`}`,
      6.6,
    );
    line(`   ${event.label} — ${event.notes}`, 5.8, [90, 90, 90]);
    line(`   ${event.sourceUrl}`, 5.2, [120, 120, 120]);
  }

  heading(lang === 'es' ? 'Encuadre' : 'Framing');
  line(spec.framing, 7, [20, 20, 20]);

  download(pdf.output('blob'), exportName(params, 'spec', 'pdf'));
}
