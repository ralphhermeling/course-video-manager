import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.diagram-snapshots.$snapshotId.archive";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  const { snapshotId } = args.params;
  const body = await args.request.json().catch(() => null);
  const archived =
    body && typeof body === "object" && typeof body.archived === "boolean"
      ? body.archived
      : true;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const snapshot = yield* db.setSnapshotArchived(snapshotId, archived);
    return data({ snapshot });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Snapshot not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
