import { describe, expect, it } from "vitest";
import {
  planLessonMove,
  type FsOp,
  type PlannerSection,
} from "./lesson-move-planner";

/** Compact builder: real lesson. */
const real = (id: string, path: string, order: number) => ({
  id,
  path,
  order,
  fsStatus: "real" as const,
});
/** Compact builder: ghost lesson. */
const ghost = (id: string, path: string, order: number) => ({
  id,
  path,
  order,
  fsStatus: "ghost" as const,
});

/** Maps lessonUpdates to a {id: {sectionId, path, order}} lookup. */
const byId = (
  updates: { id: string; sectionId: string; path: string; order: number }[]
) => Object.fromEntries(updates.map((u) => [u.id, u]));

const fsKinds = (ops: FsOp[]) => ops.map((o) => o.kind);

describe("planLessonMove", () => {
  describe("guards", () => {
    it("is a no-op when the lesson does not exist", () => {
      const sections: PlannerSection[] = [
        { id: "s1", path: "01-intro", lessons: [real("a", "01.01-a", 0)] },
        { id: "s2", path: "02-next", lessons: [] },
      ];
      const plan = planLessonMove({
        sections,
        lessonId: "missing",
        targetSectionId: "s2",
        beforeLessonId: null,
      });
      expect(plan.noop).toBe(true);
    });

    it("is a no-op when source and target are the same section", () => {
      const sections: PlannerSection[] = [
        { id: "s1", path: "01-intro", lessons: [real("a", "01.01-a", 0)] },
      ];
      const plan = planLessonMove({
        sections,
        lessonId: "a",
        targetSectionId: "s1",
        beforeLessonId: null,
      });
      expect(plan.noop).toBe(true);
    });
  });

  describe("real lesson, append (beforeLessonId = null)", () => {
    it("moves the lesson, renumbers the source to close the gap", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          lessons: [
            real("first", "01.01-first", 0),
            real("second", "01.02-second", 1),
            real("third", "01.03-third", 2),
          ],
        },
        {
          id: "s2",
          path: "02-advanced",
          lessons: [real("existing", "02.01-existing", 0)],
        },
      ];

      const plan = planLessonMove({
        sections,
        lessonId: "second",
        targetSectionId: "s2",
        beforeLessonId: null,
      });

      const updates = byId(plan.lessonUpdates);
      expect(updates.second).toEqual({
        id: "second",
        sectionId: "s2",
        path: "02.02-second",
        order: 1,
      });
      // Source gap closed: third 01.03 → 01.02
      expect(updates.third!.path).toBe("01.02-third");
      // First untouched (no update emitted)
      expect(updates.first).toBeUndefined();
      // Existing target lesson untouched (append, nothing shifts)
      expect(updates.existing).toBeUndefined();

      expect(plan.sectionUpdates).toEqual([]);
      expect(fsKinds(plan.fsOps)).toEqual(["moveLesson", "renameLessons"]);
      const move = plan.fsOps[0];
      expect(move).toMatchObject({
        kind: "moveLesson",
        sourceSectionPath: "01-intro",
        targetSectionPath: "02-advanced",
        oldLessonDirName: "01.02-second",
        newLessonDirName: "02.02-second",
      });
    });
  });

  describe("real lesson, positional insert (beforeLessonId set)", () => {
    it("inserts before an anchor and shifts target lessons up", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          // Two lessons so the source stays real (isolates positional insert
          // from the dematerialize/renumber cascade).
          lessons: [
            real("moving", "01.01-moving", 0),
            real("stay", "01.02-stay", 1),
          ],
        },
        {
          id: "s2",
          path: "02-target",
          lessons: [
            real("t1", "02.01-t1", 0),
            real("t2", "02.02-t2", 1),
            real("t3", "02.03-t3", 2),
          ],
        },
      ];

      // Drop before t2 → moving becomes 02.02, t2/t3 shift up.
      const plan = planLessonMove({
        sections,
        lessonId: "moving",
        targetSectionId: "s2",
        beforeLessonId: "t2",
      });

      const updates = byId(plan.lessonUpdates);
      expect(updates.moving!.path).toBe("02.02-moving");
      expect(updates.moving!.sectionId).toBe("s2");
      // order strictly between t1 (0) and t2 (1)
      expect(updates.moving!.order).toBeGreaterThan(0);
      expect(updates.moving!.order).toBeLessThan(1);
      // t2, t3 shifted up by one number
      expect(updates.t2!.path).toBe("02.03-t2");
      expect(updates.t3!.path).toBe("02.04-t3");
      expect(updates.t1).toBeUndefined();

      // Source emptied → it dematerializes and sections renumber.
      // Target shift renames must precede the moveLesson so the slot is free.
      const idxShift = plan.fsOps.findIndex(
        (o) => o.kind === "renameLessons" && o.sectionPath === "02-target"
      );
      const idxMove = plan.fsOps.findIndex((o) => o.kind === "moveLesson");
      expect(idxShift).toBeGreaterThanOrEqual(0);
      expect(idxShift).toBeLessThan(idxMove);
    });

    it("inserting before the first lesson yields an order below it", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          lessons: [real("a", "01.01-a", 0), real("b", "01.02-b", 1)],
        },
        {
          id: "s2",
          path: "02-target",
          lessons: [real("t1", "02.01-t1", 5)],
        },
      ];
      const plan = planLessonMove({
        sections,
        lessonId: "a",
        targetSectionId: "s2",
        beforeLessonId: "t1",
      });
      const updates = byId(plan.lessonUpdates);
      expect(updates.a!.path).toBe("02.01-a");
      expect(updates.a!.order).toBeLessThan(5);
      expect(updates.t1!.path).toBe("02.02-t1");
    });
  });

  describe("ghost lesson", () => {
    it("moves DB-only with no filesystem ops and no section changes", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          lessons: [real("r", "01.01-r", 0), ghost("g", "ghost-lesson", 1)],
        },
        {
          id: "s2",
          path: "02-next",
          lessons: [real("x", "02.01-x", 0)],
        },
      ];
      const plan = planLessonMove({
        sections,
        lessonId: "g",
        targetSectionId: "s2",
        beforeLessonId: null,
      });

      expect(plan.fsOps).toEqual([]);
      expect(plan.sectionUpdates).toEqual([]);
      const updates = byId(plan.lessonUpdates);
      expect(updates.g).toEqual({
        id: "g",
        sectionId: "s2",
        path: "ghost-lesson",
        order: 1,
      });
      // Real lessons untouched — a ghost leaving doesn't renumber anything.
      expect(updates.r).toBeUndefined();
      expect(updates.x).toBeUndefined();
    });
  });

  describe("materialize target / dematerialize source", () => {
    it("materializes a ghost target, keeps numbering when source stays real", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          lessons: [
            real("first", "01.01-first", 0),
            real("second", "01.02-second", 1),
          ],
        },
        {
          id: "s2",
          path: "Advanced Topics",
          lessons: [],
        },
      ];

      const plan = planLessonMove({
        sections,
        lessonId: "first",
        targetSectionId: "s2",
        beforeLessonId: null,
      });

      const updates = byId(plan.lessonUpdates);
      expect(updates.first!.path).toBe("02.01-first");
      expect(updates.first!.sectionId).toBe("s2");
      // Source still real → renumbers second to close the gap.
      expect(updates.second!.path).toBe("01.01-second");

      const secUpdates = Object.fromEntries(
        plan.sectionUpdates.map((s) => [s.id, s.path])
      );
      expect(secUpdates.s2).toBe("02-advanced-topics");
      expect(secUpdates.s1).toBeUndefined();

      expect(plan.fsOps[0]).toMatchObject({
        kind: "makeSectionDir",
        sectionPath: "02-advanced-topics",
      });
    });

    it("dematerializes the source when its last real lesson leaves", () => {
      const sections: PlannerSection[] = [
        {
          id: "s1",
          path: "01-intro",
          lessons: [real("only", "01.01-only-lesson", 0)],
        },
        {
          id: "s2",
          path: "02-advanced",
          lessons: [],
        },
      ];

      const plan = planLessonMove({
        sections,
        lessonId: "only",
        targetSectionId: "s2",
        beforeLessonId: null,
      });

      const updates = byId(plan.lessonUpdates);
      // Target materialized then renumbered 02 → 01 (source dematerialized).
      expect(updates.only!.path).toBe("01.01-only-lesson");
      expect(updates.only!.sectionId).toBe("s2");

      const secUpdates = Object.fromEntries(
        plan.sectionUpdates.map((s) => [s.id, s.path])
      );
      // Source reverts to a plain title (ghost), target becomes 01.
      expect(secUpdates.s1).toBe("Intro");
      expect(secUpdates.s2).toBe("01-advanced");

      expect(fsKinds(plan.fsOps)).toEqual([
        "makeSectionDir",
        "moveLesson",
        "deleteSectionDir",
        "renameSections",
        "renameLessons",
      ]);
    });
  });
});
