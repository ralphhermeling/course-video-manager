// Dependency Group spine — the dashed icon-to-icon lines drawn in the compact
// course view to mark contiguous runs of dependency-linked lessons (see the
// "Dependency Group" entry in CONTEXT.md and docs/adr/0010).
//
// The lines are MEASURED from the rendered icon positions rather than drawn at a
// fixed pixel height: a lesson's row height changes when its title wraps to two
// lines, so any hard-coded segment height drifts off the icon centres.
//
// Measuring is timing-sensitive: on first load the rows aren't positioned yet
// (streamed data, web-font swap, thumbnails still loading), so a one-shot measure
// finds collapsed rects and draws nothing. The spine handles this with a bounded
// per-frame settle loop that re-measures until every pair resolves and holds
// steady, then a ResizeObserver re-measures on later reflows. See docs/adr/0010.

import { cn } from "@/lib/utils";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

// A Dependency Group reserves whitespace above AND below itself, so the block is
// separated from whatever precedes and follows it (a lone lesson or another
// group). Edges are zeroed (first:/last:) so there's no dangling gap at the
// top/bottom of the list; adjacent block margins collapse, so two touching groups
// share one gap. Lone lessons (run length 1) get no extra spacing, so consecutive
// ungrouped lessons stay tight.
//
// The 20px gap must stay comfortably larger than the ~14px intra-group row
// spacing — otherwise the gap inside a group rivals the gap around it and the
// blocks stop reading as blocks.
export function runSpacingClass(isGroup: boolean): string {
  return isGroup ? "mt-5 mb-5 first:mt-0 last:mb-0" : "";
}

type Segment = { x: number; top: number; height: number };

// Draws a dashed segment between each connected adjacent pair of lesson icons.
// `pairs` is [topLessonId, bottomLessonId][]; each id must match a rendered
// `[data-dep-icon]` element inside the container.
function MeasuredSpine({
  containerRef,
  pairs,
  revalidateKey,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  pairs: [string, string][];
  revalidateKey: string;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const pairsKey = pairs.map((p) => p.join(">")).join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let settleRaf = 0;
    let scheduled = 0;

    // Compute the segments for the current layout. A pair resolves only when
    // both icons are present and there is a positive gap between them.
    const computeSegments = (): Segment[] => {
      const base = container.getBoundingClientRect();
      const next: Segment[] = [];
      for (const [a, b] of pairs) {
        const ea = container.querySelector(
          `[data-dep-icon="${CSS.escape(a)}"]`
        );
        const eb = container.querySelector(
          `[data-dep-icon="${CSS.escape(b)}"]`
        );
        if (!ea || !eb) continue;
        const ra = ea.getBoundingClientRect();
        const rb = eb.getBoundingClientRect();
        const x = ra.left + ra.width / 2 - base.left;
        const top = ra.bottom - base.top;
        const height = rb.top - base.top - top;
        if (height > 0) next.push({ x, top, height });
      }
      return next;
    };

    // Only push to state when the result actually changed, so the settle loop
    // and the observers below don't trigger needless re-renders.
    let lastSerialized = "";
    const apply = (): Segment[] => {
      const next = computeSegments();
      const serialized = JSON.stringify(next);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        setSegments(next);
      }
      return next;
    };

    // First-load settle loop. A single measure routinely runs before the rows
    // are positioned — on first paint the data may still be streaming in, the
    // web font may not have swapped, and thumbnails are still loading — so the
    // icon rects are collapsed and every segment is dropped. Rather than fire a
    // couple of speculative re-measures and hope one lands, poll each frame
    // until every pair resolves to a drawable segment AND the result holds
    // steady for a few frames. Capped so a pair that can never resolve (e.g. an
    // icon that isn't rendered) doesn't spin forever.
    const SETTLE_CAP = 120; // ~2s at 60fps
    let frames = 0;
    let stableFrames = 0;
    const settle = () => {
      if (cancelled) return;
      const before = lastSerialized;
      const next = apply();
      const resolvedAll = next.length === pairs.length;
      stableFrames =
        resolvedAll && lastSerialized === before ? stableFrames + 1 : 0;
      frames += 1;
      if (stableFrames < 3 && frames < SETTLE_CAP) {
        settleRaf = requestAnimationFrame(settle);
      }
    };
    settle();

    // Coalesce observer-driven re-measures into a single frame so a burst of
    // reflows only measures once. These cover changes after the initial settle:
    // a title rewraps, the window resizes, a late image shifts the rows.
    const scheduleMeasure = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => apply());
    };

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(container);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(settleRaf);
      cancelAnimationFrame(scheduled);
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
    // The effect re-runs (restarting the settle loop) on any change to the
    // section's rendered items via revalidateKey — an in-place reorder leaves
    // spinePairs and the container box unchanged, so neither pairsKey nor the
    // ResizeObserver would otherwise fire. See docs/adr/0010.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, pairsKey, revalidateKey]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {segments.map((s, i) => (
        <span
          key={i}
          className="absolute w-0 border-l border-dashed border-muted-foreground/50"
          style={{ left: s.x, top: s.top, height: s.height }}
        />
      ))}
    </div>
  );
}

// Wraps a section's lesson list, owns the positioning context + the spine overlay.
// `pairs` is empty whenever grouping is suppressed (expanded view, or an active
// filter), in which case no overlay renders.
export function CompactLessonList({
  pairs,
  revalidateKey,
  className,
  children,
}: {
  pairs: [string, string][];
  revalidateKey: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={cn("relative", className)}>
      {children}
      {pairs.length > 0 && (
        <MeasuredSpine
          containerRef={ref}
          pairs={pairs}
          revalidateKey={revalidateKey}
        />
      )}
    </div>
  );
}
