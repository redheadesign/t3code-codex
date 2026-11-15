import type { AnimalSceneId } from "./animalScenes";

export type AnimalColor = readonly [red: number, green: number, blue: number];

export interface AnimalPose {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly span: number;
  readonly heading: number;
  readonly light: number;
}

export interface AnimalInk {
  color: AnimalColor;
  light: number;
  glyphs: string;
  dark: boolean;
}

export interface AnimalPen {
  readonly cellWidth: number;
  readonly cellHeight: number;
  shape(
    pose: AnimalPose,
    extent: number,
    sample: (x: number, y: number, ink: AnimalInk) => boolean,
  ): void;
  accent(
    pose: AnimalPose,
    x: number,
    y: number,
    glyph: string,
    color: AnimalColor,
    fill: AnimalColor,
  ): void;
}

type Texture = keyof typeof glyphsBySurface;
type Tone = AnimalColor | ((x: number, y: number) => AnimalColor);
type Point = readonly [x: number, y: number];

interface Layer {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly tone: Tone;
  readonly texture: Texture;
  coverage(x: number, y: number): number;
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const fract = (value: number) => value - Math.floor(value);
const mix = (from: number, to: number, fraction: number) => from + (to - from) * fraction;

export function animalNoise(x: number, y: number, seed: number): number {
  let sample = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  sample = Math.imul(sample ^ (sample >>> 13), 1274126177);
  return ((sample ^ (sample >>> 16)) >>> 0) / 4294967296;
}

function ell(
  x: number,
  y: number,
  rx: number,
  ry: number,
  tone: Tone,
  texture: Texture = "fur",
): Layer {
  return {
    left: x - rx,
    right: x + rx,
    top: y - ry,
    bottom: y + ry,
    tone,
    texture,
    coverage: (u, v) => ((u - x) / rx) ** 2 + ((v - y) / ry) ** 2,
  };
}

function taperedLine(
  x: number,
  y: number,
  endX: number,
  endY: number,
  startWidth: number,
  endWidth: number,
  tone: Tone,
  texture: Texture = "fur",
): Layer {
  const dx = endX - x;
  const dy = endY - y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const pad = Math.max(startWidth, endWidth);
  return {
    left: Math.min(x, endX) - pad,
    right: Math.max(x, endX) + pad,
    top: Math.min(y, endY) - pad,
    bottom: Math.max(y, endY) + pad,
    tone,
    texture,
    coverage(u, v) {
      const progress = clamp(((u - x) * dx + (v - y) * dy) / lengthSquared, 0, 1);
      const width = mix(startWidth, endWidth, progress);
      return ((u - x - dx * progress) ** 2 + (v - y - dy * progress) ** 2) / (width * width);
    },
  };
}

function polygon(vertices: readonly Point[], tone: Tone, texture: Texture = "fur"): Layer {
  const columns = vertices.map(([x]) => x);
  const rows = vertices.map(([, y]) => y);
  return {
    left: Math.min(...columns),
    right: Math.max(...columns),
    top: Math.min(...rows),
    bottom: Math.max(...rows),
    tone,
    texture,
    coverage(x, y) {
      let inside = false;
      for (let i = 0, previous = vertices.length - 1; i < vertices.length; previous = i++) {
        const [ax, ay] = vertices[previous]!;
        const [bx, by] = vertices[i]!;
        if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) {
          inside = !inside;
        }
      }
      return inside ? 0.45 : 2;
    },
  };
}

const glyphsBySurface = {
  fur: ".:;irsx%#",
  long: "'/;i//:",
  metal: ".:+*",
  ice: ".:;o*",
  dark: "#%@",
};

