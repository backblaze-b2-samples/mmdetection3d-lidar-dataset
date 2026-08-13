import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRunHref,
  readSensorIdFromUrl,
  SENSOR_PARAM,
} from "@/lib/run-deep-link";

describe("createRunHref", () => {
  it("deep-links the create-run form to a sensor log", () => {
    expect(createRunHref("demo-sensor")).toBe(`/runs?${SENSOR_PARAM}=demo-sensor`);
  });

  it("url-encodes sensor ids so odd characters survive the hand-off", () => {
    expect(createRunHref("lot 5/east")).toBe(`/runs?${SENSOR_PARAM}=lot%205%2Feast`);
  });
});

describe("readSensorIdFromUrl", () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = realWindow;
  });

  function stubWindow(href: string) {
    const replaceState = vi.fn();
    (globalThis as { window?: unknown }).window = {
      location: { href },
      history: { replaceState },
    };
    return replaceState;
  }

  it("is null without a DOM, so the server render never touches it", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readSensorIdFromUrl()).toBeNull();
  });

  it("reads ?sensor= WITHOUT stripping it (idempotent under StrictMode remount)", () => {
    const href = "http://localhost:3000/runs?sensor=demo-sensor";
    const replaceState = stubWindow(href);

    // The regression: a consume-on-mount read stripped the param, so the
    // StrictMode survivor saw null. Reading must not mutate the URL, and a
    // second read (the survivor's) must still return the id.
    expect(readSensorIdFromUrl()).toBe("demo-sensor");
    expect(readSensorIdFromUrl()).toBe("demo-sensor");
    expect(replaceState).not.toHaveBeenCalled();
    expect(
      (globalThis as { window: { location: { href: string } } }).window.location.href,
    ).toBe(href);
  });

  it("returns null when there is no sensor param", () => {
    stubWindow("http://localhost:3000/runs");
    expect(readSensorIdFromUrl()).toBeNull();
  });
});
