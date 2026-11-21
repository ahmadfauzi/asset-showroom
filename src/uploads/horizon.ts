// Sky-only HDRIs are black below the horizon, which puts the room in black (Task 11b). Used by the HDRI Worker.

const luminance = (d: Float32Array, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const BAND = 8; // rows above the horizon that give its colour
const BLUR = 33; // columns, wrapping around the u = 0/1 seam

// `data` is RGBA, bottom row first, as the Worker keeps it. If the lower half is under 1% as bright as the upper
// half, every row below the horizon is filled from the horizon colour (capped and blurred, then blended to one
// colour further down, see below), from 1 times at the horizon down to 0.5 times at the bottom row. Changes `data`
// in place and returns true if it filled.
export function fillBelowHorizon(data: Float32Array, width: number, height: number): boolean {
  const half = height >> 1;
  // The lower half is measured without the rows within 5 degrees of the horizon. Checked: the sunset HDRI's sky
  // runs 22 rows of 4096 below the middle row, which alone made its lower half 1.65% as bright as the upper half.
  const margin = Math.floor(height / 36);
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let i = from * width * 4; i < to * width * 4; i += 4) sum += luminance(data, i);
    return sum / ((to - from) * width);
  };
  if (!(mean(0, half - margin) < 0.01 * mean(half, height))) return false;

  // The average colour of the band in each column, then a box blur across columns.
  const band = Math.min(BAND, height - half);
  const horizon = new Float32Array(width * 3);
  for (let y = half; y < half + band; y++)
    for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) horizon[x * 3 + c] += data[(y * width + x) * 4 + c] / band;
  // A sun or glow in the band would light the ground from below. Each column is capped at 3 times the median
  // column brightness, keeping its hue, so no filled pixel is brighter than that.
  const bright = Array.from({ length: width }, (_, x) => luminance(horizon, x * 3));
  const cap = 3 * [...bright].sort((a, b) => a - b)[width >> 1];
  for (let x = 0; x < width; x++)
    if (bright[x] > cap) for (let c = 0; c < 3; c++) horizon[x * 3 + c] *= cap / bright[x];
  const blurred = new Float32Array(width * 3);
  const reach = BLUR >> 1;
  for (let x = 0; x < width; x++)
    for (let k = -reach; k <= reach; k++) {
      const from = (((x + k) % width) + width) % width;
      for (let c = 0; c < 3; c++) blurred[x * 3 + c] += horizon[from * 3 + c] / BLUR;
    }

  // Copying each column straight down draws vertical bars, so each row blends from the column's colour at the
  // horizon to the mean band colour (of the capped columns) at 10 degrees below, and stays at the mean below that.
  const average = [0, 1, 2].map((c) => horizon.reduce((sum, v, i) => (i % 3 === c ? sum + v : sum), 0) / width);
  const fade = height / 18;
  for (let y = 0; y < half; y++) {
    const factor = 0.5 + (0.5 * y) / Math.max(1, half - 1);
    const t = Math.min(1, (half - 1 - y) / fade);
    const blend = t * t * (3 - 2 * t); // smoothstep
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = (blurred[x * 3 + c] * (1 - blend) + average[c] * blend) * factor;
      data[o + 3] = 1;
    }
  }
  return true;
}