function paintLayers(pen: AnimalPen, pose: AnimalPose, layers: readonly Layer[], extent: number) {
  const scale = pose.span / pen.cellWidth;
  pen.shape(pose, extent, (x, y, ink) => {
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index]!;
      if (x < layer.left || x > layer.right || y < layer.top || y > layer.bottom) continue;
      const edge = layer.coverage(x, y);
      if (edge > 1) continue;
      const texture = (Math.sin(x * 97 + y * 117) + Math.sin(x * 329 - y * 181)) * 0.035;
      const grain = (animalNoise(x * scale * 1.4, y * scale * 1.4, pose.id) - 0.5) * 0.16;
      ink.color = typeof layer.tone === "function" ? layer.tone(x, y) : layer.tone;
      ink.light = (0.86 + texture + grain - 0.16 * edge - y * 0.3) * pose.light;
      ink.glyphs = glyphsBySurface[layer.texture];
      ink.dark = layer.texture === "dark";
      return true;
    }
    return false;
  });
}

function drawMantaRay(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const flap = Math.sin(phase);
  const finSpan = 0.565 - 0.085 * flap * flap;
  const indigo: AnimalColor = [56, 105, 172];
  const ocean: AnimalColor = [65, 179, 196];
  const jade: AnimalColor = [109, 231, 209];
  const pearl: AnimalColor = [197, 253, 236];
  const dark: AnimalColor = [18, 42, 68];
  const wake = (t: number) => 0.105 * Math.sin(phase * 0.75 - t * 3.4) * t * t;
  const tail = [];
  for (let segment = 0; segment < 6; segment++) {
    const a = segment / 6,
      b = (segment + 1) / 6;
    tail.push(
      taperedLine(
        -0.166 - a * 0.444,
        wake(a),
        -0.166 - b * 0.444,
        wake(b),
        0.023 - 0.019 * a,
        0.023 - 0.019 * b,
        a > 0.46 ? ocean : indigo,
        "ice",
      ),
    );
  }
  paintLayers(pen, pose, tail, 0.65);
  pen.shape(pose, 0.62, (x, y, ink) => {
    const side = Math.abs(y);
    const wing = side / finSpan;
    if (wing > 1) return false;
    const flex = 0.085 * Math.sin(phase - wing * 2.6) * wing * wing;
    const nose = 0.214 - 0.473 * wing ** 1.87 + flex;
    const hem = -0.244 + 0.214 * Math.sin(wing * Math.PI * 0.83) - 0.125 * wing ** 3 + flex;
    if (x > nose || x < hem) return false;
    const rib = (nose - x) / Math.max(0.015, nose - hem);
    const edge = 0.065 + 0.04 * Math.sin(wing * 21 - phase * 0.32);
    const ripple = Math.sin(wing * 48 + rib * 16 - phase * 0.49);
    const chevron = Math.abs(rib - (0.15 + 0.34 * wing)) < 0.094 && wing > 0.155 && wing < 0.63;
    const puncture = animalNoise(x * 114, y * 136, pose.id);
    let color = indigo;
    if (rib < edge && wing > 0.17) color = wing > 0.78 ? pearl : jade;
    else if (chevron) color = wing < 0.37 ? pearl : ocean;
    else if (rib > 0.79 && wing > 0.22) color = ocean;
    else if (wing < 0.14) color = rib > 0.18 ? ocean : jade;
    else if (puncture > 0.945) color = ocean;
    const light =
      (0.89 + 0.14 * ripple + 0.15 * Math.sin(wing * 3.5 + 0.8) - 0.12 * rib) * pose.light;
    ink.color = color;
    ink.light = light;
    ink.glyphs = chevron ? ":=+*" : ".,:;i";
    ink.dark = false;
    return true;
  });
  const horns = [];
  for (const side of [-1, 1]) {
    horns.push(
      taperedLine(
        0.143,
        0.084 * side,
        0.273,
        (0.143 + 0.012 * flap) * side,
        0.051,
        0.028,
        ocean,
        "ice",
      ),
    );
    horns.push(
      taperedLine(
        0.266,
        (0.144 + 0.012 * flap) * side,
        0.318,
        0.124 * side,
        0.03,
        0.01,
        pearl,
        "ice",
      ),
    );
  }
  paintLayers(pen, pose, horns, 0.38);
  for (const side of [-1, 1]) {
    pen.accent(pose, 0.152, 0.122 * side, "o", jade, dark);
  }
}
const foxTrot = { stride: 0.56, support: 0.53, frontReach: 0.295, track: 0.063 };
const foxCoat = {
  spine: [232, 143, 73],
  copper: [219, 114, 58],
  russet: [179, 83, 50],
  flank: [135, 67, 47],
  undercoat: [230, 169, 114],
  cream: [255, 230, 190],
  face: [248, 150, 74],
  ear: [242, 142, 76],
  earShade: [107, 62, 56],
  brush: [187, 91, 52],
  brushShade: [145, 67, 46],
  stocking: [96, 70, 67],
  ink: [33, 25, 30],
} as const;

