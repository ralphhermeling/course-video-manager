import { describe, it, expect } from "vitest";
import { getAutoSelectThumbnailId } from "./auto-select-thumbnail";

describe("getAutoSelectThumbnailId", () => {
  it("returns the thumbnail id when there is exactly one unselected thumbnail", () => {
    const thumbnails = [{ id: "thumb-1", selectedForUpload: false }];
    expect(getAutoSelectThumbnailId(thumbnails)).toBe("thumb-1");
  });

  it("returns null when the single thumbnail is already selected", () => {
    const thumbnails = [{ id: "thumb-1", selectedForUpload: true }];
    expect(getAutoSelectThumbnailId(thumbnails)).toBeNull();
  });

  it("returns null when there are multiple thumbnails", () => {
    const thumbnails = [
      { id: "thumb-1", selectedForUpload: false },
      { id: "thumb-2", selectedForUpload: false },
    ];
    expect(getAutoSelectThumbnailId(thumbnails)).toBeNull();
  });

  it("returns null when there are no thumbnails", () => {
    expect(getAutoSelectThumbnailId([])).toBeNull();
  });
});
