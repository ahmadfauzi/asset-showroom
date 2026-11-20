import { DRAG_TYPE } from '../hud';
import type { RoomKey } from '../room';
import type { Kind, UploadMeta } from './types';

// A model to place travels in the drag data under this type.
export const MODEL_DRAG_TYPE = 'text/x-asset-showroom-model';

const KINDS: Record<Kind, { label: string; icon: string }> = {
  texture: { label: 'Texture', icon: 'M4 4h12v12H4zM10 4v12M4 10h12' },
  model: { label: 'Model', icon: 'M10 3l6 3.5v7L10 17l-6-3.5v-7zM4 6.5l6 3.5 6-3.5M10 10v7' },
  hdri: { label: 'Sky', icon: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v2M10 16v2M2 10h2M16 10h2' },
};
const CROSS = 'm6 6 8 8m0-8-8 8';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function icon(path: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', path);
  svg.append(line);
  return svg;
}

// The Uploads tab's swatches (PRD 16.6). All text from a zip is set with textContent.
export function createUploadsTab({
  thumb,
  onUse,
  onDelete,
}: {
  thumb: (id: string) => string;
  onUse: (meta: UploadMeta) => void;
  onDelete: (meta: UploadMeta) => void;
}) {
  const root = document.getElementById('upload-swatches')!;
  const empty = element('div', 'empty', 'Upload a .zip with a texture, a model or an HDRI. It stays in this browser.');
  let list: UploadMeta[] = [];
  let room: RoomKey | null = null;
  let card: { node: HTMLElement; bar: HTMLProgressElement } | null = null;

  const swatch = (meta: UploadMeta) => {
    const node = element('div', 'upload-swatch');
    node.title = meta.name;

    const use = element('button', 'swatch');
    use.type = 'button';
    use.setAttribute('aria-label', meta.name);
    const image = element('img');
    image.src = thumb(meta.id);
    image.alt = '';
    image.draggable = false;
    use.append(image, element('span', 'label', meta.name));
    use.addEventListener('click', () => onUse(meta));
    // Skies only work outdoors (PRD 16.6). The title is on the swatch, since a disabled button may not show one.
    if (meta.kind === 'hdri' && room !== 'garden') {
      use.disabled = true;
      node.title = 'Skies work in the Garden.';
    }
    const dragType = meta.kind === 'texture' ? DRAG_TYPE : meta.kind === 'model' ? MODEL_DRAG_TYPE : null;
    if (dragType) {
      use.draggable = true;
      use.addEventListener('dragstart', (event) => {
        event.dataTransfer!.setData(dragType, meta.id);
        event.dataTransfer!.effectAllowed = 'copy';
      });
    }

    const kind = element('span', 'kind');
    kind.setAttribute('role', 'img');
    kind.setAttribute('aria-label', KINDS[meta.kind].label);
    kind.append(icon(KINDS[meta.kind].icon));

    const remove = element('button', 'delete');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${meta.name}`);
    remove.append(icon(CROSS));
    remove.addEventListener('click', () => onDelete(meta));

    node.append(use, kind, remove);
    return node;
  };

  const render = () => {
    empty.hidden = !!card || list.length > 0;
    root.replaceChildren(empty, ...(card ? [card.node] : []), ...list.map(swatch));
  };
  render();

  return {
    element: root,
    setUploads(uploads: UploadMeta[]) {
      list = uploads;
      render();
    },
    // A card with a progress bar while an upload runs. null removes it.
    setProgress(name: string, fraction: number | null) {
      if (fraction === null) {
        card = null;
        return render();
      }
      if (!card) {
        const node = element('div', 'upload-progress');
        node.title = name;
        const bar = element('progress');
        bar.max = 1;
        bar.setAttribute('aria-label', `Uploading ${name}`);
        node.append(bar, element('span', 'label', name));
        card = { node, bar };
        render();
      }
      card.bar.value = fraction;
    },
    // Only sky swatches depend on the room (PRD 16.6).
    setRoom(next: RoomKey) {
      room = next;
      render();
    },
  };
}