function foxFur(x: number, y: number): AnimalColor {
  const strands = Math.sin(x * 96 - Math.abs(y) * 158) + 0.43 * Math.sin(x * 59 + y * 83);
  if (Math.abs(y) > 0.098 + strands * 0.008) return foxCoat.flank;
  if (Math.abs(y) > 0.072 + strands * 0.012) return foxCoat.russet;
  if (Math.abs(y) < 0.035 && strands > 0.2) return foxCoat.spine;
  return foxCoat.copper;
}

function foxTailFur(x: number, y: number): AnimalColor {
  const strands = Math.sin(x * 57 + y * 72);
  if (x < -0.605 + strands * 0.012) return strands > -0.43 ? foxCoat.cream : foxCoat.undercoat;
  if (x > -0.403 || strands < -0.57) return foxCoat.brushShade;
  return foxCoat.brush;
}

function sampleFoxFoot(cycle: number, side: number, hind: boolean) {
  const { stride, support, frontReach, track } = foxTrot;
  const phase = fract(cycle + (side > 0 !== hind ? 0.5 : 0));
  const swing = clamp((phase - support) / (1 - support), 0, 1);
  const lift = Math.sin(Math.PI * swing) ** 2;
  const touchdown = frontReach - (hind ? stride / 2 : 0);
  // Subtracting phase holds the paw in place during the supported part of the stride.
  const x = touchdown + stride * (swing * swing * (3 - 2 * swing) - phase);
  return { x, y: side * (track + lift * 0.015), lift };
}

function foxLegLayers(
  foot: ReturnType<typeof sampleFoxFoot>,
  side: number,
  hind: boolean,
  sway: number,
) {
  const jointX = hind ? -0.225 : 0.127;
  const jointY = side * (hind ? 0.049 : 0.055) + sway;
  const bendX = mix(jointX, foot.x, 0.44) + (hind ? 0.042 : -0.044) * (1 + foot.lift * 0.43);
  const bendY = mix(jointY, foot.y, 0.62) + side * 0.016 * foot.lift;
  const toes = hind ? 0.019 : 0.024;
  return [
    taperedLine(jointX, jointY, bendX, bendY, hind ? 0.04 : 0.033, 0.024, foxCoat.russet, "long"),
    taperedLine(bendX, bendY, foot.x, foot.y, 0.024, 0.015, foxCoat.stocking, "long"),
    ell(foot.x + 0.008, foot.y, toes, 0.017, foxCoat.stocking, "dark"),
  ];
}

function foxTailLayers(pose: AnimalPose, phase: number, hipShift: number) {
  const side = pose.id % 2 ? 1 : -1;
  const outline = [
    [-0.284, 0.0, 0.039],
    [-0.378, 0.021, 0.044],
    [-0.481, 0.067, 0.09],
    [-0.558, 0.11, 0.119],
    [-0.638, 0.129, 0.109],
    [-0.712, 0.129, 0.07],
    [-0.782, 0.097, 0.01],
  ] as const;
  const center = (index: number) => {
    const along = index / (outline.length - 1);
    return hipShift + side * outline[index]![1] + 0.052 * along * Math.sin(phase - along * 2.35);
  };
  return outline.slice(1).map(([endX, , endWidth], index) => {
    const [x, , startWidth] = outline[index]!;
    return taperedLine(x, center(index), endX, center(index + 1), startWidth, endWidth, foxTailFur);
  });
}

