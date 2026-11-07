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
import { buildNotchOverlay, buildWallMesh, type Wall } from '../geom/wall.js';
import type { Notch } from '../geom/notches.js';

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
  setCursor(position: { x: number; y: number; height: number } | null): void;
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
  camera.position.set(300, 350, 470);

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
  let currentRadius = 160;

  const setWall = (wall: Wall, params: Params): void => {
    const mesh = buildWallMesh(wall, params);
    wallGeometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    wallGeometry.setIndex(new BufferAttribute(mesh.indices, 1));
    wallGeometry.computeVertexNormals();
    wallGeometry.computeBoundingSphere();

    const overlay = buildNotchOverlay(wall, params);
    notchGeometry.setAttribute('position', new BufferAttribute(overlay.positions, 3));
    notchGeometry.setIndex(new BufferAttribute(overlay.indices, 1));
    notchGeometry.computeBoundingSphere();

    currentRadius = params.r1 + params.wallThickness;
    const span = Math.max(currentRadius * 2.6, 240);
    key.shadow.camera.left = -span;
    key.shadow.camera.right = span;
    key.shadow.camera.top = span;
    key.shadow.camera.bottom = -span;
    key.shadow.camera.updateProjectionMatrix();
    key.position.set(-currentRadius * 1.8, currentRadius * 3, currentRadius * 1.7);
  };

  const setCursor = (position: { x: number; y: number; height: number } | null): void => {
    if (!position) {
      cursorMesh.visible = false;
      return;
    }
    // A thin blade standing on the wall at the cursor, 12 mm above the crest.
    const half = 0.5;
    const top = position.height + 12;
    const x = position.x;
    const z = -position.y;
    const positions = new Float32Array([
      x - half, 0, z - half,
      x + half, 0, z + half,
      x + half, top, z + half,
      x - half, 0, z - half,
      x + half, top, z + half,
      x - half, top, z - half,
      x - half, 0, z + half,
      x + half, 0, z - half,
      x + half, top, z - half,
      x - half, 0, z + half,
      x + half, top, z - half,
      x - half, top, z + half,
    ]);
    cursorGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    cursorGeometry.setIndex(null);
    cursorGeometry.computeBoundingSphere();
    cursorMesh.visible = true;
  };

  const setView = (preset: ViewPreset): void => {
    // The camera's field of view is vertical, so on a portrait window the piece
    // has to be further away to fit across the narrow axis.
    const r = currentRadius * Math.max(1, 1 / Math.max(camera.aspect, 0.2));
    switch (preset) {
      case 'plan':
        moveCamera(new Vector3(0.001, r * 4.2, 0.001), new Vector3(0, 0, 0));
        break;
      case 'elevation':
        moveCamera(new Vector3(0, r * 0.35, r * 4.0), new Vector3(0, r * 0.2, 0));
        break;
      case 'threeQuarter':
      default:
        moveCamera(new Vector3(r * 1.7, r * 2.0, r * 2.6), new Vector3(0, r * 0.1, 0));
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

    const target = new Vector3(sample.x, floor * 0.9, -sample.y);
    const position = new Vector3(
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
