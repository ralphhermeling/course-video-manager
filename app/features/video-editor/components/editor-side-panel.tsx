import { cn } from "@/lib/utils";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import { CreateSegmentDialogProvider } from "@/features/segments/create-segment-dialog";
import { SegmentDndProvider } from "@/features/segments/segment-dnd-context";
import {
  SegmentList,
  type SegmentListSegment,
} from "@/features/segments/segment-list";
import type { SegmentTab } from "../segment-tab";
import { ReferencePanel, type ReferenceCandidate } from "./reference-panel";

/**
 * The editor's middle 40ch slot as a tabbed container holding two mutually
 * exclusive panels that share the space: **Segments** (this video's own plan)
 * and **Reference** (the sibling-video reader). "Reference" stays reserved for
 * the sibling reader — the segment view is the Segment Panel, never a
 * "reference".
 *
 * Tabs are available iff their content exists: the Segments tab iff the video
 * has ≥1 segment, the Reference tab iff a reference video is selected. The
 * caller renders this only when at least one tab exists; the tab strip always
 * shows so the UI stays structurally stable when the second tab appears.
 */
export function EditorSidePanel(props: {
  activeTab: SegmentTab;
  hasSegments: boolean;
  hasReference: boolean;
  onTabChange: (tab: SegmentTab) => void;

  // Segments tab
  videoId: string;
  segments: SegmentListSegment[];
  /** Read-only while a capture is in progress (recording or settling). */
  isSegmentsReadOnly: boolean;
  onSegmentEvent: (event: CourseEditorEvent) => void;

  // Reference tab
  referenceCandidates: ReferenceCandidate[];
  referenceVideoId: string | null;
  onRemoveReference: () => void;
  onAddReferenceChapterAt: (input: {
    videoId: string;
    targetItemId: string;
    targetItemType: "clip" | "chapter";
    position: "before" | "after";
    name: string;
  }) => void;
  onEditReferenceChapterName: (chapterId: string, name: string) => void;
  onDeleteReferenceChapter: (chapterId: string) => void;
  onGenerateReferenceChapters: () => void;
}) {
  return (
    <div className="border rounded-lg bg-muted/30 flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b bg-muted/50 shrink-0">
        {props.hasSegments && (
          <TabButton
            active={props.activeTab === "segments"}
            onClick={() => props.onTabChange("segments")}
          >
            Segments
          </TabButton>
        )}
        {props.hasReference && (
          <TabButton
            active={props.activeTab === "reference"}
            onClick={() => props.onTabChange("reference")}
          >
            Reference
          </TabButton>
        )}
      </div>

      {props.activeTab === "segments" ? (
        <div className="overflow-y-auto flex-1 px-3 py-2">
          <CreateSegmentDialogProvider submitEvent={props.onSegmentEvent}>
            <SegmentDndProvider
              videos={[
                {
                  id: props.videoId,
                  segments: props.segments.map((s) => ({ id: s.id })),
                },
              ]}
              onMove={(drop) =>
                props.onSegmentEvent({
                  type: "move-segment",
                  segmentId: drop.segmentId,
                  targetVideoId: drop.targetVideoId,
                  beforeSegmentId: drop.beforeSegmentId,
                })
              }
            >
              <SegmentList
                video={{ id: props.videoId, segments: props.segments }}
                submitEvent={props.onSegmentEvent}
                isReadOnly={props.isSegmentsReadOnly}
                showDescriptions
              />
            </SegmentDndProvider>
          </CreateSegmentDialogProvider>
        </div>
      ) : props.referenceVideoId ? (
        <ReferencePanel
          className="flex-1 min-h-0"
          candidates={props.referenceCandidates}
          selectedId={props.referenceVideoId}
          onRemove={props.onRemoveReference}
          onAddChapterAt={props.onAddReferenceChapterAt}
          onEditChapterName={props.onEditReferenceChapterName}
          onDeleteChapter={props.onDeleteReferenceChapter}
          onGenerateChapters={props.onGenerateReferenceChapters}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded text-[11px] uppercase tracking-wider font-semibold transition-colors",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
