/** Hand a generated file to the browser, named so exports can be matched later. */

import { configHash, type Params } from '../geom/params.js';

/** `two-clocks_<what>_<confighash>.<ext>` — the hash ties every export together. */
export function exportName(params: Params, what: string, extension: string): string {
  return `two-clocks_${what}_${configHash(params)}.${extension}`;
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, type: string): void {
  download(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}
