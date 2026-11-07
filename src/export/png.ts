/** Render export. The 3D view as it stands, at 1x, 2x or 4x. */

import type { Params } from '../geom/params.js';
import type { SceneHandle } from '../ui/scene.js';
import { download, exportName } from './download.js';

export async function exportPng(
  scene: SceneHandle,
  params: Params,
  scale: 1 | 2 | 4,
  transparent: boolean,
): Promise<void> {
  const blob = await scene.capturePng(scale, transparent);
  download(blob, exportName(params, `render-${scale}x${transparent ? '-alpha' : ''}`, 'png'));
}
