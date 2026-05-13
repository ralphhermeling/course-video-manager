import { describe, it, expect, beforeEach } from "vitest";
import {
  getDiagramFocusedDuringClip,
  notifyDiagramFocus,
  startDiagramFocusTracking,
  stopDiagramFocusTracking,
} from "./diagram-focus-tracking";

beforeEach(() => {
  stopDiagramFocusTracking();
});

describe("diagram focus tracking", () => {
  it("ignores focus events that arrive before clip-start", () => {
    notifyDiagramFocus();
    startDiagramFocusTracking();
    expect(getDiagramFocusedDuringClip()).toBe(false);
  });

  it("records focus events that arrive between start and read", () => {
    startDiagramFocusTracking();
    notifyDiagramFocus();
    expect(getDiagramFocusedDuringClip()).toBe(true);
  });

  it("does not leak focus from clip N to clip N+1", () => {
    startDiagramFocusTracking();
    notifyDiagramFocus();
    expect(getDiagramFocusedDuringClip()).toBe(true);

    // clip N persists, next clip-start begins
    startDiagramFocusTracking();
    expect(getDiagramFocusedDuringClip()).toBe(false);
  });

  it("ignores focus after tracking stops", () => {
    startDiagramFocusTracking();
    stopDiagramFocusTracking();
    notifyDiagramFocus();
    expect(getDiagramFocusedDuringClip()).toBe(false);
  });

  it("requires an explicit start after stop — focus during the gap is dropped", () => {
    startDiagramFocusTracking();
    notifyDiagramFocus();
    stopDiagramFocusTracking();
    // gap between sessions: any focus here must not contaminate the next session
    notifyDiagramFocus();
    notifyDiagramFocus();
    startDiagramFocusTracking();
    expect(getDiagramFocusedDuringClip()).toBe(false);
  });
});
