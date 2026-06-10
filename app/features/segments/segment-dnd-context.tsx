import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  computeSegmentDrop,
  segmentContainerId,
  type SegmentDndVideo,
  type SegmentDrop,
} from "./segment-dnd";

/**
 * The live drop target during a Segment drag, broadcast so each Video's list
 * can draw an insertion line at the landing spot. `null` when nothing is being
 * dragged, or for a same-Video reorder (dnd-kit's sortable already shifts the
 * siblings to preview that, so a line would double up).
 */
type SegmentDropPreview = {
  targetVideoId: string;
  beforeSegmentId: string | null;
} | null;

const SegmentDropContext = createContext<SegmentDropPreview>(null);

function samePreview(a: SegmentDropPreview, b: SegmentDropPreview): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.targetVideoId === b.targetVideoId &&
    a.beforeSegmentId === b.beforeSegmentId
  );
}

/** The current cross-Video drop preview, or `null`. Safe to call with no provider. */
export function useSegmentDropPreview(): SegmentDropPreview {
  return useContext(SegmentDropContext);
}

/** Insertion indicator showing where a dragged Segment will land. */
export function SegmentDropLine() {
  return <div className="h-0.5 my-0.5 rounded-full bg-primary" />;
}

/**
 * One DndContext spanning a set of Videos, so Segments can be dragged to
 * reorder within a Video or moved into a sibling Video. Resolves each drop to a
 * {@link SegmentDrop} and hands it to `onMove`.
 */
export function SegmentDndProvider({
  videos,
  onMove,
  children,
}: {
  videos: SegmentDndVideo[];
  onMove: (drop: SegmentDrop) => void;
  children: ReactNode;
}) {
  // A small distance constraint so clicking the title/handle still fires clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const [preview, setPreview] = useState<SegmentDropPreview>(null);

  const videoIdOfSegment = (segmentId: string) =>
    videos.find((v) => v.segments.some((s) => s.id === segmentId))?.id ?? null;

  const handleDragOver = (event: DragOverEvent) => {
    const activeId = String(event.active.id);
    const drop = computeSegmentDrop({
      activeId,
      overId: event.over ? String(event.over.id) : null,
      videos,
    });
    // Only preview cross-Video moves; within a Video the sortable already shifts
    // its siblings to show the gap.
    const next: SegmentDropPreview =
      drop && drop.targetVideoId !== videoIdOfSegment(activeId)
        ? {
            targetVideoId: drop.targetVideoId,
            beforeSegmentId: drop.beforeSegmentId,
          }
        : null;
    // onDragOver fires on every pointer move, but the landing spot rarely
    // changes. Keep the previous reference when it hasn't, so React bails out
    // instead of re-rendering every Video's segment list on each move.
    setPreview((prev) => (samePreview(prev, next) ? prev : next));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setPreview(null);
    const drop = computeSegmentDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      videos,
    });
    if (drop) onMove(drop);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setPreview(null)}
    >
      <SegmentDropContext.Provider value={preview}>
        {children}
      </SegmentDropContext.Provider>
    </DndContext>
  );
}

/**
 * A Video's Segment list: a droppable container (so an empty Video and the
 * end-of-list are valid drop targets) wrapping a vertical SortableContext.
 */
export function SegmentSortableList({
  videoId,
  segmentIds,
  className,
  children,
}: {
  videoId: string;
  segmentIds: string[];
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: segmentContainerId(videoId),
  });

  return (
    <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(className, isOver && "bg-primary/5 rounded")}
      >
        {children}
      </div>
    </SortableContext>
  );
}

/** A draggable Segment row with a grip handle; `children` is the row content. */
export function SortableSegment({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "segment" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        ref={setActivatorNodeRef}
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