function drawFox(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const cycle = phase / tau;
  const shoulderShift = 0.015 * Math.sin(phase);
  const hipShift = -0.013 * Math.sin(phase - 0.21);
  const reach = 0.015 * Math.cos(phase * 2 - 0.35);
  const headShift = shoulderShift * 0.62;
  const layers = foxTailLayers(pose, phase, hipShift);
  for (const side of [-1, 1]) {
    layers.push(
      ...foxLegLayers(sampleFoxFoot(cycle, side, true), side, true, hipShift),
      ...foxLegLayers(sampleFoxFoot(cycle, side, false), side, false, shoulderShift),
    );
  }
  layers.push(
    ell(-0.219 - reach, hipShift, 0.111, 0.113, foxFur),
    taperedLine(-0.17 - reach, hipShift, 0.055 + reach, shoulderShift, 0.087, 0.096, foxFur),
    ell(0.043 + reach, shoulderShift, 0.114, 0.126, foxFur),
    taperedLine(0.109, shoulderShift, 0.22 + reach, headShift, 0.077, 0.047, foxCoat.russet),
  );

  const headLength = 0.9,
    headWidth = 0.86;
  const neck = 0.22;
  const head = (x: number, y: number): Point => [
    neck + reach + (x - neck) * headLength,
    headShift + y * headWidth,
  ];
  layers.push(
    polygon(
      [
        head(0.197, -0.076),
        head(0.25, -0.135),
        head(0.337, -0.142),
        head(0.42, -0.083),
        head(0.523, -0.019),
        head(0.523, 0.019),
        head(0.42, 0.083),
        head(0.337, 0.142),
        head(0.25, 0.135),
        head(0.197, 0.076),
      ],
      foxCoat.face,
    ),
  );
  for (const side of [-1, 1]) {
    const point = (x: number, y: number) => head(x, y * side);
    layers.push(
      polygon(
        [
          point(0.19, 0.081),
          point(0.182, 0.213),
          point(0.202, 0.241),
          point(0.23, 0.219),
          point(0.338, 0.129),
        ],
        foxCoat.ear,
      ),
      polygon([point(0.221, 0.112), point(0.22, 0.197), point(0.302, 0.133)], foxCoat.earShade),
      polygon(
        [
          point(0.273, 0.101),
          point(0.337, 0.138),
          point(0.423, 0.079),
          point(0.517, 0.023),
          point(0.438, 0.01),
          point(0.369, 0.034),
          point(0.316, 0.061),
        ],
        foxCoat.cream,
      ),
      ell(...point(0.387, 0.078), 0.028 * headLength, 0.025 * headWidth, foxCoat.ink, "dark"),
    );
  }
  layers.push(ell(...head(0.511, 0), 0.026 * headLength, 0.03 * headWidth, foxCoat.ink, "dark"));
  paintLayers(pen, pose, layers, 0.84);
  if (pose.span >= 18 * pen.cellWidth && pose.span >= 11 * pen.cellHeight) {
    for (const side of [-1, 1]) {
      pen.accent(pose, ...head(0.389, side * 0.077), ".", foxCoat.undercoat, foxCoat.ink);
    }
    pen.accent(pose, ...head(0.518, 0), ".", foxCoat.earShade, foxCoat.ink);
  }
}

const marineInk = {
  ivory: [255, 244, 201],
  teal: [50, 188, 160],
  blue: [70, 146, 242],
  deep: [11, 31, 47],
  ink: [11, 19, 31],
  red: [249, 83, 55],
  coral: [255, 158, 118],
} as const;

