import type { Editor } from "tldraw";

export async function renderThumbnailPngBase64(
  editor: Editor
): Promise<string | null> {
  const shapeIds = Array.from(editor.getCurrentPageShapeIds());
  if (shapeIds.length === 0) return null;

  const { blob } = await editor.toImage(shapeIds, {
    format: "png",
    background: false,
    darkMode: true,
    padding: 32,
  });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
