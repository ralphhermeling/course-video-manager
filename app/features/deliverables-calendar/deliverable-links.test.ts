import { describe, expect, it } from "vitest";
import { pitchHref } from "./deliverable-links";

describe("pitchHref", () => {
  it("includes from=deliverables so the pitch detail page can navigate back", () => {
    expect(pitchHref("abc-123")).toBe("/pitches/abc-123?from=deliverables");
  });
});
