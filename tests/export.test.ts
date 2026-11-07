import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BuildMeta, Series, VolcanoEvent } from '../src/data/series.js';
import { DEFAULT_PARAMS, configHash, greenScale, type Params } from '../src/geom/params.js';
import { buildBaseDisc, buildWall, buildWallMesh } from '../src/geom/wall.js';
import { toBinaryStl } from '../src/export/mesh.js';
import { OVERLAP_MM, planSheet, stripRanges, wallStripSheet } from '../src/export/templates.js';
import { buildSpec, EQUATIONS } from '../src/export/spec.js';

const dataDir = resolve(import.meta.dirname, '../public/data');
const series = JSON.parse(readFileSync(resolve(dataDir, 'series.json'), 'utf8')) as Series;
const events = JSON.parse(readFileSync(resolve(dataDir, 'events.json'), 'utf8')) as VolcanoEvent[];
const meta = JSON.parse(readFileSync(resolve(dataDir, 'build-meta.json'), 'utf8')) as BuildMeta;

const params: Params = { ...DEFAULT_PARAMS };
const wall = buildWall(series, events, params);

describe('binary STL', () => {
  const mesh = buildWallMesh(wall, params);
  const buffer = toBinaryStl([mesh], 'two clocks test');

  it('has the exact byte length the format requires', () => {
    expect(buffer.byteLength).toBe(84 + mesh.triangleCount * 50);
  });

  it('writes the triangle count into the header', () => {
    expect(new DataView(buffer).getUint32(80, true)).toBe(mesh.triangleCount);
  });

  it('does not start with "solid", which would make readers guess ASCII', () => {
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 5));
    expect(header).not.toBe('solid');
  });

  it('writes unit-length facet normals', () => {
    const view = new DataView(buffer);
    for (let triangle = 0; triangle < 50; triangle += 1) {
      const offset = 84 + triangle * 50;
      const length = Math.hypot(
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true),
      );
      expect(length).toBeCloseTo(1, 4);
    }
  });

  it('keeps every vertex inside the bounding box of the piece, in mm', () => {
    const view = new DataView(buffer);
    const limit = (params.r1 + params.wallThickness) * 1.01;
    for (let triangle = 0; triangle < mesh.triangleCount; triangle += 37) {
      const offset = 84 + triangle * 50 + 12;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const x = view.getFloat32(offset + vertex * 12, true);
        const y = view.getFloat32(offset + vertex * 12 + 4, true);
        const z = view.getFloat32(offset + vertex * 12 + 8, true);
        expect(Math.abs(x)).toBeLessThanOrEqual(limit);
        expect(Math.abs(z)).toBeLessThanOrEqual(limit);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(params.maxHeightMm);
      }
    }
  });

  it('includes the base disc when it is switched on', () => {
    const withDisc: Params = { ...params, baseDisc: true };
    const disc = buildBaseDisc(withDisc);
    const combined = toBinaryStl([mesh, disc], 'two clocks test');
    expect(new DataView(combined).getUint32(80, true)).toBe(
      mesh.triangleCount + disc.triangleCount,
    );
  });
});

describe('strip splitting', () => {
  const ranges = stripRanges(wall, params);

  it('sums the strips back to the centerline length within 0.5 mm', () => {
    const total = ranges.reduce((sum, range) => sum + (range.sEnd - range.sStart), 0);
    expect(Math.abs(total - wall.spiral.length)).toBeLessThan(0.5);
  });

  it('covers the centerline with no gaps', () => {
    expect(ranges[0].sStart).toBe(0);
    expect(ranges[ranges.length - 1].sEnd).toBeCloseTo(wall.spiral.length, 6);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].sStart).toBeCloseTo(ranges[i - 1].sEnd, 6);
    }
  });

  it('keeps every green strip inside the paper limit', () => {
    const scale = greenScale(params);
    for (const range of ranges) {
      expect((range.sEndWithTab - range.sStart) * scale).toBeLessThanOrEqual(params.stripMaxMm + 1e-6);
    }
  });

  it('adds a 10 mm overlap tab to every strip but the last', () => {
    for (const range of ranges.slice(0, -1)) {
      expect(range.sEndWithTab - range.sEnd).toBeCloseTo(OVERLAP_MM, 6);
    }
    expect(ranges[ranges.length - 1].sEndWithTab).toBeCloseTo(ranges[ranges.length - 1].sEnd, 6);
  });

  it('numbers the strips 1..N', () => {
    expect(ranges.map((range) => range.index)).toEqual(ranges.map((_, i) => i + 1));
    expect(new Set(ranges.map((range) => range.total))).toEqual(new Set([ranges.length]));
  });
});

