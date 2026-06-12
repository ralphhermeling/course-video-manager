import { Effect, Schema } from "effect";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { makeAction } from "@/services/route-action.server";

const copyVideoSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Video name cannot be empty" })
  ),
  copyClips: Schema.optional(Schema.String),
  copySegments: Schema.optional(Schema.String),
});

export const action = makeAction({
  input: "formData",
  effect: ({ params, payload }) =>
    Effect.gen(function* () {
      const { name, copyClips, copySegments } =
        yield* Schema.decodeUnknown(copyVideoSchema)(payload);

      const videoOps = yield* VideoOperationsService;

      const newVideoId = yield* videoOps.copyVideo({
        sourceVideoId: params.videoId!,
        newPath: name.trim(),
        copyClips: copyClips === "on",
        copySegments: copySegments === "on",
      });

      return { success: true, newVideoId };
    }),
});
