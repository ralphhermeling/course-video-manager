import { describe, it, expect } from "vitest";
import { isPreserveSnapshotShortcut } from "./preserve-snapshot-shortcut";

describe("isPreserveSnapshotShortcut", () => {
  it("matches Ctrl+S", () => {
    expect(
      isPreserveSnapshotShortcut({ ctrlKey: true, metaKey: false, key: "s" })
    ).toBe(true);
  });

  it("matches Cmd+S (macOS)", () => {
    expect(
      isPreserveSnapshotShortcut({ ctrlKey: false, metaKey: true, key: "s" })
    ).toBe(true);
  });

  it("rejects plain S without modifier", () => {
    expect(
      isPreserveSnapshotShortcut({ ctrlKey: false, metaKey: false, key: "s" })
    ).toBe(false);
  });

  it("rejects Ctrl with a different key", () => {
    expect(
      isPreserveSnapshotShortcut({ ctrlKey: true, metaKey: false, key: "d" })
    ).toBe(false);
  });

  it("matches uppercase S with Ctrl", () => {
    expect(
      isPreserveSnapshotShortcut({ ctrlKey: true, metaKey: false, key: "S" })
    ).toBe(true);
  });
});
