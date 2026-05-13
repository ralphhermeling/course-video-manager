import { useEffect, useState } from "react";

const sceneCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

const fetchScene = (snapshotId: string): Promise<unknown> => {
  const cached = sceneCache.get(snapshotId);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inflight.get(snapshotId);
  if (existing) return existing;

  const promise = fetch(`/api/diagram-snapshots/${snapshotId}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { scene: unknown } | null) => {
      const scene = data?.scene ?? null;
      sceneCache.set(snapshotId, scene);
      return scene;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(snapshotId);
    });

  inflight.set(snapshotId, promise);
  return promise;
};

export const useDiagramSnapshotScene = (snapshotId: string | null) => {
  const [scene, setScene] = useState<unknown>(() =>
    snapshotId ? (sceneCache.get(snapshotId) ?? null) : null
  );

  useEffect(() => {
    if (!snapshotId) {
      setScene(null);
      return;
    }
    let cancelled = false;
    fetchScene(snapshotId).then((s) => {
      if (!cancelled) setScene(s);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  return scene;
};
