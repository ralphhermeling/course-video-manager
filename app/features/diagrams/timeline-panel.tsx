import { useCallback, useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DiagramThumbnail } from "@/features/diagrams/diagram-thumbnail";

export interface Snapshot {
  id: string;
  diagramId: string;
  scene: unknown;
  contentHash: string;
  preserved: boolean;
  createdAt: string;
}

interface SnapshotListResponse {
  snapshots: Snapshot[];
  headContentHash: string | null;
}

export function TimelinePanel({
  diagramId,
  onRestoreRequest,
  refreshKey,
}: {
  diagramId: string;
  onRestoreRequest: (snapshot: Snapshot, headIsPreserved: boolean) => void;
  refreshKey: number;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [headContentHash, setHeadContentHash] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(() => {
    let cancelled = false;

    fetch(`/api/diagrams/${diagramId}/snapshots/list`)
      .then((res) =>
        res.ok ? (res.json() as Promise<SnapshotListResponse>) : null
      )
      .then((data) => {
        if (cancelled || !data) return;
        setSnapshots(data.snapshots);
        setHeadContentHash(data.headContentHash);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHasLoadedOnce(true);
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId]);

  useEffect(() => {
    return fetchSnapshots();
  }, [fetchSnapshots, refreshKey]);

  const headIsPreserved =
    headContentHash != null &&
    snapshots.some((s) => s.preserved && s.contentHash === headContentHash);

  const handleRestoreClick = (snapshot: Snapshot) => {
    onRestoreRequest(snapshot, headIsPreserved);
  };

  const handleArchive = async (snapshot: Snapshot) => {
    setArchivingId(snapshot.id);
    try {
      const res = await fetch(`/api/diagram-snapshots/${snapshot.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        toast.error("Failed to archive snapshot");
        return;
      }
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshot.id));
    } catch {
      toast.error("Failed to archive snapshot");
    } finally {
      setArchivingId(null);
    }
  };

  if (!hasLoadedOnce) {
    return <div className="p-3" />;
  }

  if (snapshots.length === 0) {
    return <div className="p-3 text-xs text-zinc-400">No snapshots yet</div>;
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {snapshots.map((snapshot) => (
        <button
          key={snapshot.id}
          type="button"
          onClick={() => handleRestoreClick(snapshot)}
          title="Restore snapshot"
          className="group flex h-14 items-center gap-2 overflow-hidden rounded border border-zinc-700 bg-zinc-800 pr-2 text-left hover:bg-zinc-700/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
        >
          <DiagramThumbnail
            diagramId={snapshot.diagramId}
            contentHash={snapshot.contentHash}
            scene={snapshot.scene}
            className="h-full w-20 shrink-0 object-contain bg-zinc-900"
          />
          <div className="min-w-0 flex-1" />
          <Button
            asChild
            variant="ghost"
            size="icon"
            title="Archive"
            aria-label="Archive snapshot"
            className="h-7 w-7 text-zinc-300 hover:text-zinc-100"
            disabled={archivingId === snapshot.id}
          >
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (archivingId !== snapshot.id) handleArchive(snapshot);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (archivingId !== snapshot.id) handleArchive(snapshot);
                }
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </span>
          </Button>
        </button>
      ))}
    </div>
  );
}
