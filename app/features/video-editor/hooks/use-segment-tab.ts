import { useCallback, useEffect, useState } from "react";
import type { SegmentTab } from "../segment-tab";

const storageKey = (videoId: string) => `video-editor:segment-tab:${videoId}`;

const isSegmentTab = (value: string | null): value is SegmentTab =>
  value === "segments" || value === "reference";

/**
 * Persist which side-panel tab (Segments / Reference) the author last had open
 * for a given video, so reopening the editor restores their view. Mirrors
 * {@link useReferenceVideoId}: in-memory state backed by localStorage, keyed
 * per video, degrading gracefully when storage is unavailable.
 */
export const useSegmentTab = (videoId: string) => {
  const [persistedTab, setState] = useState<SegmentTab | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(videoId));
      setState(isSegmentTab(raw) ? raw : null);
    } catch {
      setState(null);
    }
  }, [videoId]);

  const setPersistedTab = useCallback(
    (next: SegmentTab | null) => {
      setState(next);
      try {
        if (next) {
          window.localStorage.setItem(storageKey(videoId), next);
        } else {
          window.localStorage.removeItem(storageKey(videoId));
        }
      } catch {
        // localStorage unavailable; in-memory state still works for the session
      }
    },
    [videoId]
  );

  return [persistedTab, setPersistedTab] as const;
};
