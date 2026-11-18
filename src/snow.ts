import { type Box3, BufferGeometry, Float32BufferAttribute, Points, type Scene, ShaderMaterial, Vector3 } from 'three';

const FLAKES = 3000;

// Falling snow (PRD 15.8): about 3000 points. The vertex shader moves each flake from the time uniform and wraps it
// inside the area, so nothing is updated per flake on the CPU. `aSeed` gives each flake its own speed and sway.
// With reduced motion the time never moves, so the flakes stay where they were first scattered.
export function createSnow(scene: Scene, area: Box3, reducedMotion: boolean) {
  const size = area.getSize(new Vector3());
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < FLAKES; i++) {
    positions.push(area.min.x + Math.random() * size.x, area.min.y + Math.random() * size.y, area.min.z + Math.random() * size.z);
    seeds.push(Math.random());
  }
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMin: { value: area.min.clone() },
      uSize: { value: size },
      uRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMin;
      uniform vec3 uSize;
      uniform float uRatio;
      attribute float aSeed;
      void main() {
        vec3 p = position - uMin;
        p.y -= uTime * (0.5 + aSeed * 0.5);
        p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.3;
        p.z += cos(uTime * 0.5 + aSeed * 25.0) * 0.3;
        p = mod(p, uSize) + uMin;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(uRatio * (50.0 + aSeed * 30.0) / -view.z, 1.5, 12.0);
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0), 0.9 * smoothstep(0.5, 0.2, d));
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const flakes = new Points(geometry, material);
  flakes.frustumCulled = false; // the shader moves the flakes, so the points' own bounds don't apply

  return {
    // Adds the flakes to the scene or takes them out, so a room that isn't showing costs nothing.
    set(on: boolean) {
      if (on) scene.add(flakes);
      else scene.remove(flakes);
    },
    // Call once per frame with the time in seconds.
    update(seconds: number) {
      if (!reducedMotion) material.uniforms.uTime.value = seconds;
    },
    dispose() {
      scene.remove(flakes);
      geometry.dispose();
      material.dispose();
    },
  };
}
