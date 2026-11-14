import manifest from '@manifest';
import { accepts, type Slot } from './room';
import slots from './textures/slots.json';

export type RoomState = { textures: Partial<Record<Slot, string>>; time: number };

// Share link format (PRD 6.8): #v=1&floor=walnut-planks&walls=white-plaster&t=18.5
export function toHash(state: RoomState) {
  const params = new URLSearchParams({ v: '1' });
  for (const slot of Object.keys(slots) as Slot[]) {
    const slug = state.textures[slot];
    if (slug) params.set(slot, slug);
  }
  params.set('t', String(state.time));
  return `#${params}`;
}

// Reads a share link. Slugs that aren't in this set are counted in `missing`. Anything else that doesn't fit,
// such as another version, a texture on a slot that doesn't accept it, or a time outside 6 to 22, is ignored.
export function fromHash(hash: string) {
  const link: { textures: Partial<Record<Slot, string>>; time?: number; missing: number } = { textures: {}, missing: 0 };
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('v') !== '1') return link;

  for (const slot of Object.keys(slots) as Slot[]) {
    const slug = params.get(slot);
    if (!slug) continue;
    const texture = manifest.textures.find((t) => t.slug === slug);
    if (!texture) link.missing++;
    else if (accepts(slot, texture.category)) link.textures[slot] = slug;
  }

  const time = Number(params.get('t'));
  if (params.get('t') && time >= 6 && time <= 22) link.time = time;
  return link;
}
