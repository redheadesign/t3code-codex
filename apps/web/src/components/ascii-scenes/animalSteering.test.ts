import { expect, it } from "vite-plus/test";

import { beginSteeringFrame, createAnimalSteering, steerAnimal } from "./animalSteering";

it("glides away from a nearby pointer and eases back onto its course when the pointer leaves", () => {
  const state = createAnimalSteering();
  expect(beginSteeringFrame(state, 0)).toBeUndefined();

  state.pointer = { x: 125, y: 80 };
  const pass = beginSteeringFrame(state, 0.05)!;
  expect(steerAnimal(pass, 0, 100, 100, 0, 90)).toBeGreaterThan(0);
  expect(state.turns.get(0)?.y).toBeGreaterThan(0);
  expect(steerAnimal(pass, 1, 500, 450, 0, 90)).toBe(0);

  state.pointer = undefined;
  const angle = state.turns.get(0)!.angle;
  const after = beginSteeringFrame(state, 0.1)!;
  expect(steerAnimal(after, 0, 100, 100, 0, 90)).toBeLessThan(angle);
  expect(state.turns.get(0)?.y).toBeGreaterThan(0);
});

it("keeps a local click turn for several frames without teleporting the animal", () => {
  const state = createAnimalSteering();
  beginSteeringFrame(state, 0);
  state.click = { x: 120, y: 100 };
  const pass = beginSteeringFrame(state, 0.05)!;
  expect(steerAnimal(pass, 1, 100, 100, 0, 90)).not.toBe(0);
  expect(steerAnimal(pass, 2, 395, 100, 0, 90)).toBe(0);
  expect(state.click).toBeUndefined();
  expect(Math.abs(state.turns.get(1)!.x)).toBeLessThan(9);

  for (let frame = 2; frame <= 12; frame += 1) {
    steerAnimal(beginSteeringFrame(state, frame * 0.05)!, 1, 100, 100, 0, 90);
  }
  expect(Math.abs(state.turns.get(1)!.angle)).toBeGreaterThan(Math.PI / 2);
});
