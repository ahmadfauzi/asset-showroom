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
import manifest from '@manifest';
import { createDaylight, DEFAULT_TIME } from './daylight';
import { commit as record, createHistory, redo as stepForward, undo as stepBack, type History } from './history';
import { createHud, DRAG_TYPE } from './hud';
import { createPlacements, fallback, inside, surfaceAt, type Placed } from './placement';
import { accepts, fits, ROOMS, SLOT_NAMES, type RoomKey, type Slot } from './room';
import { buildRoom, type BuiltRoom } from './rooms/index';
import { createSnow } from './snow';
import { fromHash, toHash, type RoomState } from './state';
import { createToolbar } from './toolbar';
import { createLibrary } from './uploads/library';
import { createUploadsTab, MODEL_DRAG_TYPE } from './uploads/tab';
import { LIMITS, MESSAGES, type AnyTexture, type Sky, type UploadMeta } from './uploads/types';
import { createUploader } from './uploads/uploader';

// One per room, made the first time the room is needed. It keeps the room's textures, time, snow and undo
// history while another room shows (PRD 15.6).
type RoomSession = {
  built: BuiltRoom;
  latest: Partial<Record<Slot, string>>; // the last texture picked for each slot, even if it is still loading
  current: Partial<Record<Slot, AnyTexture>>; // the texture each slot shows
  history: History<RoomState>;
  time: number; // the room's time while another room shows
  snow: boolean;
  flakes?: ReturnType<typeof createSnow>; // the Garden only
  loads: Promise<unknown>[]; // the default textures and models, which the loader waits for
  placed: Placed[]; // uploaded models, in placing order (PRD 16.8)
  sky: Sky; // the Garden only (PRD 16.9)
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const loader = document.getElementById('loader')!;
const gl = canvas.getContext('webgl2');

if (!gl) {
  canvas.remove();
  loader.remove();
  document.getElementById('no-webgl')!.style.display = 'block';
} else {
  // The uploads in this browser are read before the link, so the link can use their ids (PRD 16.10).
  const library = await createLibrary();
  // A bundled texture or an uploaded one (u-xxxxxxxx).
  const findTexture = (slug: string): AnyTexture | undefined => manifest.textures.find((t) => t.slug === slug) ?? library.texture(slug);
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
  // The Turn sky slider only changes the daylight's turn, so it is copied to the room here.
  const daylight = createDaylight(scene, renderer, reducedMotion, () => {
    if (active.sky) active.sky = { ...active.sky, turn: daylight.skyTurn() };
    commit();
  });
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

  // A surface or a placed model can be selected, not both. Selecting a surface, or none, clears the model.
  let selected: Slot | null = null;
  const select = (slot: Slot | null) => {
    selected = slot;
    hud.setSelected(slot);
    placements.select(null);
  };
  // Each model is named after its upload, counted from 1 in this room: "PlantOrchid001 2" (PRD 16.8).
  const modelNames = () => {
    const counts = new Map<string, number>();
    return active.placed.map(({ placement: { id } }) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return `${library.get(id)?.name ?? id} ${counts.get(id)}`;
    });
  };
  const showSelection = () => {
    const model = placements.selected();
    outline.selectedObjects = selected
      ? active.built.group.children.filter((mesh) => mesh.userData.slot === selected)
      : model === null ? [] : [active.placed[model].object];
    hud.setModels(modelNames(), model);
  };
  const use = (texture: AnyTexture) => {
    if (!selected || !fits(selected, texture)) return;
    applyTexture(active, selected, texture);
    commit();
  };
  const hud = createHud({
    onSelect: select,
    onApply: use,
    onSize: (id, sizeCm) => void library.setSize(id, sizeCm),
    onRoom: (key) => void showRoom(key),
    onModel: (index) => placements.select(index),
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  // A ray through a point on the canvas, from -1 to 1 across and up.
  const aim = (x: number, y: number) => {
    pointer.set(x, y);
    camera.updateMatrixWorld(); // a slow frame may not have done it yet since the camera last moved
    raycaster.setFromCamera(pointer, camera);
    return raycaster;
  };
  const rayAt = (event: MouseEvent) => aim((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  const hitAt = (event: MouseEvent) => rayAt(event).intersectObject(active.built.group)[0];
  const slotAt = (event: MouseEvent): Slot | null => hitAt(event)?.object.userData.slot ?? null;

  const tooltip = document.getElementById('tooltip')!;
  const tooltipTitle = tooltip.firstElementChild!;
  const tooltipHint = tooltip.lastElementChild as HTMLElement;
  canvas.addEventListener('pointermove', (event) => {
    const object = event.buttons ? null : (hitAt(event)?.object ?? null);
    const model = active.placed.find((p) => inside(object, p.object));
    const slot: Slot | null = object?.userData.slot ?? null;
    canvas.style.cursor = model ? 'grab' : slot ? 'pointer' : '';
    tooltip.hidden = !model && !slot;
    if (tooltip.hidden) return;
    tooltipTitle.textContent = model
      ? `${library.get(model.placement.id)?.name ?? model.placement.id} · drag to move`
      : `${SLOT_NAMES[slot!]} · ${active.current[slot!]?.name ?? 'No texture'}`;
    tooltipHint.hidden = !!model;
    const x = Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8);
    const y = Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  });
  canvas.addEventListener('pointerleave', () => (tooltip.hidden = true));

  // Placed models (PRD 16.8). A new model shows on the surface the ray meets, or in the middle of the floor.
  const placements = createPlacements({
    camera,
    canvas,
    controls,
    library,
    active: () => active,
    onCommit: () => commit(),
    onSelect(index) {
      if (index !== null && selected) {
        selected = null;
        hud.setSelected(null);
      }
      showSelection();
    },
  });
  const placeModel = (id: string, ray: Raycaster) => {
    if (library.get(id)?.kind !== 'model') return;
    if (active.placed.length >= LIMITS.modelsPerRoom) return toolbar.toast(MESSAGES.cap);
    placements.place(active, id, surfaceAt(ray, active.built.group) ?? fallback(active.built));
  };

  // A click is a press and release less than 5 px apart, so orbit drags don't change the selection.
  // Pressing on a placed model drags it instead. This runs before orbit's own listener, so orbit never starts.
  let pressedAt: [number, number] | null = null;
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const index = placements.hit(event);
      pressedAt = index === null ? [event.clientX, event.clientY] : null;
      if (index !== null) placements.startDrag(active, index, event);
    },
    { capture: true },
  );
  canvas.addEventListener('pointerup', (event) => {
    if (pressedAt && Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]) < 5) select(slotAt(event));
    pressedAt = null;
  });

  // Dropping a swatch on a surface applies it there. A surface that doesn't accept the category ignores it.
  // A model swatch dropped on the room places that model.
  canvas.addEventListener('dragover', (event) => {
    const types = event.dataTransfer?.types ?? [];
    if (types.includes(DRAG_TYPE) || types.includes(MODEL_DRAG_TYPE)) event.preventDefault();
  });
  canvas.addEventListener('drop', (event) => {
    event.preventDefault();
    const model = event.dataTransfer?.getData(MODEL_DRAG_TYPE);
    if (model) return placeModel(model, rayAt(event));
    const texture = findTexture(event.dataTransfer?.getData(DRAG_TYPE) ?? '');
    const hit = hitAt(event);
    const slot: Slot | undefined = hit?.object.userData.slot;
    if (!texture || !hit || !slot || !fits(slot, texture)) return;
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
    models: session.placed.map((p) => p.placement),
    sky: session.sky,
  });
  // A saved state without the uploads deleted since (PRD 16.6): their surfaces take the room's default.
  const clean = (saved: RoomState): RoomState => {
    const ids = library.ids();
    const defaults = manifest.defaults[active.built.key] ?? {};
    const textures = { ...saved.textures };
    for (const [slot, slug] of Object.entries(textures) as [Slot, string][]) if (!findTexture(slug)) textures[slot] = defaults[slot];
    return {
      ...saved,
      textures,
      models: saved.models.filter((m) => ids.has(m.id)),
      sky: saved.sky && ids.has(saved.sky.id) ? saved.sky : null,
    };
  };
  const save = () => {
    const { key } = active.built;
    const { past, committed, future } = active.history;
    const now = toHash(key, committed);
    window.history.replaceState(null, '', now);
    // Undo and redo are on only while a step would change the room (see step).
    const changes = (state: RoomState) => toHash(key, clean(state)) !== now;
    toolbar.setHistory(past.some(changes), future.some(changes));
  };
  const commit = () => {
    const { key } = active.built;
    if (record(active.history, snapshot(active), (state) => toHash(key, state))) save();
  };
  // ponytail: a slot can't go back to having no texture. A full manifest gives every slot a default.
  const restore = (state: RoomState) => {
    for (const [slot, slug] of Object.entries(state.textures) as [Slot, string][]) {
      const texture = findTexture(slug);
      if (texture && slug !== active.latest[slot] && fits(slot, texture)) applyTexture(active, slot, texture);
    }
    void placements.sync(active, state.models);
    // The selected model stays selected while it is still in the list.
    const model = placements.selected();
    placements.select(model !== null && active.placed[model] ? model : null);
    daylight.setTime(state.time);
    active.sky = state.sky;
    showSky(active);
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
  // Shows the room's sky. An HDRI shows once it is read from the store, if it is still the sky of the room that
  // shows (PRD 16.9). If it can't be read, the room goes back to the drawn sky, as a texture does to its last one.
  const showSky = (session: RoomSession) => {
    const { sky } = session;
    if (!sky) return daylight.setSky(null);
    daylight.setSkyTurn(sky.turn);
    library.loadSky(sky.id).then(
      (loaded) => session === active && session.sky?.id === sky.id && daylight.setSky({ ...loaded, turn: session.sky.turn }),
      (error) => {
        console.error(error);
        if (session.sky?.id !== sky.id) return;
        session.sky = null;
        session.history.committed = snapshot(session);
        if (session !== active) return;
        daylight.setSky(null);
        save();
        toolbar.toast(`Couldn't load ${library.get(sky.id)?.name ?? 'the sky'}. Try again.`);
      },
    );
  };
  // Back to the drawn sky and the clock. The button hides, so focus moves to the time slider.
  document.getElementById('time-of-day')!.addEventListener('click', () => {
    active.sky = null;
    showSky(active);
    commit();
    document.querySelector<HTMLInputElement>('.time input')!.focus();
  });
  // Undo and redo. A step that changes nothing once deleted uploads are taken out is skipped, so each press
  // changes the room (PRD 16.6). The cleaned states replace the saved ones.
  const step = (move: (history: History<RoomState>) => RoomState | undefined) => {
    const { key } = active.built;
    const now = toHash(key, active.history.committed);
    for (let saved = move(active.history); saved; saved = move(active.history)) {
      const state = (active.history.committed = clean(saved));
      if (toHash(key, state) !== now) return restore(state);
    }
    save();
  };
  const undo = () => step(stepBack);
  const redo = () => step(stepForward);

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
        () => toolbar.toast(/=u-/.test(location.hash) ? 'Link copied. Uploads only show in this browser.' : 'Link copied. Anyone who opens it sees this room.'),
        () => toolbar.toast("Couldn't copy the link. Copy it from the address bar instead."),
      ),
    upload: () => uploader.pick(),
  });

  // Uploads (PRD 16.3, 16.6).
  const uploadsTab = createUploadsTab({
    thumb: library.thumb,
    onUse(meta) {
      if (meta.kind === 'model') return placeModel(meta.id, aim(0, 0));
      // Sky swatches only work in the Garden, where the tab enables them.
      if (meta.kind === 'hdri') {
        active.sky = { id: meta.id, turn: 0 };
        showSky(active);
        return commit();
      }
      const texture = library.texture(meta.id);
      if (texture) use(texture);
    },
    onDelete(meta) {
      const rooms = usage(meta.id);
      const n = rooms.length;
      if (!confirm(n ? `Used in ${n} room${n > 1 ? 's' : ''}. Delete it?` : `Delete ${meta.name}?`)) return;
      library.remove(meta.id).then(
        async () => {
          uploadsTab.setUploads(library.list());
          await Promise.all(rooms.map((key) => forget(sessions[key]!, meta.id)));
          release(meta);
        },
        () => toolbar.toast(`Couldn't delete ${meta.name}. Try again.`),
      );
    },
  });
  // The rooms that use an upload on a surface, in a placement or as the sky.
  const usage = (id: string) =>
    (Object.keys(sessions) as RoomKey[]).filter((key) => {
      const { latest, current, placed, sky } = sessions[key]!;
      return (
        Object.values(latest).includes(id) ||
        Object.values(current).some((texture) => texture?.slug === id) ||
        placed.some((p) => p.placement.id === id) ||
        sky?.id === id
      );
    });
  // Takes a deleted upload out of a room: surfaces go back to the room's defaults, its placements go and the sky goes
  // back to the drawn one. It isn't an undo step (PRD 16.6). Settles once the defaults show.
  const forget = (session: RoomSession, id: string) => {
    const defaults = manifest.defaults[session.built.key] ?? {};
    const resets = (Object.entries(defaults) as [Slot, string][])
      .filter(([slot]) => session.latest[slot] === id || session.current[slot]?.slug === id)
      .map(([slot, slug]) => applyTexture(session, slot, findTexture(slug)!));
    const models = session.placed.filter((p) => p.placement.id !== id).map((p) => p.placement);
    const removed = models.length < session.placed.length;
    void placements.sync(session, models);
    const sky = session.sky?.id === id;
    if (sky) session.sky = null;
    session.history.committed = snapshot(session);
    if (session === active) {
      if (removed) placements.select(null); // the selected model's index may have changed
      if (sky) showSky(session);
      save();
    }
    return Promise.all(resets);
  };
  uploadsTab.setUploads(library.list());
  const uploader = createUploader({ library, tab: uploadsTab, toolbar, renderer, onAdded: () => {} });

  // The selected model's bar sits above the model on screen, inside the window (PRD 16.8). On narrow screens the
  // tray runs across the bottom, so the bar stays above it.
  const bar = document.getElementById('model-bar')!;
  const tray = document.getElementById('tray')!;
  for (const button of bar.querySelectorAll<HTMLButtonElement>('[data-turn]')) {
    button.addEventListener('click', () => placements.turn(Number(button.dataset.turn) as 15 | -15));
  }
  bar.querySelector('[data-action="remove"]')!.addEventListener('click', () => placements.remove());
  const bounds = new Box3();
  const corner = new Vector3();
  let barSize = [0, 0]; // read when the bar shows, not every frame
  const placeBar = () => {
    const model = placements.selected();
    if (model === null) return void (bar.hidden = true);
    if (bar.hidden) {
      bar.hidden = false;
      barSize = [bar.offsetWidth, bar.offsetHeight];
    }
    const [width, height] = barSize;
    // A model that is still loading has no size, so its own position stands in.
    const { object } = active.placed[model];
    bounds.setFromObject(object).expandByPoint(object.getWorldPosition(corner));
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(camera);
      const x = ((corner.x + 1) / 2) * innerWidth;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, ((1 - corner.y) / 2) * innerHeight);
    }
    const bottom = narrow.matches ? tray.getBoundingClientRect().top : innerHeight;
    const x = MathUtils.clamp((left + right) / 2 - width / 2, 8, innerWidth - width - 8);
    const y = MathUtils.clamp(top - height - 8, 8, bottom - height - 8);
    bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  // Keys for the selected model (PRD 16.8): [right, towards the camera] in steps of 0.1 m.
  const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  // Keys (PRD 6.10). Esc also closes the help dialog, which the browser does itself.
  window.addEventListener('keydown', (event) => {
    // Keys typed in a field, such as an uploaded texture's size, stay in the field. The time slider isn't one.
    if ((event.target as Element).closest?.('input:not([type=range]),textarea,select,[contenteditable]')) return;
    if (event.key === 'Escape') return select(null);
    if (toolbar.help.open || event.altKey) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      return event.shiftKey ? redo() : undo();
    }
    if (event.ctrlKey || event.metaKey) return;
    // Not while focus is in the time slider, which uses the arrows itself.
    if (placements.selected() !== null && !(event.target as Element).closest?.('input')) {
      const key = event.key.toLowerCase();
      if (ARROWS[event.key]) {
        event.preventDefault();
        placements.move(...ARROWS[event.key]);
      }
      if (key === 'q' || key === 'e') placements.turn(key === 'e' ? 15 : -15);
      if (event.key === 'Delete' || event.key === 'Backspace') placements.remove();
    }
    if (event.key === 'r' || event.key === 'R') resetView();
    // The HDRI sets the light, so there is no time to move (PRD 16.9).
    if ((event.key === '[' || event.key === ']') && !active.sky) {
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
    Object.assign(window, {
      showroom: { camera, gtao, renderer, scene, materials: () => active.built.materials, placed: () => active.placed.map((p) => p.placement) },
    });
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
  // The count restarts if the tab is hidden, since hidden tabs get few frames, and when another room shows.
  let frame = -1;
  let loaderDone = false;
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
    placeBar();
    composer.render();
  });

  // Textures
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const loaded = new Map<string, Promise<Texture[]>>();
  const ready = new Set<string>();
  const progress = new Map<string, number>();
  const waiting = new Set<string>(); // slugs someone applied before they finished loading
  // Uploaded maps come from the library, which sets their wrapping and size.
  const load = (texture: AnyTexture) => {
    const { slug, sizeCm } = texture;
    if (!loaded.has(slug)) {
      const files = [0, 0, 0];
      const maps =
        'uploaded' in texture
          ? library.loadTexture(slug)
          : Promise.all(
              ['color', 'normal', 'orm'].map((map, i) =>
                ktx2.loadAsync(`/textures/${slug}/${map}.ktx2`, (event) => {
                  files[i] = event.total ? event.loaded / event.total : 0;
                  progress.set(slug, (files[0] + files[1] + files[2]) / 3);
                  if (waiting.has(slug)) hud.setProgress(slug, progress.get(slug)!);
                }),
              ),
            ).then((textures) => {
              for (const map of textures) {
                map.wrapS = map.wrapT = RepeatWrapping;
                map.repeat.set(100 / sizeCm[0], 100 / sizeCm[1]);
              }
              return textures;
            });
      loaded.set(
        slug,
        maps
          .then((textures) => {
            for (const texture of textures) {
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
  // Frees what a deleted upload still holds, once no room shows it (PRD 16.6).
  const release = ({ id, kind }: UploadMeta) => {
    const maps = loaded.get(id);
    loaded.delete(id);
    progress.delete(id);
    // A load still running is freed when it ends.
    maps?.then(
      (textures) => {
        ready.delete(id);
        for (const texture of textures) texture.dispose();
      },
      () => {},
    );
    library.release(id);
    if (kind === 'hdri') daylight.dropSky();
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
  const applyTexture = async (session: RoomSession, slot: Slot, texture: AnyTexture, dropPoint?: Vector3) => {
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
      if (session === active) toolbar.toast(`Couldn't load ${texture.name}. Try again.`);
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
  const link = fromHash(location.hash, library.ids());
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
      history: createHistory<RoomState>({ textures: {}, time, snow, models: [], sky: null }), // replaced below, once the picks are in
      time,
      snow,
      // The link's sky, if it is an HDRI in this browser. The loader waits for it (PRD 16.11).
      sky: fromLink && link.sky && library.get(link.sky.id)?.kind === 'hdri' ? link.sky : null,
      loads: [built.models.then((failed) => failed.length && session === active && toolbar.toast("Couldn't load some decor. The room still works."))],
      placed: [],
    };
    // The link's models, if they are uploaded models in this browser (PRD 16.10).
    if (fromLink) session.loads.push(placements.sync(session, link.models.filter((m) => library.get(m.id)?.kind === 'model')));
    if (session.sky) session.loads.push(library.loadSky(session.sky.id));
    const picks = { ...(manifest.defaults[key] ?? {}), ...(fromLink ? link.textures : {}) };
    for (const [slot, slug] of Object.entries(picks) as [Slot, string][]) {
      const texture = findTexture(slug);
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
    showSky(session);
    // After setRoom, which empties the slot panel, so the room's models are listed again.
    hud.setRoom(key, session.current);
    select(null);
    uploadsTab.setRoom(key);
    showSnow();
    save();
    if (loaderDone && gtao.enabled) frame = 0;
  };

  // The room fades out and back in, 0.25 s each way (the same as #fade in hud.css). The last room clicked
  // wins, even while an earlier switch is still fading. Clicking the room that shows during a fade cancels the
  // switch: the fade goes back and nothing swaps.
  const fade = document.getElementById('fade')!;
  let wanted = link.room;
  const showRoom = async (key: RoomKey) => {
    if (key === wanted) return;
    wanted = key;
    if (key === active.built.key) return void fade.classList.remove('on');
    if (!reducedMotion) {
      fade.classList.add('on');
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (key !== wanted) return;
    }
    try {
      if (key !== active.built.key) swap(key);
    } catch (error) {
      console.error(error);
      wanted = active.built.key;
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
      loaderDone = true;
      frame = 0;
    });
    // Only one toast: the uploads one wins (PRD 16.10).
    if (link.uploadsMissing) toolbar.toast("This link uses uploads that are only on the sender's computer, so you see the defaults.");
    else if (link.missing) toolbar.toast("Some textures in this link aren't available, so those surfaces show their defaults.");
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
