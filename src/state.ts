import manifest from '@manifest';
import { accepts, isRoom, ROOMS, type RoomKey, type Slot } from './room';

export type RoomState = { textures: Partial<Record<Slot, string>>; time: number; snow: boolean };

// Share link format (PRD 15.7): #v=2&room=garden&ground=grass&t=18.5&snow=1
// Only the room's own slots are saved, in the order of rooms.json. snow=1 is only written in the Garden.
export function toHash(room: RoomKey, state: RoomState) {
  const params = new URLSearchParams({ v: '2', room });
  for (const slot of ROOMS[room].slots as Slot[]) {
    const slug = state.textures[slot];
    if (slug) params.set(slot, slug);
  }
  params.set('t', String(state.time));
  if (room === 'garden' && state.snow) params.set('snow', '1');
  return `#${params}`;
}

// Reads a share link, v2 or v1 (v1 is always the Living room). An unknown room counts as the Living room.
// Slugs that aren't in this set are counted in `missing`. Anything else that doesn't fit, such as another version,
// a slot the room doesn't have, a texture on a slot that doesn't accept it, or a time outside 6 to 22, is ignored.
export function fromHash(hash: string) {
  const link: { room: RoomKey; textures: Partial<Record<Slot, string>>; time?: number; snow: boolean; missing: number } = {
    room: 'living',
    textures: {},
    snow: false,
    missing: 0,
  };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const version = params.get('v');
  if (version !== '1' && version !== '2') return link;
  const room = params.get('room') ?? '';
  if (version === '2' && isRoom(room)) link.room = room;

  for (const slot of ROOMS[link.room].slots as Slot[]) {
    const slug = params.get(slot);
    if (!slug) continue;
    const texture = manifest.textures.find((t) => t.slug === slug);
    if (!texture) link.missing++;
    else if (accepts(slot, texture.category)) link.textures[slot] = slug;
  }

  const time = Number(params.get('t'));
  if (params.get('t') && time >= 6 && time <= 22) link.time = time;
  link.snow = link.room === 'garden' && params.get('snow') === '1';
  return link;
}
