/**
 * The two occupants of the editor's tabbed side slot. The Segments tab shows
 * *this video's own* plan; the Reference tab shows the sibling-video reader.
 * They merely share screen real estate — "Reference" stays reserved for the
 * sibling reader, never the segment view.
 */
export type SegmentTab = "segments" | "reference";

/**
 * Resolve which tab the editor's side slot should show, given the persisted
 * choice and which tabs currently exist. Pure and total so it can be unit
 * tested independently of React:
 *
 *  - Honour the persisted tab if it still exists.
 *  - Otherwise default to Reference when one is selected, else Segments.
 *  - If neither tab exists, return `null` (fall back to two-column layout).
 */
export const resolveSegmentTab = ({
  persistedTab,
  hasSegments,
  hasReference,
}: {
  persistedTab: SegmentTab | null;
  hasSegments: boolean;
  hasReference: boolean;
}): SegmentTab | null => {
  const exists = (tab: SegmentTab): boolean =>
    tab === "segments" ? hasSegments : hasReference;

  if (persistedTab !== null && exists(persistedTab)) return persistedTab;

  if (hasReference) return "reference";
  if (hasSegments) return "segments";
  return null;
};
