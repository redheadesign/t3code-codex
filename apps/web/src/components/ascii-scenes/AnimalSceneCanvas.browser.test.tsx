import { expect, it, vi } from "vite-plus/test";

import { fakeTimers, render } from "../../../test/render";
import AnimalSceneCanvas from "./AnimalSceneCanvas";
import { paintAnimalScene } from "./animalCanvas";
import { ComposerDust } from "./ComposerDust";

vi.mock(import("./animalCanvas"), () => ({ paintAnimalScene: vi.fn() }));

it("keeps the animals and composer stars moving past 20 seconds and pauses in the background", async () => {
  let focused = true;
  using _focus = vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  using _visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  using _timers = fakeTimers();
  const paint = vi.mocked(paintAnimalScene);
  paint.mockClear();
  await using screen = await render(
    <div data-testid="scene" className="h-16 w-16">
      <AnimalSceneCanvas sceneId="fox" appearance="dark" />
      <ComposerDust appearance="dark" />
    </div>,
    { router: false }, // the canvas lifecycle does not use routes
  );

  await expect.element(screen.getByTestId("scene")).toBeInTheDocument();
  await vi.waitFor(() => expect(paint).toHaveBeenCalled());
  const elapsed = () => paint.mock.calls.at(-1)?.[1].time ?? 0;
  const dust = screen.container.querySelector<HTMLCanvasElement>("[data-ascii-composer-dust]")!;

  vi.advanceTimersByTime(21_000);
  expect(elapsed()).toBeGreaterThan(20);
  const starsBeforePause = dust.toDataURL();

  focused = false;
  window.dispatchEvent(new Event("blur"));
  const beforePause = elapsed();
  const framesBeforePause = paint.mock.calls.length;
  vi.advanceTimersByTime(10_000);
  expect(paint).toHaveBeenCalledTimes(framesBeforePause);
  expect(dust.toDataURL()).toBe(starsBeforePause);

  focused = true;
  window.dispatchEvent(new Event("focus"));
  vi.advanceTimersByTime(1_000);
  expect(elapsed() - beforePause).toBeCloseTo(1, 1);
  expect(dust.toDataURL()).not.toBe(starsBeforePause);
});

it("routes background pointer input without treating controls or keyboard activation as scene clicks", async () => {
  using _focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  using _visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  using _timers = fakeTimers();
  const paint = vi.mocked(paintAnimalScene);
  paint.mockClear();
  const onClick = vi.fn();
  await using screen = await render(
    <div data-testid="scene" className="relative h-40 w-64">
      <div data-ascii-home-artwork>
        <AnimalSceneCanvas sceneId="fox" appearance="dark" />
      </div>
      <div data-chat-composer-stack>
        <button type="button" onClick={onClick}>
          Choose model
        </button>
      </div>
    </div>,
    { router: false }, // the canvas lifecycle does not use routes
  );

  await vi.waitFor(() => expect(paint).toHaveBeenCalled());
  vi.advanceTimersByTime(100);
  const host = screen.getByTestId("scene").element();
  const canvas = screen.container.querySelector("canvas")!;
  const { left, top } = canvas.getBoundingClientRect();
  const coords = { clientX: left + 20, clientY: top + 15 };

  host.dispatchEvent(
    new PointerEvent("pointermove", {
      ...coords,
      bubbles: true,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  vi.advanceTimersByTime(100);
  const steering = paint.mock.calls.at(-1)?.[2];
  expect(steering?.pointer).toEqual({ x: 20, y: 15 });

  const control = screen.getByRole("button", { name: "Choose model" }).element();
  control.dispatchEvent(new MouseEvent("click", { ...coords, bubbles: true, detail: 1 }));
  expect(onClick).toHaveBeenCalledOnce();
  host.dispatchEvent(new MouseEvent("click", { ...coords, bubbles: true, detail: 0 }));
  expect(steering?.click).toBeUndefined();

  host.dispatchEvent(new MouseEvent("click", { ...coords, bubbles: true, detail: 1 }));
  expect(steering?.click).toEqual({ x: 20, y: 15 });
  host.dispatchEvent(new PointerEvent("pointerleave"));
  expect(steering?.pointer).toBeUndefined();
});

it("updates character size while reduced motion holds the scene still", async () => {
  using _visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const native = window.matchMedia.bind(window);
  using _media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const media = native(query);
    if (query === "(prefers-reduced-motion: reduce)")
      Object.defineProperty(media, "matches", { value: true });
    return media;
  });
  const paint = vi.mocked(paintAnimalScene);
  paint.mockClear();
  const scene = (cellScale: number) => (
    <AnimalSceneCanvas sceneId="manta" appearance="dark" cellScale={cellScale} />
  );
  await using screen = await render(scene(1), { router: false }); // the canvas lifecycle does not use routes
  await vi.waitFor(() =>
    expect(paint.mock.calls.at(-1)?.[1]).toMatchObject({ cellScale: 1, time: 0 }),
  );
  await screen.rerender(scene(0.75));
  expect(paint.mock.calls.at(-1)?.[1]).toMatchObject({ cellScale: 0.75, time: 0 });
});
