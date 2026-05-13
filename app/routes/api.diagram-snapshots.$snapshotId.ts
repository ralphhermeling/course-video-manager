import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.diagram-snapshots.$snapshotId";
import { data } from "react-router";

export const loader = async (args: Route.LoaderArgs) => {
  const { snapshotId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const snapshot = yield* db.getDiagramSnapshot(snapshotId);
    return data({ scene: snapshot.scene });
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
