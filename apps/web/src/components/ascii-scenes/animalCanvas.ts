import {
  animalArtworks,
  animalNoise,
  type AnimalColor,
  type AnimalInk,
  type AnimalPen,
  type AnimalPose,
} from "./animalArtwork";
import { animalScenes, type AnimalSceneId } from "./animalScenes";
import { beginSteeringFrame, steerAnimal, type AnimalSteering } from "./animalSteering";

interface AnimalSceneFrame {
  readonly sceneId: AnimalSceneId;
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly appearance: "dark" | "light";
  readonly cellScale?: number;
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function wrap(value: number, size: number) {
  return value - size * Math.floor(value / size);
}

const palette = new Map<number, string>();

function cellColor([red, green, blue]: AnimalColor, light: number) {
  const shade = clamp(Math.round(light * 12), 2, 17);
  const key = ((red * 256 + green) * 256 + blue) * 18 + shade;
  const existing = palette.get(key);
  if (existing !== undefined) return existing;
  const scale = shade / 12;
  const color = `rgb(${Math.min(255, Math.round(red * scale))}, ${Math.min(255, Math.round(green * scale))}, ${Math.min(255, Math.round(blue * scale))})`;
  palette.set(key, color);
  return color;
}

function createAnimalPen(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellWidth: number,
  appearance: AnimalSceneFrame["appearance"],
): AnimalPen {
  const cellHeight = Math.round(cellWidth * 1.43);
  const lightMode = appearance === "light";
  const columns = Math.ceil(width / cellWidth);
  const rows = Math.ceil(height / cellHeight);
  const ink: AnimalInk = { color: [0, 0, 0], light: 1, glyphs: ".", dark: false };
  context.font = `${cellHeight - 1}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  function paintCell(
    column: number,
    row: number,
    color: AnimalColor,
    light: number,
    glyph: string,
    dark: boolean,
    foreground?: AnimalColor,
  ) {
    const x = column * cellWidth;
    const y = row * cellHeight;
    context.fillStyle = cellColor(color, light * (lightMode && !dark ? 0.8 : 1));
    context.globalAlpha = dark ? 0.92 : lightMode ? 0.71 : 0.79;
    context.fillRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
    context.fillStyle = foreground
      ? cellColor(foreground, 1)
      : dark || lightMode
        ? "#fff7ed"
        : "#0c101a";
    context.globalAlpha = dark ? 0.5 : 0.88;
    context.fillText(glyph, x + cellWidth / 2, y + cellHeight / 2 + 0.25);
  }

  return {
    cellWidth,
    cellHeight,
    shape(pose, extent, sample) {
      const radius = pose.span * extent;
      const left = Math.max(0, Math.floor((pose.x - radius) / cellWidth));
      const right = Math.min(columns, Math.ceil((pose.x + radius) / cellWidth));
      const top = Math.max(0, Math.floor((pose.y - radius) / cellHeight));
      const bottom = Math.min(rows, Math.ceil((pose.y + radius) / cellHeight));
      const cosine = Math.cos(pose.heading) / pose.span;
      const sine = Math.sin(pose.heading) / pose.span;
      for (let row = top; row < bottom; row++) {
        const dy = (row + 0.5) * cellHeight - pose.y;
        for (let column = left; column < right; column++) {
          const dx = (column + 0.5) * cellWidth - pose.x;
          const x = dx * cosine + dy * sine;
          const y = dy * cosine - dx * sine;
          if (!sample(x, y, ink)) continue;
          const grain = animalNoise(Math.round(x * 48), Math.round(y * 48), pose.id);
          const glyph = ink.glyphs.charAt(Math.floor(grain * ink.glyphs.length));
          paintCell(column, row, ink.color, ink.light, glyph, ink.dark);
        }
      }
    },
    accent(pose, x, y, glyph, color, fill) {
      const cosine = Math.cos(pose.heading) * pose.span;
      const sine = Math.sin(pose.heading) * pose.span;
      const column = Math.floor((pose.x + x * cosine - y * sine) / cellWidth);
      const row = Math.floor((pose.y + x * sine + y * cosine) / cellHeight);
      paintCell(column, row, fill, 1, glyph, true, color);
    },
  };
}

const mantaCellWidth = 6;
const mantaSpriteSize = 288;
const mantaSpriteSpan = 196;
const mantaSpritePhases = 24;
const mantaSpriteHeadings = [-0.59, -0.42, -0.25] as const;
const maxMantaSpriteBuildsPerFrame = 4;

let mantaSprites:
  | {
      readonly appearance: AnimalSceneFrame["appearance"];
      readonly cellWidth: number;
      readonly scaleX: number;
      readonly scaleY: number;
      readonly phases: Array<HTMLCanvasElement | undefined>;
    }
  | undefined;

function buildMantaSprite(
  phase: number,
  heading: number,
  scaleX: number,
  scaleY: number,
  appearance: AnimalSceneFrame["appearance"],
  cellWidth: number,
  width: number,
  height: number,
) {
  const sprite = document.createElement("canvas");
  sprite.width = Math.ceil(width * scaleX);
  sprite.height = Math.ceil(height * scaleY);
  const context = sprite.getContext("2d");
  if (!context) return undefined;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  const pen = createAnimalPen(context, width, height, cellWidth, appearance);
  const pose = { id: 0, x: width / 2, y: height / 2, span: mantaSpriteSpan, heading, light: 1.06 };
  animalArtworks.manta.draw(pen, pose, (phase * tau) / mantaSpritePhases);
  return sprite;
}

function createMantaSpritePainter(
  context: CanvasRenderingContext2D,
  appearance: AnimalSceneFrame["appearance"],
  pen: AnimalPen,
) {
  const { a: scaleX, d: scaleY } = context.getTransform();
  const { cellWidth, cellHeight } = pen;
  const spriteWidth = Math.ceil(mantaSpriteSize / cellWidth) * cellWidth;
  const spriteHeight = Math.ceil(mantaSpriteSize / cellHeight) * cellHeight;
  if (
    mantaSprites?.appearance !== appearance ||
    mantaSprites.cellWidth !== cellWidth ||
    mantaSprites.scaleX !== scaleX ||
    mantaSprites.scaleY !== scaleY
  ) {
    mantaSprites = { appearance, cellWidth, scaleX, scaleY, phases: [] };
  }
  const { phases } = mantaSprites;
  let buildsRemaining = maxMantaSpriteBuildsPerFrame;

  return (pose: AnimalPose, phase: number, turn: number) => {
    const heading = pose.id % mantaSpriteHeadings.length;
    const offset = heading * mantaSpritePhases;
    const index = Math.floor((wrap(phase, tau) * mantaSpritePhases) / tau);
    const key = offset + index;
    let sprite = phases[key];
    if (!sprite && buildsRemaining > 0) {
      buildsRemaining--;
      sprite = buildMantaSprite(
        index,
        mantaSpriteHeadings[heading]!,
        scaleX,
        scaleY,
        appearance,
        cellWidth,
        spriteWidth,
        spriteHeight,
      );
      phases[key] = sprite;
    }
    if (!sprite) {
      for (let distance = 1; distance <= mantaSpritePhases / 2 && !sprite; distance++) {
        sprite =
          phases[offset + ((index + distance) % mantaSpritePhases)] ??
          phases[offset + ((index + mantaSpritePhases - distance) % mantaSpritePhases)];
      }
      sprite ??= phases.find(Boolean);
    }
    if (!sprite) return false;

    // Align the cached pixels to the backing canvas so the ASCII characters stay sharp.
    const x = Math.round((pose.x - spriteWidth / 2) * scaleX) / scaleX;
    const y = Math.round((pose.y - spriteHeight / 2) * scaleY) / scaleY;
    context.globalAlpha = 1;
    const width = sprite.width / scaleX;
    const height = sprite.height / scaleY;
    if (turn === 0) {
      context.drawImage(sprite, x, y, width, height);
    } else {
      context.save();
      context.translate(x + width / 2, y + height / 2);
      context.rotate(turn);
      context.imageSmoothingEnabled = false;
      context.drawImage(sprite, -width / 2, -height / 2, width, height);
      context.restore();
    }
    return true;
  };
}

export function paintAnimalScene(
  context: CanvasRenderingContext2D,
  frame: AnimalSceneFrame,
  steering?: AnimalSteering,
) {
  const { sceneId, width, height, time, appearance, cellScale = 1 } = frame;
  if (width <= 0 || height <= 0) return;
  context.clearRect(0, 0, width, height);
  context.save();
  const artwork = animalArtworks[sceneId];
  const swatch = animalScenes.find(({ id }) => id === sceneId)!.swatch;
  const areaPerAnimal = 104_000;
  const compactPopulation = 12;
  const compactSpanLimit = 214;
  const area = width * height;
  const count = clamp(Math.round(area / areaPerAnimal), width < 560 ? 4 : 5, 24);
  const isExpanded = count > compactPopulation;
  const columns = isExpanded
    ? clamp(Math.round(Math.sqrt((count * width) / height)), 1, count)
    : width < 560
      ? 2
      : width < 940
        ? 3
        : 4;
  const rows = Math.ceil(count / columns);
  const linearScale = Math.sqrt(area / (areaPerAnimal * compactPopulation));
  const spanLimit = compactSpanLimit * clamp(1 + (linearScale - 1) * 0.35, 1, 1.45);
  const isManta = sceneId === "manta";
  const baseSpan = clamp(
    Math.min(width, height) * 0.2 * artwork.scale,
    60,
    isManta ? compactSpanLimit : spanLimit,
  );
  // Coarser cells keep the sampling work bounded as more animals fit on screen.
  const cellDensityScale = Math.max(
    1,
    (baseSpan / compactSpanLimit) * Math.sqrt(count / compactPopulation),
  );
  const adaptiveCellWidth = isManta
    ? clamp(Math.round(width / 185), 5, mantaCellWidth)
    : Math.ceil(clamp(Math.round(width / 185), 5, 9) * cellDensityScale);
  const cellWidth = Math.round(adaptiveCellWidth * clamp(cellScale, 0.75, 1.5));
  const pen = createAnimalPen(context, width, height, cellWidth, appearance);
  const paintManta =
    isManta && isExpanded ? createMantaSpritePainter(context, appearance, pen) : undefined;
  const margin = baseSpan * 0.95;
  const flightWidth = width + 2 * margin;
  const flightHeight = height + 2 * margin;
  const motion = steering ? beginSteeringFrame(steering, time) : undefined;
  for (let id = 0; id < count; id++) {
    const span = baseSpan * (0.72 + 0.37 * animalNoise(id, 78, 12));
    const column = id % columns;
    const row = Math.floor(id / columns);
    const rowColumns = isExpanded ? Math.min(columns, count - row * columns) : columns;
    const startX = (width * (column + 0.2 + 0.6 * animalNoise(id, 6, 26))) / rowColumns;
    const startY = (height * (row + 0.18 + 0.64 * animalNoise(id, 3, 60))) / rows;
    const course = -0.57 + 0.35 * animalNoise(id, 45, 12);
    const pace = 0.36 + 0.16 * animalNoise(id, 3, 78);
    const distance = time * artwork.speed * pace;
    const sway = 0.16 * Math.sin(time * 0.7 + id * 2.2);
    const offset = motion?.turns.get(id);
    const x =
      wrap(margin + startX + Math.cos(course) * distance + (offset?.x ?? 0), flightWidth) - margin;
    const y =
      wrap(
        margin + startY + Math.sin(course) * distance + sway * span * 0.25 + (offset?.y ?? 0),
        flightHeight,
      ) - margin;
    const turn = motion ? steerAnimal(motion, id, x, y, course, artwork.speed * pace) : 0;
    if (x < -span || x > width + span || y < -span || y > height + span) continue;
    const heading = course + sway + turn;
    const pose: AnimalPose = { id, x, y, span, heading, light: 1.06 };
    const phase =
      (artwork.strideLength
        ? (tau * distance) / (span * artwork.strideLength)
        : time * (artwork.cadence ?? 5) * (0.8 + animalNoise(id, 87, 4) * 0.26)) +
      tau * animalNoise(id, 11, 59);

    context.fillStyle = swatch;
    for (let index = 0; index < 5; index++) {
      const distance = span * (0.53 + index * 0.052);
      const drift = Math.sin(phase * 0.43 - index + id) * pen.cellHeight;
      const wakeX = x - Math.cos(heading) * distance;
      const wakeY = y - Math.sin(heading) * distance + drift;
      context.globalAlpha = (appearance === "dark" ? 0.46 : 0.65) * (1 - index * 0.17);
      context.fillText(
        index % 3 === 0 ? ":" : ".",
        (Math.floor(wakeX / pen.cellWidth) + 0.5) * pen.cellWidth,
        (Math.floor(wakeY / pen.cellHeight) + 0.5) * pen.cellHeight,
      );
    }

    if (!paintManta?.(pose, phase, turn)) artwork.draw(pen, pose, phase);
  }
  context.restore();
}
