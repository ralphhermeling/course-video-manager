import { type DependencyLessonItem } from "@/components/dependency-selector";
import { cn } from "@/lib/utils";
import { courseViewReducer } from "@/features/course-view/course-view-reducer";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import { SectionCard } from "./section-card";
import { DependencyDragProvider } from "./dependency-drag-context";
import { SegmentDndProvider } from "@/features/segments/segment-dnd-context";
import { CreateSegmentDialogProvider } from "@/features/segments/create-segment-dialog";
import { type LoaderData } from "./course-view-types";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { useLessonDrag } from "./use-lesson-drag";
import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useFetcher } from "react-router";
import { useLessonSelectionClear } from "./use-lesson-selection-clear";

/**
 * Wraps the compact grid in a single Segment drag-and-drop context spanning
 * every Video, so a Segment can be dropped onto any Video regardless of its
 * lesson or section. Renders children bare when disabled (expanded/read-only),
 * where Segments aren't draggable.
 */
function MaybeSegmentDnd({
  enabled,
  videos,
  submitEvent,
  children,
}: {
  enabled: boolean;
  videos: { id: string; segments: { id: string }[] }[];
  submitEvent: (event: CourseEditorEvent) => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <SegmentDndProvider
      videos={videos}
      onMove={(drop) =>
        submitEvent({
          type: "move-segment",
          segmentId: drop.segmentId,
          targetVideoId: drop.targetVideoId,
          beforeSegmentId: drop.beforeSegmentId,
        })
      }
    >
      {children}
    </SegmentDndProvider>
  );
}

