import {
  Box3,
  Color,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
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
import manifest, { type TextureInfo } from '@manifest';
import { createDaylight, DEFAULT_TIME } from './daylight';
import { commit as record, createHistory, redo as stepForward, undo as stepBack, type History } from './history';
import { createHud, DRAG_TYPE } from './hud';
import { accepts, ROOMS, SLOT_NAMES, type RoomKey, type Slot } from './room';
import { buildRoom, type BuiltRoom } from './rooms/index';
import { createSnow } from './snow';
import { fromHash, toHash, type RoomState } from './state';
import { createToolbar } from './toolbar';

// One per room, made the first time the room is needed. It keeps the room's textures, time, snow and undo
// history while another room shows (PRD 15.6).
type RoomSession = {
  built: BuiltRoom;
  latest: Partial<Record<Slot, string>>; // the last texture picked for each slot, even if it is still loading
  current: Partial<Record<Slot, TextureInfo>>; // the texture each slot shows
  history: History<RoomState>;
  time: number; // the room's time while another room shows
  snow: boolean;
  flakes?: ReturnType<typeof createSnow>; // the Garden only
  loads: Promise<unknown>[]; // the default textures and models, which the loader waits for
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const loader = document.getElementById('loader')!;
const gl = canvas.getContext('webgl2');

if (!gl) {
  canvas.remove();
  loader.remove();
  document.getElementById('no-webgl')!.style.display = 'block';
} else {
  const renderer = new WebGLRenderer({ canvas, context: gl });
  // Neutral keeps the textures' own colours: whites stay white and wood stays brown (ACES shifts them toward
  // orange, AgX greys them). It is a little darker than ACES, so the exposure keeps the v1 brightness.
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  // PCF with a shadow radius gives soft edges. PCFSoftShadowMap is deprecated in three.js 0.183 and falls back to it.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  // Neutral tone mapping darkens the darkest colours a lot, so this shows on screen as about #16161a, the page and
  // fade colour.
  scene.background = new Color('#313132');

  const sessions: Partial<Record<RoomKey, RoomSession>> = {};
  let active!: RoomSession;

  // Each room sets the camera's home view and limits. It stays above the plinth (PRD 6.6, 15.3).
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.3;

  // OrbitControls zooms in steps, so the wheel sets a target distance and the loop eases towards it.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const daylight = createDaylight(scene, renderer, reducedMotion, () => commit());
  const ease = reducedMotion ? 1 : 0.12;
  let distance = 0;
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const { minDistance, maxDistance } = active.built.view;
      distance = MathUtils.clamp(distance * Math.exp(event.deltaY * 0.001), minDistance, maxDistance);
    },
    { passive: false },
  );
  const resetView = () => {
    const { home } = active.built.view;
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

  let selected: Slot | null = null;
  const select = (slot: Slot | null) => {
    selected = slot;
    outline.selectedObjects = slot ? active.built.group.children.filter((mesh) => mesh.userData.slot === slot) : [];
    hud.setSelected(slot);
  };
  const hud = createHud({
    onSelect: select,
    onApply(texture) {
      if (!selected || !accepts(selected, texture.category)) return;
      applyTexture(active, selected, texture);
      commit();
    },
    onRoom: (key) => void showRoom(key),
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hitAt = (event: MouseEvent) => {
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(active.built.group)[0];
  };
  const slotAt = (event: MouseEvent): Slot | null => hitAt(event)?.object.userData.slot ?? null;

  const tooltip = document.getElementById('tooltip')!;
  const tooltipTitle = tooltip.firstElementChild!;
  canvas.addEventListener('pointermove', (event) => {
    const slot = event.buttons ? null : slotAt(event);
    canvas.style.cursor = slot ? 'pointer' : '';
    tooltip.hidden = !slot;
    if (!slot) return;
    tooltipTitle.textContent = `${SLOT_NAMES[slot]} · ${active.current[slot]?.name ?? 'No texture'}`;
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

  // Dropping a swatch on a surface applies it there. A surface that doesn't accept the category ignores it.
  canvas.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes(DRAG_TYPE)) event.preventDefault();
  });
  canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    const texture = manifest.textures.find((t) => t.slug === event.dataTransfer?.getData(DRAG_TYPE));
    const hit = hitAt(event);
    const slot: Slot | undefined = hit?.object.userData.slot;
    if (!texture || !hit || !slot || !accepts(slot, texture.category)) return;
    select(slot);
    applyTexture(active, slot, texture, hit.point);
    commit();
  });

  // Undo and redo (PRD 6.7, 15.6). Each room has its own history of its textures, time and snow.
  // The room shown is also kept in the URL hash, so the address is always a share link (PRD 6.8, 15.7).
  const snapshot = (session: RoomSession): RoomState => ({
    textures: { ...session.latest },
    time: session === active ? daylight.target() : session.time,
    snow: session.snow,
  });
  const save = () => {
    window.history.replaceState(null, '', toHash(active.built.key, active.history.committed));
    toolbar.setHistory(active.history.past.length > 0, active.history.future.length > 0);
  };
  const commit = () => {
    const { key } = active.built;
    if (record(active.history, snapshot(active), (state) => toHash(key, state))) save();
  };
  // ponytail: a slot can't go back to having no texture. A full manifest gives every slot a default.
  const restore = (state: RoomState | undefined) => {
    if (!state) return;
    for (const [slot, slug] of Object.entries(state.textures) as [Slot, string][]) {
      const texture = manifest.textures.find((t) => t.slug === slug);
      if (texture && slug !== active.latest[slot]) applyTexture(active, slot, texture);
    }
    daylight.setTime(state.time);
    active.snow = state.snow;
    showSnow();
    save();
  };
  // The switch shows in the Garden only. The flakes are in the scene only while the Garden shows with snow on.
  const snowButton = document.getElementById('snow')!;
  const showSnow = () => {
    for (const session of Object.values(sessions)) session.flakes?.set(session === active && session.snow);
    snowButton.hidden = !active.flakes;
    snowButton.setAttribute('aria-pressed', String(active.snow));
  };
  // On narrow screens the switch moves into the time row in the tray, as the time row itself does (PRD 9).
  const narrow = matchMedia('(max-width: 900px)');
  const placeSnow = () => (narrow.matches ? document.querySelector('.time')! : document.getElementById('daylight')!).append(snowButton);
  narrow.addEventListener('change', placeSnow);
  placeSnow();
  snowButton.addEventListener('click', () => {
    active.snow = !active.snow;
    showSnow();
    commit();
  });
  const undo = () => restore(stepBack(active.history));
  const redo = () => restore(stepForward(active.history));

  // Saves the view without the HUD or the selection outline, at the canvas size (PRD 6.9).
  const savePicture = () => {
    const outlined = outline.selectedObjects;
    outline.selectedObjects = [];
    composer.render();
    canvas.toBlob((blob) => {
      if (!blob) return toolbar.toast("Couldn't save the picture.");
      const link = document.createElement('a');
      const date = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      link.download = `asset-showroom-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toolbar.toast('Picture saved.');
    }, 'image/png');
    outline.selectedObjects = outlined;
  };

  const toolbar = createToolbar({
    undo,
    redo,
    save: savePicture,
    copy: () =>
      navigator.clipboard.writeText(location.href).then(
        () => toolbar.toast('Link copied. Anyone who opens it sees this room.'),
        () => toolbar.toast("Couldn't copy the link. Copy it from the address bar instead."),
      ),
  });

  // Keys (PRD 6.10). Esc also closes the help dialog, which the browser does itself.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return select(null);
    if (toolbar.help.open || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      return event.shiftKey ? redo() : undo();
    }
    if (event.ctrlKey || event.metaKey) return;
    if (event.key === 'r' || event.key === 'R') resetView();
    if (event.key === '[' || event.key === ']') {
      daylight.setTime(daylight.target() + (event.key === ']' ? 1 : -1));
      commit();
    }
    if (event.key === '/') {
      event.preventDefault();
      toolbar.toggleInterface();
    }
    if (event.key === '?') toolbar.toggleHelp();
  });
  // Editing the hash by hand loads that room.
  window.addEventListener('hashchange', () => location.reload());

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera);
  composer.addPass(gtao);
  // The Playwright tests read the camera and the room's materials, and switch GTAO off for steady screenshots.
  if (manifest.set === 'fixture') {
    Object.assign(window, { showroom: { camera, gtao, renderer, scene, materials: () => active.built.materials } });
  }
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
    // On screens narrower than 1.3:1, widen the view so the whole room still fits across.
    const tan = Math.tan(MathUtils.degToRad(20)) * Math.max(1, 1.3 / camera.aspect);
    camera.fov = MathUtils.radToDeg(2 * Math.atan(tan));
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // After the loader hides, time frames 30 to 150. Under 30 fps, turn GTAO off, the first step in PRD 10.
  // The count restarts if the tab is hidden, since hidden tabs get few frames.
  let frame = -1;
  let timedFrom = 0;
  document.addEventListener('visibilitychange', () => frame >= 0 && (frame = 0));
  const timeFrames = () => {
    if (frame < 0 || ++frame < 30) return;
    if (frame === 30) timedFrom = performance.now();
    if (frame < 150) return;
    if ((performance.now() - timedFrom) / 120 > 1000 / 30) {
      gtao.enabled = false;
      console.info('Asset Showroom: under 30 fps, so ambient occlusion (GTAO) is off.');
    }
    frame = -1;
  };

  renderer.setAnimationLoop(() => {
    timeFrames();
    const now = camera.position.distanceTo(controls.target);
    camera.position
      .sub(controls.target)
      .setLength(now + (distance - now) * ease)
      .add(controls.target);
    controls.update();
    daylight.update();
    active.flakes?.update(performance.now() / 1000);
    composer.render();
  });

  // Textures
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const loaded = new Map<string, Promise<Texture[]>>();
  const ready = new Set<string>();
  const progress = new Map<string, number>();
  const waiting = new Set<string>(); // slugs someone applied before they finished loading
  const load = ({ slug, sizeCm }: TextureInfo) => {
    if (!loaded.has(slug)) {
      const files = [0, 0, 0];
      const maps = ['color', 'normal', 'orm'].map((map, i) =>
        ktx2.loadAsync(`/textures/${slug}/${map}.ktx2`, (event) => {
          files[i] = event.total ? event.loaded / event.total : 0;
          progress.set(slug, (files[0] + files[1] + files[2]) / 3);
          if (waiting.has(slug)) hud.setProgress(slug, progress.get(slug)!);
        }),
      );
      loaded.set(
        slug,
        Promise.all(maps)
          .then((textures) => {
            for (const texture of textures) {
              texture.wrapS = texture.wrapT = RepeatWrapping;
              texture.repeat.set(100 / sizeCm[0], 100 / sizeCm[1]);
              texture.anisotropy = anisotropy;
              // The Playwright tests read which texture a material shows.
              if (manifest.set === 'fixture') texture.name = slug;
            }
            ready.add(slug);
            return textures;
          })
          .catch((error) => {
            // Forget the failed load so the next pick tries again.
            loaded.delete(slug);
            throw error;
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

  // Draws the new maps over the slot inside a sphere that grows from the drop point for 0.6 s (PRD 6.3 step 3).
  const spread = ({ built }: RoomSession, slot: Slot, maps: Texture[], center: Vector3) =>
    new Promise<void>((resolve) => {
      const meshes = built.group.children.filter((mesh): mesh is Mesh => mesh.userData.slot === slot);
      const bounds = new Box3();
      for (const mesh of meshes) bounds.expandByObject(mesh);
      const reach = new Vector3(
        Math.max(center.x - bounds.min.x, bounds.max.x - center.x),
        Math.max(center.y - bounds.min.y, bounds.max.y - center.y),
        Math.max(center.z - bounds.min.z, bounds.max.z - center.z),
      ).length();

      const radius = { value: 0 };
      // The clone keeps the slot's own shader patch, such as triplanar mapping on the rocks, under this one.
      const source = built.materials[slot]!;
      const material = source.clone();
      apply(material, maps);
      Object.assign(material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      material.customProgramCacheKey = () => `spread ${source.customProgramCacheKey()}`;
      material.onBeforeCompile = (shader, renderer) => {
        source.onBeforeCompile.call(material, shader, renderer);
        shader.uniforms.spreadCenter = { value: center };
        shader.uniforms.spreadRadius = radius;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vSpreadPosition;')
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvSpreadPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform vec3 spreadCenter;\nuniform float spreadRadius;\nvarying vec3 vSpreadPosition;',
          )
          .replace('void main() {', 'void main() {\n  if (distance(vSpreadPosition, spreadCenter) > spreadRadius) discard;');
      };
      const overlays = meshes.map((mesh) => {
        const overlay = new Mesh(mesh.geometry, material);
        overlay.applyMatrix4(mesh.matrix); // models placed as a surface keep their own position, turn and scale
        overlay.receiveShadow = true;
        overlay.raycast = () => {};
        return overlay;
      });
      built.group.add(...overlays);

      const start = performance.now();
      const step = () => {
        const t = Math.min((performance.now() - start) / 600, 1);
        radius.value = reach * (1 - (1 - t) ** 3);
        if (t < 1) return void requestAnimationFrame(step);
        built.group.remove(...overlays);
        material.dispose();
        resolve();
      };
      requestAnimationFrame(step);
    });

  // The last texture picked for a slot wins, even if an earlier one finishes loading later. A texture that
  // finishes after a room switch still lands on the room it was picked in.
  const applyTexture = async (session: RoomSession, slot: Slot, texture: TextureInfo, dropPoint?: Vector3) => {
    session.latest[slot] = texture.slug;
    // A texture that isn't loaded yet shows a progress ring on its swatch until it is (PRD 6.11 step 4).
    if (!ready.has(texture.slug)) {
      waiting.add(texture.slug);
      hud.setProgress(texture.slug, progress.get(texture.slug) ?? 0);
    }
    let maps: Texture[];
    try {
      maps = await load(texture);
    } catch (error) {
      console.error(error);
      // Point the slot back at what it shows, so the link and history match the room.
      if (session.latest[slot] === texture.slug) {
        session.latest[slot] = session.current[slot]?.slug;
        session.history.committed = snapshot(session);
        if (session === active) save();
      }
      toolbar.toast(`Couldn't load ${texture.name}. Try again.`);
      return;
    } finally {
      waiting.delete(texture.slug);
      hud.setProgress(texture.slug, null);
    }
    if (session.latest[slot] !== texture.slug) return;
    if (dropPoint && !reducedMotion && session === active) await spread(session, slot, maps, dropPoint);
    if (session.latest[slot] !== texture.slug) return;
    apply(session.built.materials[slot]!, maps);
    session.current[slot] = texture;
    if (session === active) hud.setTexture(slot, texture);
  };

  // A room opens with its defaults. The room in the link also takes the link's textures, time and snow
  // (PRD 6.8, 15.7).
  const link = fromHash(location.hash);
  const sessionFor = (key: RoomKey) => (sessions[key] ??= createSession(key));
  const createSession = (key: RoomKey) => {
    const fromLink = key === link.room;
    const built = buildRoom(key, ktx2);
    const time = fromLink ? (link.time ?? DEFAULT_TIME) : DEFAULT_TIME;
    const snow = fromLink && link.snow;
    const session: RoomSession = {
      built,
      latest: {},
      current: {},
      history: createHistory<RoomState>({ textures: {}, time, snow }), // replaced below, once the picks are in
      time,
      snow,
      loads: [built.models.then((failed) => failed.length && toolbar.toast("Couldn't load some decor. The room still works."))],
    };
    const picks = { ...(manifest.defaults[key] ?? {}), ...(fromLink ? link.textures : {}) };
    for (const [slot, slug] of Object.entries(picks) as [Slot, string][]) {
      const texture = manifest.textures.find((t) => t.slug === slug);
      if (texture && built.materials[slot]) session.loads.push(applyTexture(session, slot, texture));
    }
    // The flakes fall inside the garden's bounds, with the top 4 m higher.
    if (key === 'garden') {
      const area = new Box3().setFromObject(built.group);
      area.max.y += 4;
      session.flakes = createSnow(scene, area, reducedMotion);
    }
    session.history = createHistory(snapshot(session));
    return session;
  };

  // Shows a room: its group, home view, light, surfaces and link. A switch isn't an undo step.
  const swap = (key: RoomKey) => {
    const session = sessionFor(key);
    if (active) {
      active.time = daylight.target();
      scene.remove(active.built.group);
    }
    active = session;
    scene.add(session.built.group);
    const { view } = session.built;
    controls.target.copy(view.target);
    controls.minAzimuthAngle = view.minAzimuth;
    controls.maxAzimuthAngle = view.maxAzimuth;
    resetView();
    daylight.setRoom(session.built);
    daylight.setTime(session.time);
    select(null);
    hud.setRoom(key, session.current);
    showSnow();
    save();
  };

  // The room fades out and back in, 0.25 s each way (the same as #fade in hud.css). The last room clicked
  // wins, even while an earlier switch is still fading.
  const fade = document.getElementById('fade')!;
  let wanted = link.room;
  const showRoom = async (key: RoomKey) => {
    if (key === wanted) return;
    wanted = key;
    if (!reducedMotion) {
      fade.classList.add('on');
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (key !== wanted) return;
    }
    try {
      if (key !== active.built.key) swap(key);
    } finally {
      fade.classList.remove('on');
    }
  };

  swap(link.room);

  // The loader stays up until the transcoder, this room's textures and models, and all thumbnails are in.
  // Other rooms don't hold it up (PRD 6.11, 15.12).
  const tasks: Promise<unknown>[] = [ktx2.init(), ...active.loads, ...hud.thumbnails];
  let done = 0;
  const tick = () => (loader.textContent = `Loading the room… ${Math.round((++done / tasks.length) * 100)}%`);
  for (const task of tasks) task.then(tick, tick);
  Promise.allSettled(tasks).then(async () => {
    requestAnimationFrame(() => {
      loader.classList.add('done');
      frame = 0;
    });
    if (link.missing) toolbar.toast("Some textures in this link aren't available, so those surfaces show their defaults.");
    // Then, one texture at a time to leave bandwidth for a texture someone picks: the rest of this room's
    // textures, then each other room with its textures and models.
    const others = (Object.keys(ROOMS) as RoomKey[]).filter((key) => key !== link.room);
    for (const key of [link.room, ...others]) {
      for (const texture of manifest.textures) {
        if ((ROOMS[key].slots as Slot[]).some((slot) => accepts(slot, texture.category))) await load(texture).catch(() => {});
      }
      await Promise.allSettled(sessionFor(key).loads);
    }
  });
}
