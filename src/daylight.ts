import {
  BufferGeometry,
  Color,
  CubeCamera,
  DirectionalLight,
  Float32BufferAttribute,
  HalfFloatType,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { BuiltRoom } from './rooms/index';

const SUNRISE = 6;
const SUNSET = 20;
const PRESETS = { Morning: 8, Midday: 12, 'Golden hour': 18.5, Night: 21 };
export const DEFAULT_TIME = PRESETS.Midday;

const noonSun = new Color('#fff3e0');
const lowSun = new Color('#ffa45c');
const daySky = new Color('#dde6f2');
const nightSky = new Color('#1c2333');
const dayGlass = new Color('#cfe0ee');
const nightGlass = new Color('#1a2230');

// Point lights for the lamps, made once. The number of lights stays the same in every room, so switching rooms
// doesn't recompile the shaders. Unused ones stay at intensity 0. This is the most lamps any room has.
const LAMP_POOL = 4;
const SKY_BACKGROUND = 0.1;
const SKY_LIGHT = 0.1;
// Indoors a generated room lights the scene and shows in reflections (PRD 15.8), so the sky fill is lower than
// outdoors. Both dim after sunset. The garden has no walls to catch the lamp light, so its night fill is higher.
const ROOM_LIGHT = { day: 0.15, night: 0.03 };
const FILL = { day: 0.3, night: 0.2 };
const FILL_OUTDOORS = { day: 1.2, night: 1.6 };

// Stars, about 1500 points 70 m from the middle of the room, inside the camera's far plane (100 m). They go all the way
// round, since the camera looks down on the garden and sees the sky around the plinth, not above it.
function makeStars() {
  const positions: number[] = [];
  for (let i = 0; i < 1500; i++) positions.push(...new Vector3().randomDirection().multiplyScalar(70).toArray());
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ size: 2, sizeAttenuation: false, transparent: true, depthWrite: false }));
}

const format = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

