import type { DrizzleDB } from "@/services/drizzle-service.server";
import { deliverables } from "@/db/schema";
import { UnknownDBServiceError } from "@/services/db-service-errors";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createDeliverableOperations = (db: DrizzleDB) => {
  const listDeliverables = Effect.fn("listDeliverables")(function* () {
    return yield* makeDbCall(() =>
      db.query.deliverables.findMany({
        where: eq(deliverables.archived, false),
        orderBy: [asc(deliverables.date), asc(deliverables.createdAt)],
      })
    );
  });

  const createDeliverable = Effect.fn("createDeliverable")(function* (input: {
    title: string;
    date: string;
    notes?: string;
  }) {
    const results = yield* makeDbCall(() =>
      db
        .insert(deliverables)
        .values({
          title: input.title,
          date: input.date,
          notes: input.notes ?? null,
        })
        .returning()
    );

    const deliverable = results[0];

    if (!deliverable) {
      return yield* new UnknownDBServiceError({
        cause: "No deliverable was returned from the database",
      });
    }

    return deliverable;
  });

  return {
    listDeliverables,
    createDeliverable,
  };
};
