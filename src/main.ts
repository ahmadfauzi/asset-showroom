import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import manifest from '@manifest';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2');

if (!gl) {
  canvas.remove();
  document.getElementById('no-webgl')!.style.display = 'block';
} else {
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(4, 3, 5);

  const plinth = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshStandardMaterial({ color: 0xcccccc }));
  scene.add(plinth);

  // Puts the first texture of the set on the plinth to prove the pipeline works.
  const texture = manifest.textures[0];
  if (texture) {
    const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
    Promise.all(['color', 'normal', 'orm'].map((map) => ktx2.loadAsync(`/textures/${texture.slug}/${map}.ktx2`))).then(
      ([color, normal, orm]) => {
        for (const map of [color, normal, orm]) {
          map.wrapS = map.wrapT = RepeatWrapping;
          map.repeat.set(400 / texture.sizeCm[0], 400 / texture.sizeCm[1]);
        }
        plinth.material = new MeshStandardMaterial({
          map: color,
          normalMap: normal,
          aoMap: orm,
          roughnessMap: orm,
          metalnessMap: orm,
        });
      },
    );
  }

  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const resize = () => {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}
