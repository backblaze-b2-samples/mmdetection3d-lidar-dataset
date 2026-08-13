import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

describe("app identity", () => {
  it("ships the canonical app name and description", () => {
    expect(APP_NAME).toBe("MMDetection3D LiDAR Dataset");
    expect(APP_DESCRIPTION).toBe(
      "Build 3D LiDAR detection & segmentation datasets on Backblaze B2 with MMDetection3D"
    );
  });
});
