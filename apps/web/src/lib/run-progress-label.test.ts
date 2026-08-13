import { describe, expect, it } from "vitest";
import {
  frameProgressLabel,
  frameProgressPercent,
  runProgressLabel,
} from "@/lib/run-progress-label";

describe("runProgressLabel", () => {
  it("shows the determinate frame count and resolved device", () => {
    expect(runProgressLabel(40, "cpu")).toBe("Processing 40 frames on CPU…");
  });

  it("uses a singular noun for a one-frame log", () => {
    expect(runProgressLabel(1, "cuda")).toBe("Processing 1 frame on CUDA…");
  });

  it("omits the device clause until it resolves past 'auto'", () => {
    expect(runProgressLabel(12, "auto")).toBe("Processing 12 frames…");
    expect(runProgressLabel(12, undefined)).toBe("Processing 12 frames…");
  });

  it("falls back to a generic line when the count is unknown", () => {
    expect(runProgressLabel(undefined, "cpu")).toBe(
      "Running MMDetection3D over the sensor log…",
    );
    expect(runProgressLabel(0, "cpu")).toBe(
      "Running MMDetection3D over the sensor log…",
    );
  });
});

describe("frameProgressLabel", () => {
  it("shows the advancing frame position once both counts are known", () => {
    expect(frameProgressLabel(0, 11)).toBe("Frame 0 of 11");
    expect(frameProgressLabel(5, 11)).toBe("Frame 5 of 11");
  });

  it("clamps a late-arriving annotation so X never exceeds N", () => {
    expect(frameProgressLabel(12, 11)).toBe("Frame 11 of 11");
  });

  it("is null until the processed count and total are both known", () => {
    expect(frameProgressLabel(undefined, 11)).toBeNull();
    expect(frameProgressLabel(3, undefined)).toBeNull();
    expect(frameProgressLabel(0, 0)).toBeNull();
  });
});

describe("frameProgressPercent", () => {
  it("is a determinate width from processed / total", () => {
    expect(frameProgressPercent(0, 10)).toBe(0);
    expect(frameProgressPercent(5, 10)).toBe(50);
    expect(frameProgressPercent(10, 10)).toBe(100);
  });

  it("clamps to 0–100 so an off-by-one never overflows the track", () => {
    expect(frameProgressPercent(12, 11)).toBe(100);
  });

  it("is null until the processed count and total are both known", () => {
    expect(frameProgressPercent(undefined, 10)).toBeNull();
    expect(frameProgressPercent(4, undefined)).toBeNull();
    expect(frameProgressPercent(1, 0)).toBeNull();
  });
});
