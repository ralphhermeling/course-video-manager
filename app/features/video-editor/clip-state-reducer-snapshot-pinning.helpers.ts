import { shouldSnapshot } from "@/lib/snapshot-rule";
import type {
  ClipReducerExec,
  ClipReducerState,
  DatabaseId,
  SessionId,
  TimelineItem,
} from "./clip-state-reducer.types";

export type PendingSnapshotEffect = {
  diagramId: string;
  clipId: DatabaseId;
};

export const collectSnapshotForClip = (
  frontendClip: TimelineItem | undefined,
  databaseClipId: DatabaseId
): PendingSnapshotEffect | null => {
  if (
    frontendClip?.type !== "optimistically-added" ||
    !frontendClip.pendingSnapshot ||
    !frontendClip.pendingSnapshot.activeDiagramId
  ) {
    return null;
  }
  if (
    !shouldSnapshot({
      activeDiagramId: frontendClip.pendingSnapshot.activeDiagramId,
      diagramFocusedDuringClip: frontendClip.pendingSnapshot.diagramFocused,
    })
  ) {
    return null;
  }
  return {
    diagramId: frontendClip.pendingSnapshot.activeDiagramId,
    clipId: databaseClipId,
  };
};

export const emitSnapshotForClipEffects = (
  snapshots: PendingSnapshotEffect[],
  exec: ClipReducerExec
) => {
  for (const snapshot of snapshots) {
    exec({
      type: "snapshot-for-clip",
      diagramId: snapshot.diagramId,
      clipId: snapshot.clipId,
    });
  }
};

// Find the most recent optimistic clip in the session that has not yet
// had its diagram state captured. Walk backwards so successive close-events
// attach to successive clips.
export const handleClipAudioWindowClosed = (
  state: ClipReducerState,
  action: {
    sessionId: SessionId;
    activeDiagramId: string | null;
    diagramFocused: boolean;
  }
): ClipReducerState => {
  let targetIndex = -1;
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]!;
    if (
      item.type === "optimistically-added" &&
      item.sessionId === action.sessionId &&
      item.pendingSnapshot === undefined
    ) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) return state;

  return {
    ...state,
    items: state.items.map((item, i) =>
      i === targetIndex && item.type === "optimistically-added"
        ? {
            ...item,
            pendingSnapshot: {
              activeDiagramId: action.activeDiagramId,
              diagramFocused: action.diagramFocused,
            },
          }
        : item
    ),
  };
};
