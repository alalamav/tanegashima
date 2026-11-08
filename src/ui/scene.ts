/**
 * The 3D view: a matte clay wall on a soft ground, lit by one key light and a
 * hemisphere fill, tone-mapped with ACES. The only red in the scene is the
 * notch overlay, and the only bloom is on that overlay.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BlendFunction, EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from 'postprocessing';

import type { Params } from '../geom/params.js';
import { buildNotchOverlay, buildWallMesh, toThree, type Wall } from '../geom/wall.js';
import type { Notch } from '../geom/notches.js';

/** A point in plan plus a height, in fired mm — the space the geometry is in. */
export interface PlanHeight {
  x: number;
  y: number;
  h: number;
}

export type ViewPreset = 'plan' | 'threeQuarter' | 'elevation';

const CLAY = 0xece9e3;
const ACCENT = 0xff2a2a;
const BG = 0x0e0e0f;

/** Camera moves take 300–600 ms with an ease-out, unless motion is reduced. */
const EASE_MS = 520;

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface SceneHandle {
  /** Diagnostics for the dev hook; not used by the app itself. */
  debug(): Record<string, unknown>;
  setWall(wall: Wall, params: Params): void;
  setCursor(needle: { base: PlanHeight; tip: PlanHeight } | null): void;
  focusNotch(notch: Notch, wall: Wall): void;
  setView(preset: ViewPreset): void;
  setAutoRotate(enabled: boolean): void;
  capturePng(scale: number, transparent: boolean): Promise<Blob>;
  resize(): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(BG);

  const camera = new PerspectiveCamera(38, 1, 1, 8000);
  camera.position.set(290, 300, 450);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 90;
  controls.maxDistance = 1800;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.autoRotateSpeed = 0.35;
  controls.target.set(0, 20, 0);

  // ---- light ------------------------------------------------------------
  // One soft key light, a hemisphere fill, no environment reflections: the clay
  // should look like clay, not like glazed ceramic.
  const key = new DirectionalLight(0xfff6ea, 2.1);
  key.position.set(-260, 420, 240);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -320;
  key.shadow.camera.right = 320;
  key.shadow.camera.top = 320;
  key.shadow.camera.bottom = -320;
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 1400;
  key.shadow.bias = -0.0008;
  key.shadow.radius = 2.6;
  scene.add(key);
  scene.add(new HemisphereLight(0x8d9099, 0x151517, 0.85));
  scene.add(new AmbientLight(0xffffff, 0.12));

  // ---- ground -----------------------------------------------------------
  const ground = new Mesh(new PlaneGeometry(4000, 4000), new ShadowMaterial({ opacity: 0.42 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- the piece --------------------------------------------------------
  const piece = new Group();
  scene.add(piece);

  const clayMaterial = new MeshStandardMaterial({
    color: CLAY,
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  const accentMaterial = new MeshBasicMaterial({ color: ACCENT, toneMapped: false });

  const wallGeometry = new BufferGeometry();
  const wallMesh = new Mesh(wallGeometry, clayMaterial);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  piece.add(wallMesh);

  const notchGeometry = new BufferGeometry();
  const notchMesh = new Mesh(notchGeometry, accentMaterial);
  piece.add(notchMesh);

  const cursorGeometry = new BufferGeometry();
  const cursorMesh = new Mesh(cursorGeometry, new MeshBasicMaterial({ color: CLAY, toneMapped: false }));
  cursorMesh.visible = false;
  piece.add(cursorMesh);

  // ---- bloom, on the notches only --------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new SelectiveBloomEffect(scene, camera, {
    blendFunction: BlendFunction.ADD,
    intensity: 1.1,
    luminanceThreshold: 0.55,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
    radius: 0.62,
  });
  bloom.selection.set([notchMesh]);
  composer.addPass(new EffectPass(camera, bloom));

  // ---- resize -----------------------------------------------------------
  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // ---- camera easing ----------------------------------------------------
  let animation: {
    from: Vector3;
    to: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    start: number;
  } | null = null;

  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

  const moveCamera = (position: Vector3, target: Vector3): void => {
    if (prefersReducedMotion()) {
      camera.position.copy(position);
      controls.target.copy(target);
      return;
    }
    animation = {
      from: camera.position.clone(),
      to: position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      start: performance.now(),
    };
  };

  // ---- idle auto-rotate -------------------------------------------------
  let autoRotateWanted = true;
  let lastInteraction = performance.now();
  const noteInteraction = () => {
    lastInteraction = performance.now();
    controls.autoRotate = false;
  };
  controls.addEventListener('start', noteInteraction);
  canvas.addEventListener('pointerdown', noteInteraction);
  canvas.addEventListener('wheel', noteInteraction, { passive: true });

  // ---- the frame loop ---------------------------------------------------
  let disposed = false;
  let frames = 0;
  const frame = (): void => {
    if (disposed) return;
    frames += 1;
    requestAnimationFrame(frame);

    if (animation) {
      const t = Math.min((performance.now() - animation.start) / EASE_MS, 1);
      const eased = easeOutCubic(t);
      camera.position.lerpVectors(animation.from, animation.to, eased);
      controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased);
      if (t >= 1) animation = null;
    }

    controls.autoRotate =
      autoRotateWanted &&
      !animation &&
      !prefersReducedMotion() &&
      performance.now() - lastInteraction > 4000;

    controls.update();
    composer.render();
  };
  requestAnimationFrame(frame);

  // ---- geometry updates -------------------------------------------------
  // What the camera has to frame. A flat spiral is wide and low; a cylinder is
  // narrow and tall, so the framing radius takes the greater of the two.
  let currentRadius = 160;
  let currentHeight = 80;
  /** The framing radius the camera was last placed for, to notice a big jump. */
  let framedRadius = 0;
  let lastPreset: ViewPreset = 'threeQuarter';

  const setWall = (wall: Wall, params: Params): void => {
    const mesh = buildWallMesh(wall, params);
    wallGeometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    wallGeometry.setIndex(new BufferAttribute(mesh.indices, 1));
    // computeVertexNormals REUSES an existing normal attribute rather than
    // resizing it, so a mesh with more vertices than the last one would be
    // drawn against a normal buffer too short for it — which WebGL refuses
    // outright, and the piece simply disappears. Dropping the old one first
    // makes it allocate at the new size.
    wallGeometry.deleteAttribute('normal');
    wallGeometry.computeVertexNormals();
    wallGeometry.computeBoundingSphere();

    const overlay = buildNotchOverlay(wall, params);
    notchGeometry.setAttribute('position', new BufferAttribute(overlay.positions, 3));
    notchGeometry.setIndex(new BufferAttribute(overlay.indices, 1));
    notchGeometry.computeBoundingSphere();

    currentHeight = Math.max(wall.totalHeightMm, 1);
    // The wall knows its own widest point, which on the revolved form is the
    // tide's crest rather than any radius parameter.
    currentRadius = Math.max(
      wall.outerRadiusMm + params.wallThickness / 2,
      currentHeight * 0.55,
    );
    const span = Math.max(currentRadius * 2.6, 240);
    key.shadow.camera.left = -span;
    key.shadow.camera.right = span;
    key.shadow.camera.top = span;
    key.shadow.camera.bottom = -span;
    key.shadow.camera.far = Math.max(1400, currentRadius * 6);
    key.shadow.camera.updateProjectionMatrix();
    key.position.set(-currentRadius * 1.8, currentRadius * 3, currentRadius * 1.7);

    // The revolved form's height follows the window, so one click on a preset
    // can change the size of the piece by an order of magnitude. The orbit
    // limits and the far plane have to follow it, or the camera runs out of
    // room to stand back and the piece is simply cropped.
    controls.minDistance = Math.max(90, currentRadius * 0.3);
    controls.maxDistance = Math.max(1800, currentRadius * 10);
    camera.far = Math.max(8000, currentRadius * 24);
    camera.updateProjectionMatrix();

    // And when the scale really has jumped, re-frame: a view set for a 300 mm
    // pot shows nothing of a 4 m one.
    const jumped = framedRadius > 0 && (currentRadius / framedRadius > 1.6 || framedRadius / currentRadius > 1.6);
    if (jumped) setView(lastPreset);
  };

  /**
   * A thin needle through the piece at the cursor: two quads crossed along its
   * own axis, so it reads from any angle.
   *
   * It takes a base and a tip rather than a point and a height, because the
   * directions differ by mode: on a coil it stands up off the ground past the
   * crest, and on the revolved form it points OUT of the circumference at the
   * cursor's own height, which is where that moment's tide actually is.
   */
  const setCursor = (needle: { base: PlanHeight; tip: PlanHeight } | null): void => {
    if (!needle) {
      cursorMesh.visible = false;
      return;
    }
    const half = 0.5;
    const from = new Vector3(...toThree(needle.base.x, needle.base.y, needle.base.h));
    const to = new Vector3(...toThree(needle.tip.x, needle.tip.y, needle.tip.h));
    const axis = to.clone().sub(from);
    if (axis.lengthSq() < 1e-9) {
      cursorMesh.visible = false;
      return;
    }
    axis.normalize();
    // Any direction across the needle will do; the seed only has to not lie
    // along the axis itself.
    const seed = Math.abs(axis.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const across = new Vector3().crossVectors(axis, seed).normalize().multiplyScalar(half);
    const other = new Vector3().crossVectors(axis, across).normalize().multiplyScalar(half);

    const vertices: number[] = [];
    for (const offset of [across, other]) {
      const a = from.clone().sub(offset);
      const b = from.clone().add(offset);
      const c = to.clone().add(offset);
      const d = to.clone().sub(offset);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      vertices.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    const positions = new Float32Array(vertices);
    cursorGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    cursorGeometry.setIndex(null);
    cursorGeometry.computeBoundingSphere();
    cursorMesh.visible = true;
  };

  const setView = (preset: ViewPreset): void => {
    lastPreset = preset;
    framedRadius = currentRadius;
    // The camera's field of view is vertical, so on a portrait window the piece
    // has to be further away to fit across the narrow axis.
    const r = currentRadius * Math.max(1, 1 / Math.max(camera.aspect, 0.2));
    // Look at the middle of the piece's own height, not at the ground, or a
    // tall cylinder sits half out of frame.
    // r is a radius but the piece is two of them across, so the standoffs are
    // set against the diameter: a little over five radii away frames a piece
    // at about half the frame height.
    const midpoint = currentHeight / 2;
    switch (preset) {
      case 'plan':
        moveCamera(new Vector3(0.001, midpoint + r * 6.5, 0.001), new Vector3(0, midpoint, 0));
        break;
      case 'elevation':
        moveCamera(new Vector3(0, midpoint, r * 6.0), new Vector3(0, midpoint, 0));
        break;
      case 'threeQuarter':
      default:
        moveCamera(
          new Vector3(r * 2.6, midpoint + r * 2.5, r * 4.0),
          new Vector3(0, midpoint, 0),
        );
        break;
    }
  };

  const focusNotch = (notch: Notch, wall: Wall): void => {
    const middle = (notch.sStart + notch.sEnd) / 2;
    const sample = wall.spiral.sampleAtArcLength(middle);

    // Look at the notch's own floor, from outside the wall and a little above
    // the crest, so the cut is seen into rather than edge-on. The distance
    // follows the local wall height, not the radius of the whole piece, so the
    // framing is the same on a small window as on a large one.
    const index = Math.min(
      wall.spiral.samples.length - 1,
      Math.max(0, Math.round((middle / wall.spiral.length) * (wall.spiral.samples.length - 1))),
    );
    const crest = wall.undisturbed[index];
    const floor = wall.top[index];
    const standoff = Math.max(crest * 2.4, 55);

    // On the revolved form the cut is a ring round the circumference, so the
    // camera looks level at it from outside rather than down into a slot: the
    // notch sits at its own height, and its floor is a radius, not a depth.
    const revolvedForm = wall.clock.revolved;
    const target = revolvedForm
      ? new Vector3(sample.x + sample.nx * floor, sample.z, -(sample.y + sample.ny * floor))
      : new Vector3(sample.x, floor * 0.9, -sample.y);
    const position = revolvedForm
      ? new Vector3(
          sample.x + sample.nx * (crest + standoff),
          sample.z + crest * 0.8,
          -(sample.y + sample.ny * (crest + standoff)),
        )
      : new Vector3(
          sample.x + sample.nx * standoff,
          crest * 1.5 + 10,
          -(sample.y + sample.ny * standoff),
        );
    moveCamera(position, target);
    lastInteraction = performance.now();
  };

  const capturePng = async (scale: number, transparent: boolean): Promise<Blob> => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const pixelRatio = renderer.getPixelRatio();
    const background = scene.background;

    renderer.setPixelRatio(scale);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    if (transparent) {
      scene.background = null;
      renderer.setClearAlpha(0);
    }
    composer.render();

    const blob = await new Promise<Blob>((resolveBlob, reject) => {
      canvas.toBlob((result) => (result ? resolveBlob(result) : reject(new Error('toBlob failed'))), 'image/png');
    });

    scene.background = background;
    renderer.setClearAlpha(1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    composer.render();
    return blob;
  };

  return {
    // Only read by the dev hook, for diagnosing what the camera is looking at.
    debug: () => ({
      camera: camera.position.toArray().map((v) => Math.round(v)),
      target: controls.target.toArray().map((v) => Math.round(v)),
      radius: currentRadius,
      aspect: camera.aspect,
      wallVisible: wallMesh.visible,
      bounds: wallGeometry.boundingSphere
        ? { c: wallGeometry.boundingSphere.center.toArray().map((v) => Math.round(v)), r: Math.round(wallGeometry.boundingSphere.radius) }
        : null,
      frames,
    }),
    setWall,
    setCursor,
    focusNotch,
    setView,
    setAutoRotate: (enabled) => {
      autoRotateWanted = enabled;
      if (!enabled) controls.autoRotate = false;
    },
    capturePng,
    resize,
    dispose: () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