function marineHighlight(
  pen: AnimalPen,
  pose: AnimalPose,
  x: number,
  y: number,
  color: AnimalColor,
  dark: AnimalColor = marineInk.ink,
) {
  pen.accent(pose, x, y, "o", color, dark);
}

function turtleSurface(x: number, y: number): AnimalColor {
  const ridge = Math.abs(y) < 0.086 + 0.022 * Math.cos(x * 14);
  const vertical = Math.abs(y);
  const plate = Math.abs(Math.sin((x + 0.06) * 29 - (ridge ? 0 : vertical * 13))) < 0.18;
  const diagonal = Math.abs(vertical - (0.082 + 0.023 * Math.cos(x * 14))) < 0.012;
  if (plate || diagonal) return [244, 207, 113];
  if (vertical > 0.17 || x < -0.22) return [79, 152, 108];
  return ridge ? [115, 206, 138] : [62, 171, 133];
}

function drawSeaTurtle(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const layers = [
    polygon(
      [
        [-0.31, -0.04],
        [-0.46, 0],
        [-0.31, 0.04],
      ],
      marineInk.teal,
      "ice",
    ),
    ell(0.315, 0, 0.13, 0.085, [78, 218, 172], "ice"),
  ];
  for (const side of [-1, 1]) {
    const stroke = Math.sin(phase + side * 0.6);
    const rear = Math.sin(phase + side * 0.6 + 1.8);
    const forwardTip = 0.25 + 0.2 * stroke;
    const forwardSpan = 0.47 - 0.065 * stroke;
    layers.push(
      polygon(
        [
          [0.19, side * 0.12],
          [0.23 + 0.07 * stroke, side * 0.25],
          [forwardTip + 0.035, side * (forwardSpan - 0.035)],
          [forwardTip - 0.035, side * forwardSpan],
          [0.07 + 0.12 * stroke, side * 0.34],
          [0.02, side * 0.18],
        ],
        (_x, y) => (Math.abs(y) > 0.36 ? [98, 225, 170] : [47, 154, 140]),
        "ice",
      ),
      polygon(
        [
          [-0.23, side * 0.13],
          [-0.29, side * 0.25],
          [-0.425 + 0.03 * rear, side * (0.29 + 0.045 * rear)],
          [-0.39 + 0.02 * rear, side * 0.18],
          [-0.3, side * 0.116],
        ],
        [49, 177, 151],
        "ice",
      ),
    );
  }
  layers.push(
    ell(-0.075, 0, 0.277, 0.228, [249, 220, 139], "metal"),
    ell(-0.084, 0, 0.249, 0.198, turtleSurface, "ice"),
    ell(0.371, 0, 0.083, 0.063, [106, 234, 169], "ice"),
  );
  paintLayers(pen, { ...pose, light: 1.19 }, layers, 0.58);
  if (pose.span / pen.cellWidth > 13) {
    for (const side of [-1, 1])
      marineHighlight(pen, pose, 0.391, side * 0.039, marineInk.ivory, marineInk.deep);
  }
}

function octopusArmRows(phase: number) {
  const arms: Layer[] = [];
  for (const side of [-1, 1]) {
    for (let arm = 0; arm < 4; arm++) {
      const wave = Math.sin(phase + arm * 0.87 + side * 0.65);
      const angle = [1.06, 1.69, 2.26, 2.77][arm]! + wave * 0.24;
      const span = [0.4, 0.49, 0.56, 0.56][arm]!;
      const startX = 0.04 - arm * 0.031;
      const startY = side * (0.12 - arm * 0.016);
      let previousX = startX;
      let previousY = startY;
      for (let part = 1; part <= 5; part++) {
        const step = part / 5;
        const travel = angle + 0.57 * Math.sin(step * 3.9 + phase * 0.78 + arm) * step;
        const x = startX + Math.cos(travel) * step * span;
        const y = startY + side * Math.sin(travel) * step * span;
        const base = 0.064 - arm * 0.003;
        const previousWidth = Math.max(0.023, base * (1 - ((part - 1) / 5) * 0.75));
        const width = Math.max(0.023, base * (1 - step * 0.75));
        const tone: AnimalColor = part % 2 === 0 ? marineInk.coral : [249, 108, 89];
        arms.push(taperedLine(previousX, previousY, x, y, previousWidth, width, tone, "ice"));
        previousX = x;
        previousY = y;
      }
    }
  }
  return arms;
}

