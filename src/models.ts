import type { Group, Mesh } from 'three';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Loads a built Poly Haven model from /models/<id>.glb (PRD 15.10). Its meshes cast and receive shadows.
export async function loadModel(id: string, ktx2: KTX2Loader): Promise<Group> {
  const { scene } = await new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).loadAsync(`/models/${id}.glb`);
  scene.traverse((object) => {
    if ((object as Mesh).isMesh) object.castShadow = object.receiveShadow = true;
  });
  return scene;
}
