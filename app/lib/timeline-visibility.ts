export function isVisibleInTimeline(
  snapshot: { preserved: boolean },
  _pinningClips: { archived: boolean }[]
): boolean {
  return snapshot.preserved;
}
