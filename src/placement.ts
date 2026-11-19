import { Group, MathUtils, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuiltRoom } from './rooms/index';
import type { Library } from './uploads/library';
import type { Placement } from './uploads/types';

// Placed upload models (PRD 16.8). Each placement is a group in the room's group, at the placement's position and
// turn. The model goes in it once it has loaded.
export type Placed = { placement: Placement; object: Group };
type Session = { built: BuiltRoom; placed: Placed[] };

export const inside = (object: Object3D | null, parent: Object3D) => {
  for (; object; object = object.parent) if (object === parent) return true;
  return false;
};

// Where the ray first meets the room or its models, if that face points up (a floor, a table top, the deck).
// A wall or the sky gives null. skip is a model being dragged, so it doesn't land on itself.
export function surfaceAt(raycaster: Raycaster, room: Object3D, skip?: Object3D): Vector3 | null {
  const hit = raycaster.intersectObject(room).find((hit) => !skip || !inside(hit.object, skip));
  if (!hit?.face) return null;
  return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.7 ? hit.point : null;
}

// The upward surface under a point.
export const dropBelow = (point: Vector3, room: Object3D, skip?: Object3D) =>
  surfaceAt(new Raycaster(new Vector3(point.x, point.y + 2, point.z), new Vector3(0, -1, 0)), room, skip);

export const fallback = (room: BuiltRoom) => room.floorCentre.clone();

// Stored to 0.01 m, so the link and the scene agree. + 0 turns -0 into 0.
const round = (n: number) => Math.round(n * 100) / 100 + 0;

const UP = new Vector3(0, 1, 0);

export function createPlacements({
  camera,
  canvas,
  controls,
  library,
  active,
  onCommit,
  onSelect,
}: {
  camera: Camera;
  canvas: HTMLCanvasElement;
  controls: OrbitControls;
  library: Library;
  active: () => Session; // the room that shows
  onCommit: () => void;
  onSelect: (index: number | null) => void;
}) {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const aim = (event: PointerEvent) => {
    const { left, top, width, height } = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - left) / width) * 2 - 1, -((event.clientY - top) / height) * 2 + 1);
    camera.updateMatrixWorld(); // a slow frame may not have done it yet since the camera last moved
    raycaster.setFromCamera(pointer, camera);
    return raycaster;
  };
  const put = (object: Object3D, { x, y, z, turn }: Placement) => {
    object.position.set(x, y, z);
    object.rotation.y = MathUtils.degToRad(turn);
  };

  // The selected model in the room that shows, by its index in the room's list.
  let chosen: number | null = null;
  const select = (index: number | null) => {
    chosen = index;
    onSelect(index);
  };
  // The selected model, after a change to it.
  const change = (entry: Placed, placement: Placement) => {
    entry.placement = placement;
    put(entry.object, placement);
    onCommit();
  };
  // Only one model drag at a time, so a second finger can't start another or turn orbit back on early.
  let held = false;

  // Makes the room's placed models match the list. A model stays when its index and id still match, so undo,
  // redo and a link all use this. The list is in place at once; the promise settles when the new models are in.
  const sync = async (session: Session, list: Placement[]) => {
    const { group } = session.built;
    const old = session.placed;
    const loads: Promise<unknown>[] = [];
    session.placed = list.map((placement, i) => {
      const reuse = old[i]?.placement.id === placement.id ? old[i].object : null;
      const object = reuse ?? new Group();
      if (!reuse) {
        group.add(object);
        loads.push(library.loadModel(placement.id).then((model) => object.add(model), (error) => console.warn(error)));
      }
      put(object, placement);
      return { placement, object };
    });
    const kept = new Set(session.placed.map((p) => p.object));
    for (const { object } of old) if (!kept.has(object)) group.remove(object);
    await Promise.all(loads);
  };

  return {
    sync,
    select,
    selected: () => chosen,
    // Places a model at a point, selects it and makes one undo step.
    place(session: Session, id: string, at: Vector3) {
      void sync(session, [...session.placed.map((p) => p.placement), { id, x: round(at.x), y: round(at.y), z: round(at.z), turn: 0 }]);
      select(session.placed.length - 1);
      onCommit();
    },
    // Turns the selected model by 15° either way, kept from 0 to 345.
    turn(by: 15 | -15) {
      const entry = chosen === null ? null : active().placed[chosen];
      if (entry) change(entry, { ...entry.placement, turn: (entry.placement.turn + by + 360) % 360 });
    },
    // Moves the selected model in steps of 0.1 m: dx to the camera's right, dz towards the camera, both flat on the
    // ground. It stands on the upward surface below, and stays put if there is none.
    move(dx: number, dz: number) {
      const { built, placed } = active();
      const entry = chosen === null ? null : placed[chosen];
      if (!entry) return;
      const forward = camera.getWorldDirection(new Vector3()).setY(0).normalize();
      const right = new Vector3().crossVectors(forward, UP);
      const { x, y, z } = entry.placement;
      const at = dropBelow(new Vector3(x, y, z).addScaledVector(right, dx * 0.1).addScaledVector(forward, -dz * 0.1), built.group, entry.object);
      if (at) change(entry, { ...entry.placement, x: round(at.x), y: round(at.y), z: round(at.z) });
    },
    // Removes the selected model.
    remove() {
      const session = active();
      if (chosen === null) return;
      void sync(session, session.placed.filter((_, i) => i !== chosen).map((p) => p.placement));
      select(null);
      onCommit();
    },
    // The placed model under the pointer, if nothing is in front of it.
    hit(event: PointerEvent) {
      const { built, placed } = active();
      const object = aim(event).intersectObject(built.group)[0]?.object ?? null;
      const index = placed.findIndex((p) => inside(object, p.object));
      return index < 0 ? null : index;
    },
    // Moves a model with the pointer over upward surfaces. Orbit is off until the release. A press that moves
    // less than 5 px is a click and selects it. A drag that moved it is one undo step. Only the pointer that
    // pressed counts, so a second finger doesn't move the model or end the drag.
    startDrag(session: Session, index: number, event: PointerEvent) {
      if (held) return;
      held = true;
      const entry = session.placed[index];
      const start = entry.placement;
      let dragging = false;
      controls.enabled = false;
      const move = (moved: PointerEvent) => {
        if (moved.pointerId !== event.pointerId) return;
        dragging ||= Math.hypot(moved.clientX - event.clientX, moved.clientY - event.clientY) >= 5;
        const at = dragging && surfaceAt(aim(moved), session.built.group, entry.object);
        if (!at) return;
        entry.placement = { ...entry.placement, x: round(at.x), y: round(at.y), z: round(at.z) };
        put(entry.object, entry.placement);
      };
      const up = (released: PointerEvent) => {
        if (released.pointerId !== event.pointerId) return;
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        controls.enabled = true;
        held = false;
        if (!dragging) select(index);
        else if (entry.placement !== start) onCommit();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    },
  };
}
