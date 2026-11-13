import '@fontsource-variable/inter/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import './hud.css';
import manifest, { type TextureInfo } from '@manifest';
import slots from './textures/slots.json';
import { PLACEHOLDER, SLOT_NAMES, type Slot } from './room';

export const CATEGORIES = { wood: 'Wood', stone: 'Stone and tiles', fabric: 'Fabric and leather', wall: 'Wall finishes' };
type Category = TextureInfo['category'];

export const accepts = (slot: Slot, category: Category) => (slots[slot] as string[]).includes(category);

// The texture to drag onto a surface travels in the drag data under this type.
export const DRAG_TYPE = 'text/x-asset-showroom-texture';

const thumbUrl = (texture: TextureInfo) => `/textures/${texture.slug}/thumb.webp`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

// Slot panel, texture card and tray (PRD 6.3, 6.4 and 9). All text is set with textContent.
export function createHud(onSelect: (slot: Slot | null) => void, onApply: (texture: TextureInfo) => void) {
  const applied: Partial<Record<Slot, TextureInfo>> = {};
  let selected: Slot | null = null;
  let tab: Category = 'wood';

  const slotButtons = {} as Record<Slot, HTMLButtonElement>;
  for (const slot of Object.keys(slots) as Slot[]) {
    const button = element('button', 'slot');
    button.type = 'button';
    button.append(element('span', 'thumb'), element('span', '', SLOT_NAMES[slot]));
    button.addEventListener('click', () => onSelect(selected === slot ? null : slot));
    document.getElementById('slot-list')!.append(button);
    slotButtons[slot] = button;
  }

  const tabButtons = {} as Record<Category, HTMLButtonElement>;
  for (const category of Object.keys(CATEGORIES) as Category[]) {
    const button = element('button', '', CATEGORIES[category]);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
      tab = category;
      render();
    });
    document.getElementById('tabs')!.append(button);
    tabButtons[category] = button;
  }

  const swatches = document.getElementById('swatches')!;
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
      card.querySelector('.category')!.textContent = CATEGORIES[shown.category];
      card.querySelector('.size')!.textContent = `${shown.sizeCm[0]} × ${shown.sizeCm[1]} cm`;
      cardLink.href = shown.poliigonUrl;
    }

    chipText.textContent = selected ? `for the ${SLOT_NAMES[selected].toLowerCase()}` : 'Select a surface to apply a texture';
    chipClear.hidden = !selected;

    for (const [category, button] of Object.entries(tabButtons) as [Category, HTMLButtonElement][]) {
      button.disabled = !!selected && !accepts(selected, category);
      button.setAttribute('aria-selected', String(category === tab));
    }

    const inUse = new Set(Object.values(applied).map((texture) => texture.slug));
    for (const { texture, button, dot } of swatchButtons) {
      button.hidden = texture.category !== tab;
      dot.hidden = !inUse.has(texture.slug);
    }
    empty.hidden = swatchButtons.some(({ button }) => !button.hidden);
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
      // Jump to the first tab the slot accepts.
      if (slot) tab = (Object.keys(CATEGORIES) as Category[]).find((category) => accepts(slot, category))!;
      render();
    },
    setTexture(slot: Slot, texture: TextureInfo) {
      applied[slot] = texture;
      render();
    },
  };
}
