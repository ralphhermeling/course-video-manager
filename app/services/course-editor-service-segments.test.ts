/**
 * CourseEditorService Segment Integration Tests
 *
 * Exercises segment events end-to-end: the service interface `send`s an event,
 * the handler routes it to the segment operation, and the change lands in a real
 * PGlite database. Focused on `update-segment-description` (the new event), which
 * must reach `setSegmentDescription` and persist.
 */

import { describe, it, expect } from "vitest";
import {
  setupEditorServiceTests,
  createCourseWithVersion,
  createSectionWithLessons,
  editorService as es,
  testDb,
  schema,
} from "./course-editor-service-test-setup";

setupEditorServiceTests();

const svc = () => es;
const db = () => testDb;

async function createSegment() {
  const { version } = await createCourseWithVersion();
  const { lessons } = await createSectionWithLessons(
    version.id,
    "01-intro",
    0,
    [{ path: "01.01-lesson", title: "Lesson 1", fsStatus: "real", order: 1 }]
  );
  const [video] = await db()
    .insert(schema.videos)
    .values({
      lessonId: lessons[0]!.id,
      path: "video.mp4",
      originalFootagePath: "/tmp/video.mp4",
    })
    .returning();
  const [segment] = await db()
    .insert(schema.segments)
    .values({ videoId: video!.id, order: "a0" })
    .returning();
  return { segment: segment!, video: video! };
}

async function getSegment(id: string) {
  return db().query.segments.findFirst({
    where: (s, { eq }) => eq(s.id, id),
  });
}

describe("CourseEditorService — segments", () => {
  describe("update-segment-description", () => {
    it("routes the event to setSegmentDescription and persists it", async () => {
      const { segment } = await createSegment();
      expect(segment.description).toBe("");

      const result = await svc().setSegmentDescription(
        segment.id,
        "What I'll cover in this part"
      );
      expect(result).toEqual({ success: true });

      const updated = await getSegment(segment.id);
      expect(updated?.description).toBe("What I'll cover in this part");
    });

    it("clears the description back to empty", async () => {
      const { segment } = await createSegment();
      await svc().setSegmentDescription(segment.id, "draft note");
      await svc().setSegmentDescription(segment.id, "");

      const updated = await getSegment(segment.id);
      expect(updated?.description).toBe("");
    });
  });
});
