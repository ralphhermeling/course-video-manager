import fs from "node:fs";
import path from "node:path";

export function getDiagramThumbnailsBaseDir(): string {
  const dir = process.env.DIAGRAM_THUMBNAILS_DIR;
  if (!dir) {
    throw new Error("DIAGRAM_THUMBNAILS_DIR environment variable is not set");
  }
  return dir;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function assertSafeSegment(value: string, field: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Unsafe ${field}: ${value}`);
  }
}

export function getThumbnailPath(
  diagramId: string,
  contentHash: string
): string {
  assertSafeSegment(diagramId, "diagramId");
  assertSafeSegment(contentHash, "contentHash");
  return path.join(
    getDiagramThumbnailsBaseDir(),
    diagramId,
    `${contentHash}.png`
  );
}

export function writeThumbnail(
  diagramId: string,
  contentHash: string,
  png: Buffer
): void {
  const filePath = getThumbnailPath(diagramId, contentHash);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
}

export function readThumbnail(
  diagramId: string,
  contentHash: string
): Buffer | null {
  const filePath = getThumbnailPath(diagramId, contentHash);
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export function thumbnailExists(
  diagramId: string,
  contentHash: string
): boolean {
  return fs.existsSync(getThumbnailPath(diagramId, contentHash));
}
