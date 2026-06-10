import { describe, expect, it } from "vitest";
import { resolveSegmentTab } from "./segment-tab";

describe("resolveSegmentTab", () => {
  it("honours a persisted tab that still exists (segments)", () => {
    expect(
      resolveSegmentTab({
        persistedTab: "segments",
        hasSegments: true,
        hasReference: true,
      })
    ).toBe("segments");
  });

  it("honours a persisted tab that still exists (reference)", () => {
    expect(
      resolveSegmentTab({
        persistedTab: "reference",
        hasSegments: true,
        hasReference: true,
      })
    ).toBe("reference");
  });

  it("falls back when the persisted tab no longer exists (reference removed)", () => {
    expect(
      resolveSegmentTab({
        persistedTab: "reference",
        hasSegments: true,
        hasReference: false,
      })
    ).toBe("segments");
  });

  it("falls back when the persisted tab no longer exists (segments gone)", () => {
    expect(
      resolveSegmentTab({
        persistedTab: "segments",
        hasSegments: false,
        hasReference: true,
      })
    ).toBe("reference");
  });

  it("defaults to reference when one is selected and nothing persisted", () => {
    expect(
      resolveSegmentTab({
        persistedTab: null,
        hasSegments: true,
        hasReference: true,
      })
    ).toBe("reference");
  });

  it("defaults to segments when no reference and nothing persisted", () => {
    expect(
      resolveSegmentTab({
        persistedTab: null,
        hasSegments: true,
        hasReference: false,
      })
    ).toBe("segments");
  });

  it("returns null when neither tab is available", () => {
    expect(
      resolveSegmentTab({
        persistedTab: null,
        hasSegments: false,
        hasReference: false,
      })
    ).toBeNull();
  });

  it("returns null when neither exists even if a stale tab was persisted", () => {
    expect(
      resolveSegmentTab({
        persistedTab: "segments",
        hasSegments: false,
        hasReference: false,
      })
    ).toBeNull();
  });
});
