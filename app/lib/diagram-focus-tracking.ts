// Buffers diagram-window `focus` events against the active Optimistic Clip's
// lifetime: focus events only count between `startDiagramFocusTracking()` and
// `stopDiagramFocusTracking()`. Reset between clips by calling start again.

let isTracking = false;
let focused = false;

export function notifyDiagramFocus(): void {
  if (isTracking) focused = true;
}

export function startDiagramFocusTracking(): void {
  isTracking = true;
  focused = false;
}

export function stopDiagramFocusTracking(): void {
  isTracking = false;
  focused = false;
}

export function getDiagramFocusedDuringClip(): boolean {
  return focused;
}
