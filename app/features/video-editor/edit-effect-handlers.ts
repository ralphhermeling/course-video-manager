import type { DB } from "@/db/schema";
import type {
  ClipReducerAction,
  ClipReducerEffect,
  ClipReducerState,
  DatabaseId,
} from "@/features/video-editor/clip-state-reducer";
import {
  INSERTION_POINT_ID,
  RECORDING_SESSION_PANELS_ID,
} from "@/features/video-editor/constants";
import type { ClipService } from "@/services/clip-service";
import type { EffectsMap } from "use-effect-reducer";
import type React from "react";
import { shouldSnapshot } from "@/lib/snapshot-rule";
import {
  getActiveDiagramId,
  getDiagramFocusedDuringClip,
  startDiagramFocusTracking,
  stopDiagramFocusTracking,
} from "@/lib/diagram-window";
import { sendToChild, subscribeParent } from "@/lib/diagram-protocol";

export interface EditEffectHandlersDeps {
  videoId: string;
  clipService: ClipService;
  clipStateRef: React.RefObject<ClipReducerState>;
  revalidate: () => void;
  whiteNoiseAssetPath: string;
}

export function createEditEffectHandlers(
  deps: EditEffectHandlersDeps
): EffectsMap<ClipReducerState, ClipReducerAction, ClipReducerEffect> {
  const {
    videoId,
    clipService,
    clipStateRef,
    revalidate,
    whiteNoiseAssetPath,
  } = deps;

  return {
    "archive-clips": (_state, effect, dispatch) => {
      clipService.archiveClips(effect.clipIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "archive-clips",
          message:
            error instanceof Error ? error.message : "Failed to archive clips",
        });
      });
    },
    "unarchive-clips": (_state, effect, dispatch) => {
      clipService.unarchiveClips(effect.clipIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "unarchive-clips",
          message:
            error instanceof Error
              ? error.message
              : "Failed to unarchive clips",
        });
      });
    },
    "transcribe-clips": (_state, effect, dispatch) => {
      fetch("/clips/transcribe", {
        method: "POST",
        body: JSON.stringify({ clipIds: effect.clipIds }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then((clips: DB.Clip[]) => {
          dispatch({
            type: "clips-transcribed",
            clips: clips.map((clip) => ({
              databaseId: clip.id,
              text: clip.text,
            })),
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "transcribe-clips",
            message:
              error instanceof Error
                ? error.message
                : "Failed to transcribe clips",
          });
        });
    },
    "scroll-to-insertion-point": () => {
      const recordingPanel = document.querySelector("[data-session-recording]");
      if (recordingPanel) {
        recordingPanel.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const sessionPanels = document.getElementById(
        RECORDING_SESSION_PANELS_ID
      );
      if (sessionPanels) {
        sessionPanels.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const insertionPoint = document.getElementById(INSERTION_POINT_ID);
      if (insertionPoint) {
        insertionPoint.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    "update-clips": (_state, effect, dispatch) => {
      // Transform tuple format [id, { scene, profile, beatType }] to UpdateClipInput
      const clipsInput = effect.clips.map(([id, data]) => ({
        id,
        scene: data.scene,
        profile: data.profile,
        beatType: data.beatType,
      }));
      clipService.updateClips(clipsInput).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "update-clips",
          message:
            error instanceof Error ? error.message : "Failed to update clips",
        });
      });
    },
    "update-beat": (_state, effect, dispatch) => {
      clipService.updateBeat(effect.clipId, effect.beatType).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "update-beat",
          message:
            error instanceof Error ? error.message : "Failed to update beat",
        });
      });
    },
    "reorder-clip": (_state, effect, dispatch) => {
      clipService
        .reorderClip(effect.clipId, effect.direction)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "reorder-clip",
            message:
              error instanceof Error ? error.message : "Failed to reorder clip",
          });
        });
    },
    "reorder-clip-section": (_state, effect, dispatch) => {
      clipService
        .reorderClipSection(effect.clipSectionId, effect.direction)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "reorder-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to reorder clip section",
          });
        });
    },
    "archive-clip-sections": (_state, effect, dispatch) => {
      clipService.archiveClipSections(effect.clipSectionIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "archive-clip-sections",
          message:
            error instanceof Error
              ? error.message
              : "Failed to archive clip sections",
        });
      });
    },
    "create-clip-section": (state, effect, dispatch) => {
      clipService
        .createClipSectionAtInsertionPoint({
          videoId,
          name: effect.name,
          insertionPoint: effect.insertionPoint,
          items: state.items,
        })
        .then((clipSection) => {
          dispatch({
            type: "clip-section-created",
            frontendId: effect.frontendId,
            databaseId: clipSection.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create clip section",
          });
        });
    },
    "update-clip-section": (_state, effect, dispatch) => {
      clipService
        .updateClipSection(effect.clipSectionId, effect.name)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "update-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update clip section",
          });
        });
    },
    "start-session-timeout": (_state, effect, dispatch) => {
      const timeout = setTimeout(() => {
        dispatch({
          type: "session-polling-complete",
          sessionId: effect.sessionId,
        });
      }, 10_000);

      return () => {
        clearTimeout(timeout);
      };
    },
    "start-session-polling": (_state, effect, dispatch) => {
      let unmounted = false;

      startDiagramFocusTracking();

      // The Diagram Playground actually creates auto-pin snapshots — it has
      // the tldraw editor and can render a thumbnail. We just tell it which
      // clip to pin and, on the ack, push the new pin into reducer state so
      // the clip's pin indicator updates without waiting for a reload.
      const unsubAck = subscribeParent((msg) => {
        if (msg.type !== "snapshotForClipDone" || !msg.ok) return;
        const item = clipStateRef.current.items.find(
          (i) => i.type === "on-database" && i.databaseId === msg.clipId
        );
        if (item && item.type === "on-database") {
          dispatch({
            type: "update-clip-diagram-pin",
            clipId: item.frontendId,
            diagramSnapshotId: msg.snapshotId,
            diagramName: msg.diagramName,
          });
        }
        revalidate();
      });

      (async () => {
        while (!unmounted) {
          // Stop polling when session is done
          const session = clipStateRef.current.sessions.find(
            (s) => s.id === effect.sessionId
          );
          if (session?.status === "done") {
            break;
          }
          try {
            const { insertionPoint, items } = clipStateRef.current;
            const clips = await clipService.appendFromObs({
              videoId,
              filePath: effect.outputPath,
              insertionPoint,
              items,
              pauseLength: effect.pauseLength,
            });
            if (clips.length > 0) {
              dispatch({
                type: "new-database-clips",
                clips: clips as DB.Clip[],
                outputPath: effect.outputPath,
              });

              const activeDiagramId = getActiveDiagramId();
              const diagramFocusedDuringClip = getDiagramFocusedDuringClip();

              // Re-arm the focus buffer for the next clip's window before any
              // awaits below, so focus events that arrive while we're flushing
              // the diagram window are attributed to the next clip, not this
              // one.
              startDiagramFocusTracking();

              const shouldPin = shouldSnapshot({
                activeDiagramId,
                diagramFocusedDuringClip,
              });

              if (shouldPin && activeDiagramId) {
                for (const clip of clips as DB.Clip[]) {
                  sendToChild({
                    type: "snapshotForClip",
                    diagramId: activeDiagramId,
                    clipId: clip.id,
                  });
                }
              }
            }
          } catch (e) {
            // Errors are swallowed; polling continues
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        stopDiagramFocusTracking();
      })();

      return () => {
        unmounted = true;
        stopDiagramFocusTracking();
        unsubAck();
      };
    },
    "create-clip-section-at": (_state, effect, dispatch) => {
      clipService
        .createClipSectionAtPosition({
          videoId,
          name: effect.name,
          position: effect.position,
          targetItemId: effect.targetItemId,
          targetItemType: effect.targetItemType,
        })
        .then((clipSection) => {
          dispatch({
            type: "clip-section-created",
            frontendId: effect.frontendId,
            databaseId: clipSection.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-clip-section-at",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create clip section at position",
          });
        });
    },
    "create-effect-clip-at": (_state, effect, dispatch) => {
      clipService
        .createEffectClipAtPosition({
          videoId,
          position: effect.position,
          targetItemId: effect.targetItemId,
          targetItemType: effect.targetItemType,
          videoFilename: whiteNoiseAssetPath,
          sourceStartTime: effect.sourceStartTime,
          sourceEndTime: effect.sourceEndTime,
          text: effect.text,
          scene: effect.scene,
          profile: effect.profile,
          beatType: effect.beatType,
        })
        .then((clip) => {
          dispatch({
            type: "effect-clip-created",
            frontendId: effect.frontendId,
            databaseId: clip.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-effect-clip-at",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create effect clip",
          });
        });
    },
    "revalidate-loader": () => {
      revalidate();
    },
  };
}
