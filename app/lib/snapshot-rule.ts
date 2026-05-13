export function shouldSnapshot(input: {
  activeDiagramId: string | null;
  clipScene: string;
  diagramFocusedDuringClip: boolean;
}): boolean {
  return (
    input.activeDiagramId !== null &&
    input.clipScene !== "Camera" &&
    input.diagramFocusedDuringClip
  );
}
