interface Point {
  readonly x: number;
  readonly y: number;
}

interface AnimalTurn {
  x: number;
  y: number;
  angle: number;
  clickAngle: number;
  clickUntil: number;
}

export interface AnimalSteering {
  pointer: Point | undefined;
  click: Point | undefined;
  time: number | undefined;
  readonly turns: Map<number, AnimalTurn>;
}

const clickRadius = 240;
const pointerRadius = 128;
const tau = Math.PI * 2;

export function createAnimalSteering(): AnimalSteering {
  return { pointer: undefined, click: undefined, time: undefined, turns: new Map() };
}

export function beginSteeringFrame(state: AnimalSteering, time: number) {
  if (state.time !== undefined && time < state.time) state.turns.clear();
  const dt = Math.min(0.1, Math.max(0, time - (state.time ?? time)));
  state.time = time;
  const { pointer, click, turns } = state;
  state.click = undefined;
  if (!pointer && !click && turns.size === 0) return;
  return { pointer, click, turns, time, dt, grip: 1 - Math.exp(-7 * dt) };
}

function shortestTurn(angle: number) {
  return angle - tau * Math.floor((angle + Math.PI) / tau);
}

export function steerAnimal(
  frame: NonNullable<ReturnType<typeof beginSteeringFrame>>,
  id: number,
  x: number,
  y: number,
  course: number,
  speed: number,
) {
  let hover = 0;
  let click: { angle: number; until: number } | undefined;
  const forwardX = Math.cos(course);
  const forwardY = Math.sin(course);

  if (frame.pointer) {
    const dx = x - frame.pointer.x;
    const dy = y - frame.pointer.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < pointerRadius * pointerRadius) {
      const side = forwardX * dy - forwardY * dx;
      const direction = side === 0 ? (id % 2 === 0 ? 1 : -1) : Math.sign(side);
      hover = direction * 0.64 * (1 - Math.sqrt(distanceSquared) / pointerRadius);
    }
  }

  if (frame.click) {
    const dx = x - frame.click.x;
    const dy = y - frame.click.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < clickRadius * clickRadius) {
      const away = distanceSquared < 1 ? Math.PI : shortestTurn(Math.atan2(dy, dx) - course);
      const side = away === 0 ? (id % 2 === 0 ? 1 : -1) : Math.sign(away);
      const strength = 1 - Math.sqrt(distanceSquared) / clickRadius;
      click = {
        angle: side * Math.max(Math.abs(away), 1.25) * (0.26 + 0.74 * strength),
        until: frame.time + 0.65 + 0.55 * strength,
      };
    }
  }

  let turn = frame.turns.get(id);
  if (!turn) {
    if (hover === 0 && !click) return 0;
    turn = { x: 0, y: 0, angle: 0, clickAngle: 0, clickUntil: 0 };
    frame.turns.set(id, turn);
  }
  if (click) {
    turn.clickAngle = click.angle;
    turn.clickUntil = click.until;
  }

  const target = frame.time < turn.clickUntil ? turn.clickAngle : hover;
  if (target === 0 && Math.abs(turn.angle) <= 0.001) {
    turn.angle = 0;
    return 0;
  }

  turn.angle = shortestTurn(turn.angle + shortestTurn(target - turn.angle) * frame.grip);
  const step = speed * frame.dt;
  turn.x += (Math.cos(course + turn.angle) - forwardX) * step;
  turn.y += (Math.sin(course + turn.angle) - forwardY) * step;
  return turn.angle;
}
