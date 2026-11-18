import { ShaderChunk, Vector2, type MeshStandardMaterial } from 'three';

const ONE = new Vector2(1, 1);

// Samples the material's maps by world position on the three axes, blended by the surface normal, so a texture
// fits a model without metre UVs (PRD 15.9). map.repeat is the scale: repeats per metre. Safe to call twice.
export function triplanar(material: MeshStandardMaterial) {
  if (material.userData.triplanar) return;
  material.userData.triplanar = true;
  material.customProgramCacheKey = () => 'triplanar';
  // A function, not an arrow, so a clone that calls it (the texture spread in main.ts) reads its own map.
  material.onBeforeCompile = function (this: MeshStandardMaterial, shader) {
    // Read at render time, since a new texture can change the scale without a recompile.
    const compiled = this;
    shader.uniforms.triplanarScale = { get value() { return compiled.map?.repeat ?? ONE; } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPosition;\nvarying vec3 vTriNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vTriPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 triplanarScale;
varying vec3 vTriPosition;
varying vec3 vTriNormal;
vec3 triplanarWeights() {
  vec3 w = pow(abs(normalize(vTriNormal)), vec3(4.0));
  return w / (w.x + w.y + w.z);
}
vec4 triplanar(sampler2D tex) {
  vec3 w = triplanarWeights();
  vec3 p = vTriPosition;
  vec2 s = triplanarScale;
  return texture2D(tex, p.zy * s) * w.x + texture2D(tex, p.xz * s) * w.y + texture2D(tex, p.xy * s) * w.z;
}`,
      )
      .replace('#include <map_fragment>', ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'triplanar( map )'))
      .replace('#include <roughnessmap_fragment>', ShaderChunk.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'triplanar( roughnessMap )'))
      .replace('#include <metalnessmap_fragment>', ShaderChunk.metalnessmap_fragment.replace('texture2D( metalnessMap, vMetalnessMapUv )', 'triplanar( metalnessMap )'))
      .replace('#include <aomap_fragment>', ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv )', 'triplanar( aoMap )'))
      // Each axis's tangent-space normal is turned into world space and blended (the "whiteout" blend), then
      // moved into view space, where three.js lights it.
      .replace(
        '#include <normal_fragment_maps>',
        ShaderChunk.normal_fragment_maps.replace(
          /vec3 mapN = texture2D\( normalMap, vNormalMapUv \)[\s\S]*?normal = normalize\( tbn \* mapN \);/,
          `vec3 n = normalize(vTriNormal);
	vec3 w = triplanarWeights();
	vec3 p = vTriPosition;
	vec2 s = triplanarScale;
	vec3 nx = texture2D(normalMap, p.zy * s).xyz * 2.0 - 1.0;
	vec3 ny = texture2D(normalMap, p.xz * s).xyz * 2.0 - 1.0;
	vec3 nz = texture2D(normalMap, p.xy * s).xyz * 2.0 - 1.0;
	nx.xy *= normalScale;
	ny.xy *= normalScale;
	nz.xy *= normalScale;
	nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
	ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
	nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
	vec3 worldNormal = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
	normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);`,
        ),
      );
  };
  material.needsUpdate = true;
}