function drawOctopus(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const pulse = 1 + 0.085 * Math.sin(phase);
  const arms = octopusArmRows(phase);
  arms.push(
    ell(
      0.12,
      0,
      0.21 * pulse,
      0.203 / pulse,
      (x, y) => (Math.abs(y) < 0.105 && x > 0.13 ? [255, 159, 108] : [245, 93, 78]),
      "fur",
    ),
    ell(0.224, -0.061, 0.085, 0.068, [255, 201, 151], "ice"),
    ell(0.027, 0, 0.119, 0.144, [242, 105, 110], "fur"),
  );
  paintLayers(pen, { ...pose, light: 1.22 }, arms, 0.65);
  if (pose.span / pen.cellWidth > 13) {
    for (const side of [-1, 1]) marineHighlight(pen, pose, 0.084, side * 0.156, marineInk.ivory);
  }
}

function goldfishSurface(x: number, y: number): AnimalColor {
  const abs = Math.abs(y);
  if (x > 0.122 && x < 0.147 - abs * 0.18) return [255, 241, 184];
  const row = Math.floor((y + 0.18) * 59);
  const scale = Math.sin(x * 87 + row * 1.5) - Math.abs(Math.sin(y * 168)) * 0.56;
  if (scale > 0.57) return [255, 232, 132];
  if (abs > 0.125 || x < -0.12) return [241, 85, 48];
  return x > 0.14 ? [255, 177, 83] : [255, 138, 56];
}

function drawGoldfish(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const kick = Math.sin(phase);
  const layers = [];
  for (const side of [-1, 1]) {
    const flare = 0.176 + 0.072 * Math.cos(phase + side * 0.82);
    const sweep = 0.125 * kick;
    layers.push(
      polygon(
        [
          [-0.2, 0.023 * kick],
          [-0.35, side * 0.07 + sweep * 0.6],
          [-0.52, side * flare * 0.94 + sweep],
          [-0.61, side * flare * 0.68 + sweep],
          [-0.55, side * 0.042 + sweep],
          [-0.39, side * 0.011 + sweep * 0.56],
          [-0.23, 0.022 * kick],
        ],
        (x, y) => {
          const stripe = Math.sin((y - sweep * 0.8) * 68 + x * side * 11);
          return stripe > 0.57 ? [255, 223, 134] : stripe < -0.42 ? [231, 72, 51] : [255, 139, 73];
        },
        "ice",
      ),
      polygon(
        [
          [0.115, side * 0.105],
          [0.055, side * 0.2],
          [-0.09 + 0.039 * Math.sin(phase + side), side * 0.241],
          [-0.082, side * 0.126],
        ],
        [252, 124, 60],
        "ice",
      ),
    );
  }
  layers.push(
    taperedLine(-0.28, 0.026 * kick, -0.155, 0, 0.036, 0.072, marineInk.red, "ice"),
    ell(0.01, 0, 0.258, 0.167, goldfishSurface, "fur"),
    ell(0.212, 0, 0.084, 0.091, [252, 183, 104], "ice"),
  );
  paintLayers(pen, { ...pose, light: 1.25 }, layers, 0.68);
  if (pose.span / pen.cellWidth > 13) {
    for (const side of [-1, 1]) marineHighlight(pen, pose, 0.186, side * 0.094, marineInk.ivory);
  }
}

