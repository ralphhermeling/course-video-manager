import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.diagrams.$diagramId.snapshots";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  const { diagramId } = args.params;
  const body = await args.request.json();

  return Effect.gen(function* () {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return yield* Effect.die(
        data("Body must be a JSON object", { status: 400 })
      );
    }

    const preserved =
      typeof body.preserved === "boolean" ? body.preserved : undefined;
    const clipId = typeof body.clipId === "string" ? body.clipId : undefined;
    const thumbnailBase64 =
      typeof body.thumbnailPngBase64 === "string"
        ? body.thumbnailPngBase64
        : undefined;

    if (preserved && !thumbnailBase64) {
      return yield* Effect.die(
        data("Preserved snapshots require a thumbnail", { status: 400 })
      );
    }

    let thumbnailPng: Buffer | undefined;
    if (thumbnailBase64) {
      try {
        thumbnailPng = Buffer.from(thumbnailBase64, "base64");
      } catch {
        return yield* Effect.die(
          data("Invalid thumbnail encoding", { status: 400 })
        );
      }
    }

    const db = yield* DBFunctionsService;

    let snapshot;
    if (clipId) {
      snapshot = yield* db.createSnapshotForClip(diagramId, clipId, {
        thumbnailPng,
      });
    } else {
      snapshot = yield* db.createSnapshot(diagramId, {
        preserved,
        thumbnailPng,
      });
    }

    return data({ snapshot });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(
        data("Diagram not found or headScene is null", { status: 404 })
      );
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
