import {
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  MeshStandardMaterial,
  PointLight,
  Scene,
  Vector3,
} from 'three';

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

const format = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

// Sun, sky fill, lamps and the daylight panel (PRD 6.5).
export function createDaylight(
  scene: Scene,
  room: { glass: MeshStandardMaterial; shade: MeshStandardMaterial; lamps: Vector3[] },
  reducedMotion: boolean,
) {
  const sky = new HemisphereLight(daySky, '#5a4f45', 1.2);
  const sun = new DirectionalLight(noonSun, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const lamps = room.lamps.map((position) => {
    const light = new PointLight('#ffcf8a', 0, 7, 2);
    light.position.copy(position);
    return light;
  });
  scene.add(sky, sun, ...lamps);
  room.shade.emissive.set('#ffd59a');

  const clock = document.querySelector<HTMLElement>('#daylight .clock')!;
  const slider = document.querySelector<HTMLInputElement>('#daylight input')!;
  const presetButtons = Object.entries(PRESETS).map(([label, hours]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => tweenTo(hours));
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

    const height = Math.sin(elevation);
    const light = MathUtils.smoothstep(height, 0, 0.25); // 0 at the horizon, 1 once the sun is up
    sun.color.copy(noonSun).lerp(lowSun, 1 - MathUtils.smoothstep(height, 0.2, 0.8));
    sun.intensity = 3 * light;
    sun.visible = light > 0;
    sky.color.copy(nightSky).lerp(daySky, light);
    sky.intensity = 0.3 + 0.9 * light;

    // After sunset the lamps come on and the windows go dark.
    const lampsOn = MathUtils.smoothstep(time, SUNSET - 0.5, SUNSET + 0.5);
    for (const lamp of lamps) lamp.intensity = 8 * lampsOn;
    room.shade.emissiveIntensity = 2 * lampsOn;
    room.glass.color.copy(nightGlass).lerp(dayGlass, light);
    room.glass.emissiveIntensity = 0.4 * light;

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

  slider.addEventListener('input', () => {
    tween = null;
    setTime(Number(slider.value));
  });
  window.addEventListener('keydown', (event) => {
    if ((event.key !== '[' && event.key !== ']') || event.ctrlKey || event.metaKey || event.altKey) return;
    tween = null;
    setTime(time + (event.key === ']' ? 1 : -1));
  });

  setTime(DEFAULT_TIME);

  return {
    // Call once per frame.
    update() {
      if (!tween) return;
      const t = Math.min((performance.now() - tween.start) / 2000, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      setTime(MathUtils.lerp(tween.from, tween.to, eased));
      if (t === 1) tween = null;
    },
  };
}
