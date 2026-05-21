import { describe, expect, it } from "vitest";
import { pitchBackLink } from "./pitch-back-link";

describe("pitchBackLink", () => {
  it("returns deliverables when from=deliverables", () => {
    expect(pitchBackLink("deliverables")).toEqual({
      href: "/deliverables",
      label: "Back to Deliverables",
    });
  });

  it("returns pitches list when from is null", () => {
    expect(pitchBackLink(null)).toEqual({
      href: "/pitches",
      label: "Back to Pitches",
    });
  });

  it("returns pitches list for unknown from values", () => {
    expect(pitchBackLink("unknown")).toEqual({
      href: "/pitches",
      label: "Back to Pitches",
    });
  });
});
