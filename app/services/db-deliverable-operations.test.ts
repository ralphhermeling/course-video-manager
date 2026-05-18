import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;
let testLayer: Layer.Layer<DBFunctionsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  testLayer = DBFunctionsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

describe("duplicateDeliverable", () => {
  it.effect(
    "duplicates a deliverable 7 days later without copying linked courses or pitches",
    () =>
      Effect.gen(function* () {
        const db = yield* DBFunctionsService;

        const course = yield* db.createCourse({
          filePath: "/tmp/test-course",
          name: "test-course",
        });
        const pitch = yield* db.createPitch();

        const original = yield* db.createDeliverable({
          title: "Ship feature X",
          date: "2026-05-04",
          notes: "Some notes",
          courseIds: [course.id],
          pitchIds: [pitch.id],
        });

        const result = yield* db.duplicateDeliverable(original.id);

        expect(result.created.title).toBe("Ship feature X");
        expect(result.created.notes).toBe("Some notes");
        expect(result.created.date).toBe("2026-05-11");
        expect(result.created.status).toBe("planned");
        expect(result.created.archived).toBe(false);
        expect(result.created.id).not.toBe(original.id);

        const list = yield* db.listDeliverables();
        const dup = list.find((d) => d.id === result.created.id);
        expect(dup?.deliverablesCourses).toEqual([]);
        expect(dup?.deliverablesPitches).toEqual([]);
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("duplicates a deliverable with no links", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const original = yield* db.createDeliverable({
        title: "Solo task",
        date: "2026-05-04",
      });

      const result = yield* db.duplicateDeliverable(original.id);

      expect(result.created.title).toBe("Solo task");
      expect(result.created.date).toBe("2026-05-11");

      const list = yield* db.listDeliverables();
      expect(list).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("correctly handles month boundary when adding 7 days", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const original = yield* db.createDeliverable({
        title: "Cross month",
        date: "2026-01-28",
      });

      const result = yield* db.duplicateDeliverable(original.id);

      expect(result.created.date).toBe("2026-02-04");
    }).pipe(Effect.provide(testLayer))
  );
});
