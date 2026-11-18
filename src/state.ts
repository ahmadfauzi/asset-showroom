import manifest from '@manifest';
import { accepts, isRoom, ROOMS, type RoomKey, type Slot } from './room';
import { LIMITS } from './uploads/detect';
import type { Placement, Sky } from './uploads/types';

export type RoomState = { textures: Partial<Record<Slot, string>>; time: number; snow: boolean; models: Placement[]; sky: Sky };

const UPLOAD_ID = /^u-[0-9a-f]{8}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

// Share link format (PRD 15.7): #v=2&room=garden&ground=grass&t=18.5&snow=1
// Only the room's own slots are saved, in the order of rooms.json. Then one m=id,x,y,z,turn per placed model,
// then t. snow=1 and sky=id&sr=turn are only written in the Garden.
export function toHash(room: RoomKey, state: RoomState) {
  const params = new URLSearchParams({ v: '2', room });
  for (const slot of ROOMS[room].slots as Slot[]) {
    const slug = state.textures[slot];
    if (slug) params.set(slot, slug);
  }
  for (const { id, x, y, z, turn } of state.models) params.append('m', [id, x.toFixed(2), y.toFixed(2), z.toFixed(2), turn].join(','));
  params.set('t', String(state.time));
  if (room === 'garden' && state.snow) params.set('snow', '1');
  if (room === 'garden' && state.sky) {
    params.set('sky', state.sky.id);
    params.set('sr', String(state.sky.turn));
  }
  return `#${params}`;
}

// Reads a share link, v2 or v1 (v1 is always the Living room). An unknown room counts as the Living room.
// Slugs that aren't in this set are counted in `missing`. Upload ids (u-xxxxxxxx) that aren't in `uploads` are counted
// in `uploadsMissing` instead. Anything else that doesn't fit, such as another version, a slot the room doesn't have,
// a texture on a slot that doesn't accept it, a time outside 6 to 22, or a model outside ±50 m, is ignored.
export function fromHash(hash: string, uploads: ReadonlySet<string> = new Set()) {
  const link: {
    room: RoomKey;
    textures: Partial<Record<Slot, string>>;
    time?: number;
    snow: boolean;
    missing: number;
    models: Placement[];
    sky: Sky;
    uploadsMissing: number;
  } = { room: 'living', textures: {}, snow: false, missing: 0, models: [], sky: null, uploadsMissing: 0 };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const version = params.get('v');
  if (version !== '1' && version !== '2') return link;
  const room = params.get('room') ?? '';
  if (version === '2' && isRoom(room)) link.room = room;

  for (const slot of ROOMS[link.room].slots as Slot[]) {
    const slug = params.get(slot);
    if (!slug) continue;
    if (UPLOAD_ID.test(slug)) {
      if (uploads.has(slug)) link.textures[slot] = slug;
      else link.uploadsMissing++;
      continue;
    }
    const texture = manifest.textures.find((t) => t.slug === slug);
    if (!texture) link.missing++;
    else if (accepts(slot, texture.category)) link.textures[slot] = slug;
  }

  // A bad m is dropped. The first 10 good ones count, whether or not the upload is still here.
  let good = 0;
  for (const value of params.getAll('m')) {
    const [id, ...rest] = value.split(',');
    if (good >= LIMITS.modelsPerRoom) break;
    if (!UPLOAD_ID.test(id) || rest.length !== 4 || !rest.every((n) => NUMBER.test(n))) continue;
    const [x, y, z, turn] = rest.map(Number);
    if ([x, y, z].some((n) => Math.abs(n) > 50) || turn % 15 !== 0 || turn < 0 || turn > 345) continue;
    good++;
    if (uploads.has(id)) link.models.push({ id, x, y, z, turn });
    else link.uploadsMissing++;
  }

  // The sky only exists in the Garden.
  const sky = params.get('sky');
  if (link.room === 'garden' && sky && UPLOAD_ID.test(sky)) {
    const turn = Number(params.get('sr'));
    if (uploads.has(sky)) link.sky = { id: sky, turn: turn >= 0 && turn <= 345 && turn % 15 === 0 ? turn : 0 };
    else link.uploadsMissing++;
  }

  const time = Number(params.get('t'));
  if (params.get('t') && time >= 6 && time <= 22) link.time = time;
  link.snow = link.room === 'garden' && params.get('snow') === '1';
  return link;
}
