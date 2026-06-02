import { useState } from "react";
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { Section } from "./course-view-types";
import {
  resolveLessonDrop,
  computeReorderIds,
  type LessonDrop,
} from "./course-editor-helpers";

/**
 * Drives lesson and section dragging within the course view's single
 * DndContext. Within-section drops become a `reorder-lessons`; cross-section
 * drops become a `move-lesson-to-section` anchored at the drop position.
 * Section drags are delegated to `onSectionDragEnd`. The returned
 * `dropIndicator` powers the insertion line, `activeLesson` powers the overlay.
 */
export function useLessonDrag(opts: {
  sections: Section[];
  submitEvent: (event: CourseEditorEvent) => void;
  onSectionDragEnd: (event: DragEndEvent) => void;
}) {
  const { sections, submitEvent, onSectionDragEnd } = opts;

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<LessonDrop | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "lesson") {
      setActiveLessonId(String(event.active.id));
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    if (event.active.data.current?.type !== "lesson") return;
    setDropIndicator(resolveLessonDrop(event, sections));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const type = event.active.data.current?.type;
    setActiveLessonId(null);
    setDropIndicator(null);

    if (type === "section") {
      onSectionDragEnd(event);
      return;
    }
    if (type !== "lesson") return;

    const lessonId = String(event.active.id);
    const drop = resolveLessonDrop(event, sections);
    if (!drop) return;

    const source = sections.find((s) =>
      s.lessons.some((l) => l.id === lessonId)
    );
    if (!source) return;

    if (source.id === drop.targetSectionId) {
      const lessonIds = computeReorderIds(
        source.lessons,
        lessonId,
        drop.beforeLessonId
      );
      if (lessonIds) {
        submitEvent({
          type: "reorder-lessons",
          sectionId: source.id,
          lessonIds,
        });
      }
    } else {
      submitEvent({
        type: "move-lesson-to-section",
        lessonId,
        targetSectionId: drop.targetSectionId,
        beforeLessonId: drop.beforeLessonId,
      });
    }
  };

  const onDragCancel = () => {
    setActiveLessonId(null);
    setDropIndicator(null);
  };

  const activeLesson = activeLessonId
    ? sections.flatMap((s) => s.lessons).find((l) => l.id === activeLessonId)
    : null;

  return {
    dropIndicator,
    activeLesson,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
