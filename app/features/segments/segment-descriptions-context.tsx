import { createContext, useContext, type ReactNode } from "react";

/**
 * Ambient "show the Segment Description note" switch for an entire
 * {@link SegmentList} subtree. Lets the Section Workbench turn descriptions on
 * for every Segment under it without threading a `showDescriptions` prop down
 * through SectionGrid → SectionCard → SortableLessonItem → LessonSegmentTree.
 *
 * Defaults to `false`, so surfaces with no provider (the dense course view)
 * keep hiding the planning note. A SegmentList prop still wins when passed
 * explicitly (the editor's Segments tab sets it directly).
 */
const SegmentDescriptionsContext = createContext(false);

export function SegmentDescriptionsProvider({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <SegmentDescriptionsContext.Provider value={show}>
      {children}
    </SegmentDescriptionsContext.Provider>
  );
}

export function useShowSegmentDescriptions() {
  return useContext(SegmentDescriptionsContext);
}
