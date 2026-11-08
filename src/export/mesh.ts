/**
 * Mesh exports, in millimetres.
 *
 * Both formats are written at FIRED size by default, or at green size — scaled
 * by 1/(1 - shrinkage) — for a mould or a cutting jig that has to be made
 * before the clay shrinks.
 *
 * The STL writer is written out by hand rather than taken from three.js so the
 * output is byte-deterministic for a given parameter set, and so the vertex
 * positions are the geometry module's own numbers rather than whatever a
 * scene graph transform left behind.
 */

import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { greenScale, type Params } from '../geom/params.js';
import { buildBaseDisc, buildWallMesh, type MeshData, type Wall } from '../geom/wall.js';
import { download, exportName } from './download.js';

/** Binary STL: 80-byte header, triangle count, then 50 bytes per triangle. */
export function toBinaryStl(meshes: MeshData[], header: string): ArrayBuffer {
  const triangles = meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0);
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The header is ASCII and must not start with "solid", or readers guess wrong.
  const text = header.slice(0, 79);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0x7f;

  view.setUint32(80, triangles, true);

  let offset = 84;
  for (const mesh of meshes) {
    const { positions, indices } = mesh;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;

      const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];

      // Face normal from the cross product of two edges, normalised.
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;

      view.setFloat32(offset, nx, true);
      view.setFloat32(offset + 4, ny, true);
      view.setFloat32(offset + 8, nz, true);
      view.setFloat32(offset + 12, ax, true);
      view.setFloat32(offset + 16, ay, true);
      view.setFloat32(offset + 20, az, true);
      view.setFloat32(offset + 24, bx, true);
      view.setFloat32(offset + 28, by, true);
      view.setFloat32(offset + 32, bz, true);
      view.setFloat32(offset + 36, cx, true);
      view.setFloat32(offset + 40, cy, true);
      view.setFloat32(offset + 44, cz, true);
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }

  return buffer;
}

function solids(wall: Wall, params: Params, green: boolean): MeshData[] {
  const scale = green ? greenScale(params) : 1;
  const out = [buildWallMesh(wall, params, scale)];
  if (params.baseDisc) {
    // The revolved form's foot is wherever the tide left it, not r₀, so the
    // disc is sized to the bottom of the actual profile.
    const footRadius = wall.clock.revolved ? params.r0 + wall.top[0] : undefined;
    out.push(buildBaseDisc(params, 6, 256, scale, footRadius));
  }
  return out;
}

export function exportStl(wall: Wall, params: Params, green: boolean, configHash: string): void {
  const header = `two clocks ${green ? 'green' : 'fired'} mm cfg:${configHash}`;
  const buffer = toBinaryStl(solids(wall, params, green), header);
  download(
    new Blob([buffer], { type: 'model/stl' }),
    exportName(params, green ? 'mesh-green' : 'mesh-fired', 'stl'),
  );
}

export async function exportGlb(
  wall: Wall,
  params: Params,
  green: boolean,
  configHash: string,
): Promise<void> {
  const scene = new Scene();
  scene.name = `two-clocks ${configHash}`;
  for (const [index, solid] of solids(wall, params, green).entries()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(solid.positions, 3));
    geometry.setIndex(new BufferAttribute(solid.indices, 1));
    geometry.computeVertexNormals();
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: 0xece9e3, roughness: 0.92, metalness: 0 }),
    );
    mesh.name = index === 0 ? 'wall' : 'base-disc';
    scene.add(mesh);
  }

  const exporter = new GLTFExporter();
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true },
    );
  });
  download(
    new Blob([glb], { type: 'model/gltf-binary' }),
    exportName(params, green ? 'mesh-green' : 'mesh-fired', 'glb'),
  );
}
