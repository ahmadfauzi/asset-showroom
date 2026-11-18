import type { WebGLRenderer } from 'three';
import { MESSAGES } from './detect';
import type { Library } from './library';
import type { createUploadsTab } from './tab';
import { UploadError, type Upload } from './types';

// The Upload button and dropping a zip on the page (PRD 16.3). One upload runs at a time. The zip code loads
// on the first upload, so it adds nothing to the start-up JavaScript (PRD 16.11).
export function createUploader({
  library,
  tab,
  toolbar,
  renderer,
  onAdded,
}: {
  library: Library;
  tab: ReturnType<typeof createUploadsTab>;
  toolbar: { toast(message: string): void; setUploading(busy: boolean): void };
  renderer: WebGLRenderer;
  onAdded: (upload: Upload) => void;
}) {
  const input = document.getElementById('upload-input') as HTMLInputElement;
  let busy = false;
  let persisted = false;

  const start = async (file: File) => {
    if (busy) return toolbar.toast(MESSAGES.busy);
    busy = true;
    toolbar.setUploading(true);
    const name = file.name.replace(/\.zip$/i, '');
    tab.setProgress(name, 0);
    try {
      const { processZip } = await import('./process');
      const upload = await processZip(file, renderer, (fraction) => tab.setProgress(name, fraction), (message) => toolbar.toast(message));
      // Asks the browser to keep uploads when space runs low. Not awaited: Firefox asks the user first.
      if (!persisted) {
        persisted = true;
        navigator.storage?.persist().catch(() => {});
      }
      await library.add(upload);
      tab.setUploads(library.list());
      onAdded(upload);
    } catch (error) {
      if (error instanceof UploadError) return toolbar.toast(error.message);
      console.warn('Asset Showroom: could not read the zip.', error);
      toolbar.toast("Couldn't read this zip.");
    } finally {
      busy = false;
      toolbar.setUploading(false);
      tab.setProgress(name, null);
    }
  };

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires change.
    input.value = '';
    if (file) void start(file);
  });

  // Only file drags. Swatch drags carry no files, so they still reach the canvas.
  const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');
  window.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); // or the browser opens the zip
    const file = event.dataTransfer!.files[0];
    if (file) void start(file);
  });

  return { pick: () => input.click() };
}
