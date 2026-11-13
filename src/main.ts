import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  RepeatWrapping,
  Scene,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import manifest from '@manifest';
import { buildRoom, SLOT_NAMES, type Slot } from './room';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const loader = document.getElementById('loader')!;
const gl = canvas.getContext('webgl2');

if (!gl) {
  canvas.remove();
  loader.remove();
  document.getElementById('no-webgl')!.style.display = 'block';
} else {
  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.background = new Color('#16161a');
  const { group, materials } = buildRoom();
  scene.add(group);

  scene.add(new HemisphereLight('#dde6f2', '#5a4f45', 1.2));
  const sun = new DirectionalLight('#fff3e0', 3);
  sun.position.set(6, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Camera stays on the open front and right sides, above the plinth (PRD 6.6).
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  const home = new Vector3(9, 8.5, 11);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.3;
  controls.minAzimuthAngle = -0.2;
  controls.maxAzimuthAngle = Math.PI / 2 + 0.2;

  // OrbitControls zooms in steps, so the wheel sets a target distance and the loop eases towards it.
  const ease = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.12;
  let distance = home.distanceTo(controls.target);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      distance = MathUtils.clamp(distance * Math.exp(event.deltaY * 0.001), 7, 22);
    },
    { passive: false },
  );
  const resetView = () => {
    // An update without damping drops any orbit momentum left from the last drag.
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(home);
    controls.update();
    controls.enableDamping = true;
    distance = home.distanceTo(controls.target);
  };

  // Slots: hovering shows a tooltip, clicking selects the slot and outlines it (PRD 6.3).
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const outline = new OutlinePass(new Vector2(), scene, camera);
  outline.visibleEdgeColor.set(accent);
  outline.hiddenEdgeColor.set(accent).multiplyScalar(0.3);
  outline.edgeStrength = 4;
  outline.edgeThickness = 1;
  const select = (slot: Slot | null) => {
    outline.selectedObjects = slot ? group.children.filter((mesh) => mesh.userData.slot === slot) : [];
  };

  const current: Partial<Record<Slot, string>> = {};
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const slotAt = (event: PointerEvent): Slot | null => {
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(group)[0]?.object.userData.slot ?? null;
  };

  const tooltip = document.getElementById('tooltip')!;
  const tooltipTitle = tooltip.firstElementChild!;
  canvas.addEventListener('pointermove', (event) => {
    const slot = event.buttons ? null : slotAt(event);
    canvas.style.cursor = slot ? 'pointer' : '';
    tooltip.hidden = !slot;
    if (!slot) return;
    tooltipTitle.textContent = `${SLOT_NAMES[slot]} · ${current[slot] ?? 'No texture'}`;
    const x = Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8);
    const y = Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  });
  canvas.addEventListener('pointerleave', () => (tooltip.hidden = true));

  // A click is a press and release less than 5 px apart, so orbit drags don't change the selection.
  let pressedAt: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (event) => (pressedAt = [event.clientX, event.clientY]));
  canvas.addEventListener('pointerup', (event) => {
    if (pressedAt && Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]) < 5) select(slotAt(event));
    pressedAt = null;
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') select(null);
    if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) resetView();
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new GTAOPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new Vector2(), 0.2, 0.4, 0.9));
  composer.addPass(outline);
  composer.addPass(new SMAAPass());
  composer.addPass(new OutputPass());

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop(() => {
    const current = camera.position.distanceTo(controls.target);
    camera.position
      .sub(controls.target)
      .setLength(current + (distance - current) * ease)
      .add(controls.target);
    controls.update();
    composer.render();
  });

  // Default room textures. The loader stays up until they are on screen (PRD 6.11).
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const loaded = new Map<string, Promise<Texture[]>>();
  const load = ({ slug, sizeCm }: (typeof manifest.textures)[number]) => {
    if (!loaded.has(slug)) {
      const maps = ['color', 'normal', 'orm'].map((map) => ktx2.loadAsync(`/textures/${slug}/${map}.ktx2`));
      loaded.set(
        slug,
        Promise.all(maps).then((textures) => {
          for (const texture of textures) {
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.set(100 / sizeCm[0], 100 / sizeCm[1]);
            texture.anisotropy = anisotropy;
          }
          return textures;
        }),
      );
    }
    return loaded.get(slug)!;
  };
  const apply = (material: MeshStandardMaterial, [color, normal, orm]: Texture[]) => {
    Object.assign(material, { map: color, normalMap: normal, aoMap: orm, roughnessMap: orm, metalnessMap: orm });
    material.color.set('#fff');
    material.roughness = material.metalness = 1;
    material.needsUpdate = true;
  };

  const defaults = Object.entries(manifest.defaults).flatMap(([slot, slug]) => {
    const texture = manifest.textures.find((t) => t.slug === slug);
    if (!texture || !(slot in materials)) return [];
    return [
      load(texture).then((maps) => {
        apply(materials[slot as Slot], maps);
        current[slot as Slot] = texture.name;
      }),
    ];
  });
  Promise.allSettled(defaults).then((results) => {
    for (const result of results) if (result.status === 'rejected') console.error(result.reason);
    requestAnimationFrame(() => loader.classList.add('done'));
  });
}
