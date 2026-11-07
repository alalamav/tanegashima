/**
 * Download the eight JMA "genbo" tide files for Tanegashima (station TJ),
 * Sep-Dec 1999, and record a manifest of URL, retrieval date, byte count and
 * SHA-256 for each one.
 *
 *   npm run fetch:jma            download anything missing, refresh the manifest
 *   npm run fetch:jma -- --force re-download everything
 *
 * The raw files are committed and never edited. If this machine cannot reach
 * data.jma.go.jp, download the eight files by hand into data/raw/jma/ and run
 * this script again: it will hash whatever is on disk and write the manifest,
 * marking the entries it could not retrieve itself.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const rawDir = resolve(root, 'data/raw/jma');
const manifestPath = resolve(root, 'data/raw/MANIFEST.json');

const MONTHS = ['09', '10', '11', '12'] as const;
const KINDS = ['hry', 'dep'] as const;

const fileUrl = (kind: string, month: string) =>
  `https://www.data.jma.go.jp/kaiyou/data/db/tide/genbo/1999/1999${month}/${kind}1999${month}TJ.txt`;

const monthPageUrl = (month: string) =>
  `https://www.data.jma.go.jp/kaiyou/db/tide/genbo/genbo.php?stn=TJ&year=1999&month=${month}`;

export interface ManifestEntry {
  path: string;
  url: string;
  retrievedUtc: string;
  sha256: string;
  bytes: number;
  /** false when the file was placed on disk by hand rather than fetched here. */
  fetchedByScript: boolean;
}

export interface Manifest {
  station: { code: string; nameEn: string; nameJa: string };
  format: string;
  datum: {
    cm: number;
    source: string;
    verifiedMonths: string[];
    assumedMonths: string[];
  };
  files: ManifestEntry[];
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'two-clocks-data-build/0.1 (one-off archival fetch)' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      console.warn(`  ! HTTP ${response.status} for ${url}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`  ! fetch failed for ${url}: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Read the observation datum ("観測基準面の標高") out of a month's page header.
 * The wall's shape does not depend on the datum, but every elevation label does,
 * so an assumed value has to be flagged rather than silently used.
 */
async function readDatum(month: string): Promise<number | null> {
  const html = await download(monthPageUrl(month));
  if (!html) return null;
  const text = html.toString('utf8').replace(/\s+/g, ' ');
  const match = /観測基準面の標高：[^]*?(-?\d+(?:\.\d+)?)\s*\(cm\)/.exec(text);
  if (!match) {
    // The page is served as UTF-8; if the marker is unreadable, fall back to the
    // first "(cm)"-suffixed number on the page.
    const loose = /(-?\d+\.\d+)\s*\(cm\)/.exec(text);
    return loose ? Number.parseFloat(loose[1]) : null;
  }
  return Number.parseFloat(match[1]);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  await mkdir(rawDir, { recursive: true });

  let previous: Manifest | null = null;
  if (existsSync(manifestPath)) {
    previous = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  }

  const entries: ManifestEntry[] = [];

  for (const month of MONTHS) {
    for (const kind of KINDS) {
      const name = `${kind}1999${month}TJ.txt`;
      const path = resolve(rawDir, name);
      const url = fileUrl(kind, month);
      const relative = `data/raw/jma/${name}`;
      let fetchedNow = false;

      if (force || !existsSync(path)) {
        console.log(`fetching ${name}`);
        const body = await download(url);
        if (body) {
          await writeFile(path, body);
          fetchedNow = true;
        }
      }

      if (!existsSync(path)) {
        console.error(
          `  MISSING ${relative} — download it by hand from ${url} and re-run this script.`,
        );
        continue;
      }

      const buffer = await readFile(path);
      const prior = previous?.files.find((file) => file.path === relative);
      entries.push({
        path: relative,
        url,
        retrievedUtc: fetchedNow
          ? new Date().toISOString()
          : prior?.retrievedUtc ?? new Date().toISOString(),
        sha256: sha256(buffer),
        bytes: buffer.byteLength,
        fetchedByScript: fetchedNow || prior?.fetchedByScript === true,
      });
      console.log(`  ${relative}  ${buffer.byteLength} bytes  ${sha256(buffer).slice(0, 16)}…`);
    }
  }

  console.log('reading observation datum from month pages');
  const datums = new Map<string, number | null>();
  for (const month of MONTHS) datums.set(month, await readDatum(month));
  for (const [month, value] of datums) console.log(`  1999-${month}: ${value ?? 'unreadable'} cm`);

  const verified = [...datums.entries()].filter(([, v]) => v !== null).map(([m]) => `1999-${m}`);
  const assumed = [...datums.entries()].filter(([, v]) => v === null).map(([m]) => `1999-${m}`);
  const readValues = [...datums.values()].filter((v): v is number => v !== null);
  const distinct = [...new Set(readValues)];
  if (distinct.length > 1) {
    console.warn(`  ! the months report different datums: ${distinct.join(', ')} cm`);
  }
  const datumCm = distinct.length === 1 ? distinct[0] : previous?.datum.cm ?? -374.5;

  const manifest: Manifest = {
    station: { code: 'TJ', nameEn: 'Tanegashima', nameJa: '種子島' },
    format: 'https://ds.data.jma.go.jp/kaiyou/db/tide/genbo/format.html',
    datum: {
      cm: datumCm,
      source:
        readValues.length > 0
          ? 'JMA month page header 観測基準面の標高 (genbo.php?stn=TJ&year=1999&month=MM)'
          : 'assumed from the published October 1999 value; month pages unreachable',
      verifiedMonths: verified,
      assumedMonths: assumed,
    },
    files: entries,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${manifestPath} (${entries.length}/8 files, datum ${datumCm} cm)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
