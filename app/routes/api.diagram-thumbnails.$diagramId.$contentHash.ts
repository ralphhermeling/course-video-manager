import type { Route } from "./+types/api.diagram-thumbnails.$diagramId.$contentHash";
import { readThumbnail } from "@/services/diagram-thumbnail-store.server";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export const loader = async (args: Route.LoaderArgs) => {
  const { diagramId, contentHash } = args.params;

  if (!SAFE_ID.test(diagramId) || !SAFE_ID.test(contentHash)) {
    return new Response("Bad request", { status: 400 });
  }

  const png = readThumbnail(diagramId, contentHash);
  if (!png) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