export function SectionGrid({
  currentCourse,
  data,
  sensors,
  handleSectionDragEnd,
  priorityFilter,
  iconFilter,
  fsStatusFilter,
  searchQuery,
  viewMode,
  addGhostLessonSectionId,
  insertAdjacentLessonId,
  insertPosition,
  editSectionId,
  addVideoToLessonId,
  convertToGhostLessonId,
  deleteLessonId,
  createOnDiskLessonId,
  editDescriptionLessonId,
  archiveSectionId,
  collapsedSections,
  toggleSection,
  lessonSelection,
  dispatch,
  submitEvent,
  navigate,
  startExportUpload,
  revealVideoFetcher,
  deleteVideoFileFetcher,
  submitDeleteVideo,
  isGhostCourse,
}: {
  currentCourse: NonNullable<LoaderData["selectedCourse"]>;
  data: LoaderData;
  isGhostCourse: boolean;
  viewMode: "expanded" | "compact";
  sensors: ReturnType<typeof useSensors>;
  handleSectionDragEnd: (
    sections: {
      id: string;
      lessons: {
        id: string;
        title?: string | null;
        path: string;
        dependencies?: string[] | null;
      }[];
    }[],
    repoVersionId: string
  ) => (event: DragEndEvent) => void;
  priorityFilter: number[];
  iconFilter: string[];
  fsStatusFilter: string | null;
  searchQuery: string;
  addGhostLessonSectionId: string | null;
  insertAdjacentLessonId: string | null;
  insertPosition: "before" | "after" | null;
  editSectionId: string | null;
  addVideoToLessonId: string | null;
  convertToGhostLessonId: string | null;
  deleteLessonId: string | null;
  createOnDiskLessonId: string | null;
  editDescriptionLessonId: string | null;
  archiveSectionId: string | null;
  collapsedSections: Set<string>;
  toggleSection: (sectionId: string) => void;
  lessonSelection: courseViewReducer.LessonSelection;
  dispatch: (action: courseViewReducer.Action) => void;
  submitEvent: (event: CourseEditorEvent) => void;
  navigate: ReturnType<typeof useNavigate>;
  startExportUpload: (videoId: string, path: string) => void;
  revealVideoFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFileFetcher: ReturnType<typeof useFetcher>;
  submitDeleteVideo: (videoId: string) => void;
}) {
  const displaySections = currentCourse.sections;

  const allSectionIds = useMemo(
    () => displaySections.map((s) => s.id),
    [displaySections]
  );

  // Every Video across the course, so one hoisted SegmentDndProvider can resolve
  // a drag onto any Video — including one in a different lesson or section. A
  // per-lesson provider would trap segments inside their own lesson.
  const allVideosForDnd = useMemo(
    () =>
      displaySections.flatMap((section) =>
        section.lessons.flatMap((lesson) =>
          lesson.videos.map((video) => ({
            id: video.id,
            segments: video.segments ?? [],
          }))
        )
      ),
    [displaySections]
  );

  // Build flat lessons list for dependency selector
  const allFlatLessons: DependencyLessonItem[] = displaySections.flatMap(
    (section, sectionIdx) =>
      section.lessons.map((lesson, lessonIdx) => ({
        id: lesson.id,
        number: `${sectionIdx + 1}.${lessonIdx + 1}`,
        title:
          lesson.fsStatus === "ghost"
            ? lesson.title || lesson.path
            : lesson.path,
        sectionId: section.id,
        sectionTitle: section.path,
        sectionNumber: sectionIdx + 1,
      }))
  );

  // Build dependency map for circular dependency detection
  const dependencyMap: Record<string, string[]> = {};
  for (const section of displaySections) {
    for (const lesson of section.lessons) {
      if (lesson.dependencies && lesson.dependencies.length > 0) {
        dependencyMap[lesson.id] = lesson.dependencies;
      }
    }
  }

  const isReadOnly = !data.isLatestVersion;

  const handleGridClick = useLessonSelectionClear(lessonSelection, dispatch);

  const handleDependencyDrop = useCallback(
    (sourceId: string, newDeps: string[]) => {
      submitEvent({
        type: "update-lesson-dependencies",
        lessonId: sourceId,
        dependencies: newDeps,
      });
    },
    [submitEvent]
  );

  // Lesson and section dragging share a single DndContext so a lesson can be
  // dragged across sections. Within-section keeps dnd-kit's live reorder; a
  // cross-section drag is drop-only and shows an insertion line at the anchor.
  const {
    dropIndicator,
    activeLesson,
    bulkDragIds,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useLessonDrag({
    sections: displaySections,
    submitEvent,
    onSectionDragEnd: handleSectionDragEnd(
      displaySections,
      data.selectedVersion!.id
    ),
    lessonSelection,
    dispatch,
  });

  return (
    <DependencyDragProvider
      dependencyMap={dependencyMap}
      onDrop={handleDependencyDrop}
      isReadOnly={isReadOnly}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={allSectionIds} strategy={rectSortingStrategy}>
          <CreateSegmentDialogProvider submitEvent={submitEvent}>
            <MaybeSegmentDnd
              enabled={viewMode === "compact" && !isReadOnly}
              videos={allVideosForDnd}
              submitEvent={submitEvent}
            >
              <div
                className={cn(
                  "grid grid-cols-1 gap-8",
                  viewMode === "compact" ? "lg:grid-cols-3" : "lg:grid-cols-2"
                )}
                onClick={handleGridClick}
              >
                {displaySections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    currentCourse={currentCourse}
                    data={data}
                    priorityFilter={priorityFilter}
                    iconFilter={iconFilter}
                    fsStatusFilter={fsStatusFilter}
                    searchQuery={searchQuery}
                    viewMode={viewMode}
                    addGhostLessonSectionId={addGhostLessonSectionId}
                    insertAdjacentLessonId={insertAdjacentLessonId}
                    insertPosition={insertPosition}
                    editSectionId={editSectionId}
                    addVideoToLessonId={addVideoToLessonId}
                    convertToGhostLessonId={convertToGhostLessonId}
                    deleteLessonId={deleteLessonId}
                    createOnDiskLessonId={createOnDiskLessonId}
                    editDescriptionLessonId={editDescriptionLessonId}
                    archiveSectionId={archiveSectionId}
                    collapsedSections={collapsedSections}
                    toggleSection={toggleSection}
                    lessonSelection={lessonSelection}
                    dispatch={dispatch}
                    submitEvent={submitEvent}
                    navigate={navigate}
                    startExportUpload={startExportUpload}
                    revealVideoFetcher={revealVideoFetcher}
                    deleteVideoFileFetcher={deleteVideoFileFetcher}
                    submitDeleteVideo={submitDeleteVideo}
                    isGhostCourse={isGhostCourse}
                    isReadOnly={isReadOnly}
                    allSectionIds={allSectionIds}
                    allFlatLessons={allFlatLessons}
                    dependencyMap={dependencyMap}
                    dropIndicator={dropIndicator}
                    activeLesson={activeLesson}
                    bulkDragIds={bulkDragIds}
                  />
                ))}
              </div>
            </MaybeSegmentDnd>
          </CreateSegmentDialogProvider>
        </SortableContext>
        <DragOverlay>
          {activeLesson ? (
            <div className="rounded-md border bg-card px-2 py-1 text-sm shadow-lg flex items-center gap-2">
              <span>
                {activeLesson.fsStatus === "ghost"
                  ? activeLesson.title || activeLesson.path
                  : activeLesson.path}
              </span>
              {bulkDragIds && bulkDragIds.size > 1 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium min-w-5 h-5 px-1.5">
                  {bulkDragIds.size}
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DependencyDragProvider>
  );
}