// Sun, sky fill, lamps and the daylight panel (PRD 6.5). setRoom points them at the room that shows.
// Outdoors it also adds the sky, which lights the scene, and the stars (PRD 15.8).
export function createDaylight(scene: Scene, renderer: WebGLRenderer, reducedMotion: boolean, onUserChange: () => void) {
  const sky = new HemisphereLight(daySky, '#5a4f45', 1.2);
  const sun = new DirectionalLight(noonSun, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4; // softens the shadow edges (PCF)
  scene.add(sky, sun);
  let room: BuiltRoom | null = null;
  const lamps = Array.from({ length: LAMP_POOL }, () => new PointLight('#ffcf8a', 0, 7, 2));
  scene.add(...lamps);

  // The Sky shader draws the sky into a small cube map, the garden's background, and from that into an
  // environment map, which lights the garden. Both are made again only when the sun moves more than 1 degree (4
  // during a preset). A plain cube map is much quicker to draw behind the scene than the environment map. The sky
  // leaves out the sun's disc, since the sun light already lights the scene. The shader's colours are physical, far
  // brighter than the lights here, so the scene turns both down.
  const skyDome = new Sky();
  const skyUniforms = skyDome.material.uniforms;
  skyDome.material.fragmentShader = skyDome.material.fragmentShader.replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;', '');
  const skyScene = new Scene().add(skyDome);
  const skyCube = new WebGLCubeRenderTarget(64, { type: HalfFloatType });
  const skyCamera = new CubeCamera(0.1, 10, skyCube);
  const indoorBackground = scene.background;
  scene.backgroundIntensity = SKY_BACKGROUND;
  scene.environmentIntensity = SKY_LIGHT;
  const pmrem = new PMREMGenerator(renderer);
  const roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  let environment: WebGLRenderTarget | null = null;
  const lastSun = new Vector3(); // the sun direction the environment was made with
  let environmentDirty = false;
  const stars = makeStars();

  const clock = document.querySelector<HTMLElement>('#daylight .clock')!;
  const slider = document.querySelector<HTMLInputElement>('#daylight input')!;
  const presetButtons = Object.entries(PRESETS).map(([label, hours]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      tweenTo(hours);
      onUserChange();
    });
    document.querySelector('#daylight .presets')!.append(button);
    return { button, hours };
  });

  let time = DEFAULT_TIME;
  let tween: { from: number; to: number; start: number } | null = null;

  function setTime(hours: number) {
    time = MathUtils.clamp(hours, 6, 22);

    // The sun rises on the right (+x), is highest over the open front (+z) at 13:00 and sets on the left.
    const day = (time - SUNRISE) / (SUNSET - SUNRISE);
    const elevation = day > 0 && day < 1 ? Math.sin(Math.PI * day) * MathUtils.degToRad(60) : 0;
    const azimuth = MathUtils.degToRad(75) * (1 - 2 * MathUtils.clamp(day, 0, 1));
    sun.position
      .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
      .multiplyScalar(20);

    // The sky's sun keeps going down after sunset, so the sky turns dark instead of staying at dusk.
    const skyElevation = Math.sin(Math.PI * day) * MathUtils.degToRad(60);
    skyUniforms.sunPosition.value.set(
      Math.sin(azimuth) * Math.cos(skyElevation),
      Math.sin(skyElevation),
      Math.cos(azimuth) * Math.cos(skyElevation),
    );
    // During a preset the sun moves fast, so it must move 4 degrees, which keeps the rebuilds to about a dozen.
    const guard = MathUtils.degToRad(tween ? 4 : 1);
    if (room?.outdoor && (!environment || lastSun.angleTo(skyUniforms.sunPosition.value) > guard)) {
      environmentDirty = true;
    }

    const height = Math.sin(elevation);
    const light = MathUtils.smoothstep(height, 0, 0.25); // 0 at the horizon, 1 once the sun is up
    sun.color.copy(noonSun).lerp(lowSun, 1 - MathUtils.smoothstep(height, 0.2, 0.8));
    sun.intensity = 3 * light;
    sun.visible = light > 0;
    sky.color.copy(nightSky).lerp(daySky, light);
    const fill = room?.outdoor ? FILL_OUTDOORS : FILL;
    sky.intensity = MathUtils.lerp(fill.night, fill.day, light);
    scene.environmentIntensity = room?.outdoor ? SKY_LIGHT : MathUtils.lerp(ROOM_LIGHT.night, ROOM_LIGHT.day, light);

    // After sunset the lamps come on and the windows go dark.
    const lampsOn = MathUtils.smoothstep(time, SUNSET - 0.5, SUNSET + 0.5);
    lamps.forEach((lamp, i) => (lamp.intensity = i < (room?.lamps.length ?? 0) ? room!.lampPower * lampsOn : 0));
    if (room) room.shade.emissiveIntensity = 2 * lampsOn;
    stars.material.opacity = MathUtils.smoothstep(time, SUNSET, SUNSET + 1);
    stars.visible = stars.material.opacity > 0;
    if (room?.glass) {
      room.glass.color.copy(nightGlass).lerp(dayGlass, light);
      room.glass.emissiveIntensity = 0.4 * light;
    }

    clock.textContent = format(time);
    slider.value = String(time);
    slider.setAttribute('aria-valuetext', format(time));
    for (const { button, hours } of presetButtons) button.setAttribute('aria-pressed', String(hours === time));
  }

  // Presets move the sun over 2 s. The slider and the [ ] keys set the time at once.
  function tweenTo(hours: number) {
    if (reducedMotion) return setTime(hours);
    tween = { from: time, to: hours, start: performance.now() };
  }

  // The slider moves the sun while it is dragged, and counts as one change when it is let go.
  slider.addEventListener('input', () => {
    tween = null;
    setTime(Number(slider.value));
  });
  slider.addEventListener('change', onUserChange);

  // On narrow screens the clock and slider move into the tray (PRD 9).
  const timeRow = document.querySelector('#daylight .time')!;
  const narrow = matchMedia('(max-width: 900px)');
  const placeTimeRow = () => document.getElementById(narrow.matches ? 'tray' : 'daylight')!.prepend(timeRow);
  narrow.addEventListener('change', placeTimeRow);
  placeTimeRow();

  setTime(DEFAULT_TIME);

  return {
    // The time the room is at, or is moving to during a preset.
    target: () => tween?.to ?? time,
    // Sets the time at once and stops any preset that is running.
    setTime(hours: number) {
      tween = null;
      setTime(hours);
    },
    // Moves the lamps, shadow area, glass and shades to this room, at the current time, and adds or removes the
    // sky, its environment and the stars. Indoors the generated room is the environment.
    setRoom(next: BuiltRoom) {
      if (next.lamps.length > LAMP_POOL) throw new Error(`The ${next.key} room has ${next.lamps.length} lamps. LAMP_POOL is ${LAMP_POOL}.`);
      lamps.forEach((lamp, i) => {
        lamp.position.copy(next.lamps[i] ?? lamp.position);
        lamp.distance = next.outdoor ? 4 : 7;
      });
      if (next.outdoor) {
        scene.add(stars);
      } else {
        scene.remove(stars);
        environmentDirty = false;
        scene.background = indoorBackground;
        scene.environment = roomEnvironment;
        environment?.dispose();
        environment = null;
      }
      const e = next.extent;
      Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
      sun.shadow.camera.updateProjectionMatrix();
      room = next;
      setTime(time);
    },
    // Call once per frame.
    update() {
      if (environmentDirty) {
        environmentDirty = false;
        skyCamera.update(renderer, skyScene);
        environment = pmrem.fromCubemap(skyCube.texture, environment); // reuses the last map's target
        scene.environment = environment.texture;
        scene.background = skyCube.texture;
        lastSun.copy(skyUniforms.sunPosition.value);
      }
      if (!tween) return;
      const { from, to, start } = tween;
      const t = Math.min((performance.now() - start) / 2000, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      if (t === 1) tween = null; // so the last step uses the 1 degree guard
      setTime(MathUtils.lerp(from, to, eased));
    },
  };
}
