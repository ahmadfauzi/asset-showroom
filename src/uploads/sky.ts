import { EquirectangularReflectionMapping } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

// Reads a stored sky .exr as a texture for the background and the environment (PRD 16.9). The library loads this
// file with import(), so EXRLoader stays out of the start-up JavaScript (PRD 16.11).
export async function readSky(exr: Blob) {
  const url = URL.createObjectURL(exr);
  try {
    const texture = await new EXRLoader().loadAsync(url);
    texture.mapping = EquirectangularReflectionMapping;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}
