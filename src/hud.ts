import '@fontsource-variable/inter/wght.css';
import './hud.css';
import manifest, { type TextureInfo } from '@manifest';
import { accepts, PLACEHOLDER, ROOMS, SLOT_NAMES, type RoomKey, type Slot } from './room';
import type { AnyTexture } from './uploads/types';

export const CATEGORIES = { wood: 'Wood', stone: 'Stone and tiles', fabric: 'Fabric and leather', wall: 'Wall finishes', ground: 'Ground' };
type Category = TextureInfo['category'];
// The Uploads tab comes last (PRD 16.6).
const TABS = { ...CATEGORIES, uploads: 'Uploads' };
type Tab = keyof typeof TABS;

// The texture to drag onto a surface travels in the drag data under this type.
export const DRAG_TYPE = 'text/x-asset-showroom-texture';

const thumbUrl = (texture: AnyTexture) => ('uploaded' in texture ? texture.thumb : `/textures/${texture.slug}/thumb.webp`);

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

// Room switcher, slot panel, texture card and tray (PRD 6.3, 6.4, 9 and 15.6). All text is set with textContent.
export function createHud({
  onSelect,
  onApply,
  onSize,
  onRoom,
  onModel,
}: {
  onSelect: (slot: Slot | null) => void;
  onApply: (texture: AnyTexture) => void;
  onSize: (id: string, sizeCm: [number, number]) => void;
  onRoom: (room: RoomKey) => void;
  onModel: (index: number) => void;
}) {
  let applied: Partial<Record<Slot, AnyTexture>> = {};
  let selected: Slot | null = null;
  let tab: Tab = 'wood';

  const roomButtons = (Object.keys(ROOMS) as RoomKey[]).map((key) => {
    const button = element('button', '', ROOMS[key].name);
    button.type = 'button';
    button.addEventListener('click', () => onRoom(key));
    document.getElementById('rooms')!.append(button);
    return { key, button };
  });

  // Filled in by setRoom with the room's own surfaces, then by setModels with its placed models.
  let slotButtons: Partial<Record<Slot, HTMLButtonElement>> = {};
  let modelButtons: HTMLButtonElement[] = [];

  const tabButtons = {} as Record<Tab, HTMLButtonElement>;
  for (const category of Object.keys(TABS) as Tab[]) {
    const button = element('button', '', TABS[category]);
    button.type = 'button';
    button.addEventListener('click', () => {
      tab = category;
      render();
    });
    document.getElementById('tabs')!.append(button);
    tabButtons[category] = button;
  }

  const swatches = document.getElementById('swatches')!;
  const uploadSwatches = document.getElementById('upload-swatches')!;
  const empty = element('div', 'empty', 'No textures in this category yet.');
  swatches.append(empty);
  const swatchButtons = manifest.textures.map((texture) => {
    const button = element('button', 'swatch');
    button.type = 'button';
    button.draggable = true;
    button.title = texture.name;
    const image = element('img');
    image.src = thumbUrl(texture);
    image.alt = '';
    image.draggable = false;
    const dot = element('span', 'dot');
    const ring = element('span', 'ring');
    ring.hidden = true;
    button.append(image, ring, element('span', 'label', texture.name), dot);
    button.addEventListener('click', () => onApply(texture));
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer!.setData(DRAG_TYPE, texture.slug);
      event.dataTransfer!.effectAllowed = 'copy';
    });
    swatches.append(button);
    return { texture, button, image, dot, ring };
  });

  const chip = document.getElementById('chip')!;
  const chipText = chip.firstElementChild!;
  const chipClear = chip.querySelector('button')!;
  chipClear.addEventListener('click', () => onSelect(null));

  const card = document.getElementById('card')!;
  const cardImage = card.querySelector('img')!;
  const cardLink = card.querySelector('a')!;
  const cardSize = card.querySelector<HTMLElement>('.size')!;
  const dims = card.querySelector<HTMLElement>('.dims')!;
  const sizeInputs = [...dims.querySelectorAll('input')];
  // An uploaded texture's size. Not an undo step (PRD 16.7). Out-of-range values are clamped.
  for (const input of sizeInputs) {
    input.addEventListener('change', () => {
      const shown = selected && applied[selected];
      if (!shown || !('uploaded' in shown)) return;
      const size = sizeInputs.map((field, i) => Math.min(1000, Math.max(10, Math.round(field.valueAsNumber || shown.sizeCm[i])))) as [number, number];
      sizeInputs.forEach((field, i) => (field.value = String(size[i])));
      onSize(shown.slug, size);
      render();
    });
  }

  function render() {
    for (const [slot, button] of Object.entries(slotButtons) as [Slot, HTMLButtonElement][]) {
      button.setAttribute('aria-pressed', String(slot === selected));
      const texture = applied[slot];
      const thumb = button.firstElementChild as HTMLElement;
      thumb.style.background = texture ? `center / cover url("${thumbUrl(texture)}")` : PLACEHOLDER[slot];
    }

    const shown = selected && applied[selected];
    card.hidden = !shown;
    if (shown) {
      cardImage.src = thumbUrl(shown);
      card.querySelector('.name')!.textContent = shown.name;
      const uploaded = 'uploaded' in shown;
      card.querySelector('.category')!.textContent = uploaded ? 'Uploaded texture' : CATEGORIES[shown.category];
      cardSize.textContent = `${shown.sizeCm[0]} × ${shown.sizeCm[1]} cm`;
      cardSize.hidden = cardLink.hidden = uploaded;
      dims.hidden = !uploaded;
      // Not the field being typed in, so a texture that finishes loading doesn't reset it.
      sizeInputs.forEach((input, i) => input !== document.activeElement && (input.value = String(shown.sizeCm[i])));
      if (!uploaded) cardLink.href = shown.poliigonUrl;
    }

    chipText.textContent = selected ? `Textures for the ${SLOT_NAMES[selected].toLowerCase()}` : 'Select a surface to apply a texture';
    chipClear.hidden = !selected;

    // Uploaded textures fit every surface, so the Uploads tab is never dimmed.
    for (const [category, button] of Object.entries(tabButtons) as [Tab, HTMLButtonElement][]) {
      button.disabled = category !== 'uploads' && !!selected && !accepts(selected, category);
      button.setAttribute('aria-pressed', String(category === tab));
    }

    const inUse = new Set(Object.values(applied).map((texture) => texture.slug));
    for (const { texture, button, dot } of swatchButtons) {
      button.hidden = texture.category !== tab;
      dot.hidden = !inUse.has(texture.slug);
    }
    empty.hidden = swatchButtons.some(({ button }) => !button.hidden);
    swatches.hidden = tab === 'uploads';
    uploadSwatches.hidden = tab !== 'uploads';
  }

  render();

  return {
    // Settles when each thumbnail has loaded or failed.
    thumbnails: swatchButtons.map(({ image }) => image.decode()),
    // A ring on the swatch while its texture loads. null hides it.
    setProgress(slug: string, fraction: number | null) {
      const swatch = swatchButtons.find(({ texture }) => texture.slug === slug);
      if (!swatch) return;
      swatch.ring.hidden = fraction === null;
      swatch.button.setAttribute('aria-busy', String(fraction !== null));
      if (fraction !== null) swatch.ring.style.setProperty('--progress', String(fraction));
    },
    setSelected(slot: Slot | null) {
      selected = slot;
      // Jump to the first tab the slot accepts, unless the Uploads tab shows, and scroll it into view where the
      // tabs scroll (narrow screens).
      if (slot && tab !== 'uploads') tab = (Object.keys(CATEGORIES) as Category[]).find((category) => accepts(slot, category))!;
      render();
      const tabs = tabButtons[tab].parentElement!;
      const { offsetLeft, offsetWidth } = tabButtons[tab];
      if (offsetLeft < tabs.scrollLeft || offsetLeft + offsetWidth > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = offsetLeft - 8;
    },
    // No texture means the slot has none again.
    setTexture(slot: Slot, texture?: AnyTexture) {
      if (texture) applied[slot] = texture;
      else delete applied[slot];
      render();
    },
    // Shows the room's surfaces and marks its button. `roomApplied` is the room's own record, kept by the caller.
    setRoom(room: RoomKey, roomApplied: Partial<Record<Slot, AnyTexture>>) {
      applied = roomApplied;
      // The tray starts on the first category any of the room's surfaces accepts.
      tab = (Object.keys(CATEGORIES) as Category[]).find((category) => (ROOMS[room].slots as Slot[]).some((slot) => accepts(slot, category)))!;
      for (const { key, button } of roomButtons) button.setAttribute('aria-pressed', String(key === room));
      slotButtons = {};
      modelButtons = [];
      const list = document.getElementById('slot-list')!;
      list.replaceChildren();
      for (const slot of ROOMS[room].slots as Slot[]) {
        const button = element('button', 'slot');
        button.type = 'button';
        button.append(element('span', 'thumb'), element('span', '', SLOT_NAMES[slot]));
        button.addEventListener('click', () => onSelect(selected === slot ? null : slot));
        list.append(button);
        slotButtons[slot] = button;
      }
      render();
    },
    // The room's placed models, under its surfaces. The buttons are kept and only renamed, so focus stays put.
    setModels(names: string[], chosen: number | null) {
      for (const button of modelButtons.splice(names.length)) button.remove();
      names.forEach((name, i) => {
        if (!modelButtons[i]) {
          const button = element('button', 'slot model');
          button.type = 'button';
          button.append(element('span', 'thumb'), element('span'));
          button.addEventListener('click', () => onModel(i));
          document.getElementById('slot-list')!.append(button);
          modelButtons[i] = button;
        }
        modelButtons[i].lastChild!.textContent = name;
        modelButtons[i].setAttribute('aria-pressed', String(i === chosen));
      });
    },
  };
}