function dolphinSurface(x: number, y: number): AnimalColor {
  const abs = Math.abs(y);
  if (abs > 0.104 && x > -0.2) return [212, 241, 255];
  if (y < -0.046) return [136, 204, 250];
  if (Math.abs(y) < 0.031 && x < 0.171) return [70, 147, 232];
  return [89, 170, 237];
}

function drawDolphin(pen: AnimalPen, pose: AnimalPose, phase: number) {
  const kick = Math.sin(phase);
  const bank = 0.055 * Math.sin(phase * 0.51);
  const tailX = -0.46 + 0.028 * Math.cos(phase);
  const tailY = 0.076 * kick;
  const layers = [
    polygon(
      [
        [tailX + 0.036, tailY - 0.04],
        [tailX + 0.011, tailY - 0.135],
        [tailX - 0.11, tailY - 0.238],
        [tailX - 0.096, tailY - 0.124],
        [tailX - 0.056, tailY],
        [tailX - 0.101, tailY + 0.139],
        [tailX - 0.084, tailY + 0.231],
        [tailX + 0.018, tailY + 0.121],
        [tailX + 0.042, tailY + 0.034],
      ],
      (x, y) => (Math.abs(y - tailY) > 0.149 ? [168, 221, 248] : marineInk.blue),
      "ice",
    ),
    taperedLine(-0.24, 0, tailX, tailY, 0.075, 0.038, [104, 167, 227], "ice"),
  ];
  for (const side of [-1, 1]) {
    layers.push(
      polygon(
        [
          [0.153, side * 0.071],
          [0.087, side * (0.228 + bank * side)],
          [-0.117, side * (0.326 + bank * side)],
          [-0.093, side * 0.198],
          [0.001, side * 0.094],
        ],
        (_x, y) => (Math.abs(y) > 0.227 ? [179, 223, 255] : [52, 101, 180]),
        "ice",
      ),
    );
  }
  layers.push(
    taperedLine(-0.223, 0, 0.12, 0, 0.083, 0.127, dolphinSurface, "ice"),
    ell(0.129, 0, 0.159, 0.126, dolphinSurface, "ice"),
    taperedLine(0.21, 0, 0.395, 0, 0.061, 0.036, [181, 224, 251], "ice"),
    ell(0.285, 0, 0.09, 0.038, [132, 196, 246], "ice"),
    polygon(
      [
        [0.076, -0.019],
        [-0.117, -0.023],
        [-0.2, 0.085 + bank],
        [-0.126, 0.06 + bank],
      ],
      [64, 110, 185],
      "ice",
    ),
  );
  paintLayers(pen, { ...pose, light: 1.23 }, layers, 0.64);
  if (pose.span / pen.cellWidth > 13) {
    for (const side of [-1, 1]) marineHighlight(pen, pose, 0.231, side * 0.078, [203, 238, 255]);
  }
}

interface AnimalArtwork {
  readonly speed: number;
  readonly scale: number;
  readonly cadence?: number;
  readonly strideLength?: number;
  readonly draw: (pen: AnimalPen, pose: AnimalPose, phase: number) => void;
}

export const animalArtworks: Readonly<Record<AnimalSceneId, AnimalArtwork>> = {
  fox: {
    speed: 112,
    scale: 1.43,
    strideLength: foxTrot.stride,
    draw: drawFox,
  },
  manta: {
    speed: 68,
    scale: 1.57,
    cadence: 4.25,
    draw: drawMantaRay,
  },
  "sea-turtle": {
    speed: 66,
    scale: 1.39,
    cadence: 4.4,
    draw: drawSeaTurtle,
  },
  octopus: {
    speed: 70,
    scale: 1.38,
    cadence: 4.1,
    draw: drawOctopus,
  },
  goldfish: {
    speed: 91,
    scale: 1.3,
    cadence: 7.6,
    draw: drawGoldfish,
  },
  dolphin: {
    speed: 114,
    scale: 1.42,
    cadence: 6.4,
    draw: drawDolphin,
  },
};
