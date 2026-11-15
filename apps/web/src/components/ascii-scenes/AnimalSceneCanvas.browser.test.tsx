import { expect, it, vi } from "vite-plus/test";

import { fakeTimers, render } from "../../../test/render";
import AnimalSceneCanvas from "./AnimalSceneCanvas";
import { paintAnimalScene } from "./animalCanvas";

vi.mock(import("./animalCanvas"), () => ({ paintAnimalScene: vi.fn() }));

it("keeps animating in the foreground and picks up where it paused", async () => {
  let focused = true;
  using _focus = vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  using _visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  using _timers = fakeTimers();
  const paint = vi.mocked(paintAnimalScene);
  paint.mockClear();
  await using screen = await render(
    <div data-testid="scene" className="h-16 w-16">
      <AnimalSceneCanvas sceneId="fox" appearance="dark" />
    </div>,
    { router: false }, // the canvas lifecycle does not use routes
  );

  await expect.element(screen.getByTestId("scene")).toBeInTheDocument();
  await vi.waitFor(() => expect(paint).toHaveBeenCalled());
  const elapsed = () => paint.mock.calls.at(-1)?.[1].time ?? 0;

  vi.advanceTimersByTime(21_000);
  expect(elapsed()).toBeGreaterThan(20);

  focused = false;
  window.dispatchEvent(new Event("blur"));
  const beforePause = elapsed();
  const framesBeforePause = paint.mock.calls.length;
  vi.advanceTimersByTime(10_000);
  expect(paint).toHaveBeenCalledTimes(framesBeforePause);

  focused = true;
  window.dispatchEvent(new Event("focus"));
  vi.advanceTimersByTime(1_000);
  expect(elapsed() - beforePause).toBeCloseTo(1, 1);
});
