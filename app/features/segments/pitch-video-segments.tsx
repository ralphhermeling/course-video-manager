import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import { Plus } from "lucide-react";
import {
  SEGMENT_KINDS,
  SEGMENT_KIND_ICONS,
  SEGMENT_KIND_LABELS,
  type SegmentKind,
} from "./segment-kinds";
import { SegmentContextMenuContent } from "./segment-menu-items";
import { SegmentTitleEditor } from "./segment-title-editor";
import {
  SegmentDropLine,
  SegmentSortableList,
  SortableSegment,
  useSegmentDropPreview,
} from "./segment-dnd-context";
import { useRequestCreateSegment } from "./create-segment-dialog";
import { Fragment } from "react";

type PitchSegment = {
  id: string;
  videoId: string;
  kind: string;
  title: string;
  order: string;
};

/**
 * A pitch Video's ordered Segment plan: draggable rows (within and across the
 * pitch's Videos, via the surrounding {@link SegmentDndProvider}) plus an
 * "Add segment" menu offering the five kinds.
 */
export function PitchVideoSegments({
  video,
  submitEvent,
}: {
  video: { id: string; segments: PitchSegment[] };
  submitEvent: (event: CourseEditorEvent) => void;
}) {
  const segments = video.segments;
  const requestCreateSegment = useRequestCreateSegment();
  const dropPreview = useSegmentDropPreview();
  const previewInThisVideo =
    dropPreview?.targetVideoId === video.id ? dropPreview : null;

  return (
    <div className="space-y-1">
      <SegmentSortableList
        videoId={video.id}
        segmentIds={segments.map((s) => s.id)}
        className="space-y-0.5 min-h-[0.5rem]"
      >
        {segments.map((segment, index) => (
          <Fragment key={segment.id}>
            {previewInThisVideo?.beforeSegmentId === segment.id && (
              <SegmentDropLine />
            )}
            <SortableSegment id={segment.id}>
              <SegmentRow
                segment={segment}
                nextSegmentId={segments[index + 1]?.id ?? null}
                submitEvent={submitEvent}
              />
            </SortableSegment>
          </Fragment>
        ))}
        {previewInThisVideo?.beforeSegmentId === null && <SegmentDropLine />}
      </SegmentSortableList>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            <Plus className="w-3 h-3" />
            Add segment
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SEGMENT_KINDS.map((kind) => {
            const Icon = SEGMENT_KIND_ICONS[kind];
            return (
              <DropdownMenuItem
                key={kind}
                onSelect={() =>
                  requestCreateSegment({
                    videoId: video.id,
                    kind,
                    beforeSegmentId: null,
                  })
                }
              >
                <Icon className="w-4 h-4" />
                {SEGMENT_KIND_LABELS[kind]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SegmentRow({
  segment,
  nextSegmentId,
  submitEvent,
}: {
  segment: PitchSegment;
  nextSegmentId: string | null;
  submitEvent: (event: CourseEditorEvent) => void;
}) {
  const kind = segment.kind as SegmentKind;
  const Icon = SEGMENT_KIND_ICONS[kind];
  const requestCreateSegment = useRequestCreateSegment();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-1.5 text-sm text-foreground/80 cursor-context-menu">
          {Icon && (
            <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          <SegmentTitleEditor
            title={segment.title}
            placeholder={SEGMENT_KIND_LABELS[kind]}
            isReadOnly={false}
            onSave={(title) =>
              submitEvent({
                type: "rename-segment",
                segmentId: segment.id,
                title,
              })
            }
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <SegmentContextMenuContent
          onSetKind={(nextKind) =>
            submitEvent({
              type: "set-segment-kind",
              segmentId: segment.id,
              kind: nextKind,
            })
          }
          onAddBefore={(kind) =>
            requestCreateSegment({
              videoId: segment.videoId,
              kind,
              beforeSegmentId: segment.id,
            })
          }
          onAddAfter={(kind) =>
            requestCreateSegment({
              videoId: segment.videoId,
              kind,
              beforeSegmentId: nextSegmentId,
            })
          }
          onDelete={() =>
            submitEvent({ type: "delete-segment", segmentId: segment.id })
          }
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
