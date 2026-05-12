import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

export type ClipForPreview = {
  id: string;
  text: string;
};

type ProposedSection = { beforeClipId: string; title: string };

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; sections: ProposedSection[] }
  | { kind: "error"; message: string };

export const GenerateClipSectionsModal = (props: {
  open: boolean;
  videoId: string;
  videoLabel: string;
  clips: ClipForPreview[];
  onClose: () => void;
  onConfirm: (sections: ProposedSection[]) => Promise<void>;
}) => {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    setConfirming(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/videos/${props.videoId}/suggest-clip-sections`,
          { method: "POST" }
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const body = (await res.json()) as { sections: ProposedSection[] };
        if (!cancelled) {
          setState({ kind: "ready", sections: body.sections });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.videoId]);

  const sortedClips = props.clips;

  const sectionsByBeforeClipId =
    state.kind === "ready"
      ? new Map(state.sections.map((s) => [s.beforeClipId, s.title]))
      : new Map<string, string>();

  const handleConfirm = async () => {
    if (state.kind !== "ready") return;
    setConfirming(true);
    try {
      await props.onConfirm(state.sections);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && !confirming && props.onClose()}
    >
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Generate Sections
          </DialogTitle>
          <DialogDescription>
            Preview AI-proposed chapters for{" "}
            <span className="font-medium">{props.videoLabel}</span>. Confirming
            replaces all existing ClipSections on this video.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30 p-3 min-h-[200px]">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" />
              Generating proposals…
            </div>
          )}

          {state.kind === "error" && (
            <div className="text-sm text-destructive">
              Failed to generate: {state.message}
            </div>
          )}

          {state.kind === "ready" && state.sections.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              AI proposed no ClipSections for this video. Confirming will
              archive any existing ones.
            </div>
          )}

          {state.kind === "ready" && state.sections.length > 0 && (
            <div className="space-y-4">
              {(() => {
                const groups: Array<{
                  title: string | null;
                  clips: ClipForPreview[];
                }> = [];
                let current: { title: string | null; clips: ClipForPreview[] } =
                  { title: null, clips: [] };

                for (const clip of sortedClips) {
                  const newTitle = sectionsByBeforeClipId.get(clip.id);
                  if (newTitle !== undefined) {
                    if (current.title !== null || current.clips.length > 0) {
                      groups.push(current);
                    }
                    current = { title: newTitle, clips: [clip] };
                  } else {
                    current.clips.push(clip);
                  }
                }
                if (current.title !== null || current.clips.length > 0) {
                  groups.push(current);
                }

                return groups.map((group, i) => (
                  <div key={i}>
                    {group.title !== null ? (
                      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        {group.title}
                      </h4>
                    ) : (
                      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/60 italic font-semibold mb-1">
                        (before first proposed section)
                      </h4>
                    )}
                    <div className="space-y-1.5">
                      {group.clips.map((clip) => (
                        <p
                          key={clip.id}
                          className="text-foreground/80 leading-snug text-sm"
                        >
                          {clip.text.trim() || (
                            <span className="italic text-muted-foreground">
                              (empty transcript)
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={props.onClose}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={state.kind !== "ready" || confirming}
          >
            {confirming ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Applying…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