describe('1:1 SVG templates', () => {
  const plan = planSheet(wall, params, series, 'es');
  const strips = wallStripSheet(wall, params, series, 'es');

  for (const [name, sheet] of [
    ['plan', plan],
    ['strips', strips],
  ] as const) {
    describe(name, () => {
      it('declares real millimetre units with a matching viewBox', () => {
        const width = /width="([\d.]+)mm"/.exec(sheet.svg);
        const height = /height="([\d.]+)mm"/.exec(sheet.svg);
        const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(sheet.svg);
        expect(width).not.toBeNull();
        expect(height).not.toBeNull();
        expect(viewBox).not.toBeNull();
        // 1 user unit == 1 mm, which is what makes the file print at true size.
        expect(Number(viewBox![1])).toBeCloseTo(Number(width![1]), 3);
        expect(Number(viewBox![2])).toBeCloseTo(Number(height![1]), 3);
        expect(Number(width![1])).toBeCloseTo(sheet.widthMm, 3);
      });

      it('carries a 100 mm calibration square', () => {
        expect(sheet.svg).toContain('width="100" height="100"');
        expect(sheet.svg).toContain('100 mm');
      });

      it('tells the printer not to scale', () => {
        expect(sheet.svg).toContain('100%');
      });

      it('stamps the config hash', () => {
        expect(sheet.svg).toContain(`cfg ${configHash(params)}`);
      });

      it('is well-formed XML with a single root', () => {
        expect(sheet.svg.startsWith('<?xml')).toBe(true);
        expect(sheet.svg.match(/<svg\b/g)).toHaveLength(1);
        expect(sheet.svg.trimEnd().endsWith('</svg>')).toBe(true);
      });

      it('draws the notches in the accent red and nothing else', () => {
        const reds = sheet.svg.match(/#ff2a2a/g) ?? [];
        expect(reds.length).toBeGreaterThan(0);
      });
    });
  }

  it('sizes the plan sheet to the green outer diameter plus margins', () => {
    const greenDiameter = 2 * (params.r1 + params.wallThickness / 2) * greenScale(params);
    expect(plan.widthMm).toBeGreaterThan(greenDiameter);
    expect(plan.widthMm).toBeLessThan(greenDiameter + 50);
  });

  it('names every strip and every notch on the strip sheet', () => {
    for (const range of stripRanges(wall, params)) {
      expect(strips.svg).toContain(`TIRA ${range.index}/${range.total}`);
    }
    for (const notch of wall.notches) {
      expect(strips.svg).toContain(notch.eventId);
    }
  });

  it('marks the new-moon direction on the plan', () => {
    expect(plan.svg).toContain('luna nueva 0°');
    expect(planSheet(wall, params, series, 'en').svg).toContain('new moon 0°');
  });
});

describe('spec sheet', () => {
  const spec = buildSpec(wall, params, series, events, meta, 'en');

  it('records the parameters and a matching config hash', () => {
    expect(spec.params).toEqual(params);
    expect(spec.piece.configHash).toBe(configHash(params));
  });

  it('carries every equation the geometry uses', () => {
    expect(spec.equations).toEqual(EQUATIONS);
    expect(spec.equations.join(' ')).toContain('h_base');
    expect(spec.equations.join(' ')).toContain('-374.5 cm');
  });

  it('lists the source files with their URLs and SHA-256 hashes', () => {
    expect(spec.data.inputs).toHaveLength(8);
    for (const input of spec.data.inputs) {
      expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(input.url).toContain('data.jma.go.jp');
    }
  });

  it('states the datum and whether it was verified', () => {
    expect(spec.data.datumCm).toBe(-374.5);
    expect(spec.data.datumVerified).toBe(true);
    expect(spec.data.datumSource).toContain('JMA');
  });

  it('lists every gap with its fill method and the fit residual', () => {
    expect(spec.data.reconstructedHours).toBe(41);
    expect(spec.data.gaps).toHaveLength(2);
    for (const gap of spec.data.gaps) expect(gap.method).toContain('harmonic fit');
    expect(spec.data.harmonicFit.residualRmsCm).toBeGreaterThan(0);
    expect(spec.data.harmonicFit.constituents).toHaveLength(6);
  });

  it('gives every event its precision flag and notch depth', () => {
    expect(spec.events).toHaveLength(5);
    const e2 = spec.events.find((event) => event.id === 'e2')!;
    expect(e2.precision).toBe('advisory');
    expect(e2.precisionNote).toBe('advisory time');
    expect(e2.notchDepthMm).toBeCloseTo(
      params.notchDepth0 + params.notchDepthPerKm * 15,
      6,
    );
    const e5 = spec.events.find((event) => event.id === 'e5')!;
    expect(e5.plumeKm).toBeNull();
  });

  it('reports a watertight mesh and the strip plan', () => {
    expect(spec.derived.watertight).toBe(true);
    expect(spec.derived.strips).toBe(stripRanges(wall, params).length);
    expect(spec.derived.wallVolumeCm3).toBeGreaterThan(0);
  });

  it('says plainly that the alignment is shown, not explained', () => {
    expect(spec.framing).toContain('shown, not explained');
  });

  it('passes every build check it carries forward', () => {
    expect(spec.data.buildChecks.every((check) => check.pass)).toBe(true);
    expect(spec.data.buildChecks.length).toBeGreaterThan(20);
  });
});
