import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.diagrams.$diagramId.snapshots.list";
import { data } from "react-router";

export const loader = async (args: Route.LoaderArgs) => {
  const { diagramId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const snapshots = yield* db.listSnapshots(diagramId);
    return data({ snapshots });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
