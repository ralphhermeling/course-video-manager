export function getAutoSelectThumbnailId(
  thumbnails: Array<{ id: string; selectedForUpload: boolean }>
): string | null {
  if (thumbnails.length !== 1) return null;
  if (thumbnails[0]!.selectedForUpload) return null;
  return thumbnails[0]!.id;
}
