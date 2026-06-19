"use client";

/**
 * PROTOTYPE — decision-map ticket #2 (docs/decision-maps/course-agent-editing.md).
 * Throwaway. Two questions:
 *
 *  1. Sidebar shell — RESOLVED: drag-resizable (320–640px). That's the only shell here now.
 *  2. Open affordance — how does the agent get OPENED? Today it's buried in the actions
 *     dropdown. Three more-visible options, switchable via `?agentOpen=tab|fab|header`
 *     (+ ←/→ keys) while the panel is closed:
 *       tab    — vertical handle docked to the right edge, always visible
 *       fab    — floating circular button, bottom-right
 *       header — prominent button promoted into the course title row
 *
 * Delete once both are settled; fold the winner into the route + panel for real.
 */

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { CourseAgentPanel } from "./course-agent-panel";

type ShellProps = {
  courseId: string;
  versionId?: string;
  onClose: () => void;
};

/* ------------------------------------------------------------------ */
/* Shell — drag-resizable sidebar (the chosen layout, ticket #2)       */
/* ------------------------------------------------------------------ */

export function CourseAgentSidebar(panel: ShellProps) {
  const [width, setWidth] = useState(400);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Sidebar is pinned to the right edge: width grows as the cursor moves left.
      const next = window.innerWidth - e.clientX;
      setWidth(Math.min(640, Math.max(320, next)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <aside
      style={{ width }}
      className="sticky top-0 h-screen shrink-0 border-l border-border bg-card"
    >
      {/* drag handle straddling the left border */}
      <div
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "col-resize";
        }}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30"
        title="Drag to resize"
      />
      <CourseAgentPanel embedded {...panel} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Open affordances — how the agent gets opened (the open question)    */
/* ------------------------------------------------------------------ */

export const AGENT_OPEN_VARIANTS = ["tab", "fab", "header"] as const;
export type AgentOpenVariant = (typeof AGENT_OPEN_VARIANTS)[number];

const OPEN_LABELS: Record<AgentOpenVariant, string> = {
  tab: "Edge tab",
  fab: "Floating button",
  header: "Header button",
};

export function parseAgentOpen(raw: string | null): AgentOpenVariant {
  return (AGENT_OPEN_VARIANTS as readonly string[]).includes(raw ?? "")
    ? (raw as AgentOpenVariant)
    : "tab";
}

/** Floating triggers (tab, fab). The `header` variant renders via AgentHeaderButton. */
export function AgentOpenAffordance({
  variant,
  onOpen,
}: {
  variant: AgentOpenVariant;
  onOpen: () => void;
}) {
  if (variant === "fab") {
    return (
      <button
        onClick={onOpen}
        title="Open course agent"
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Sparkles className="size-4" />
        Course Agent
      </button>
    );
  }
  if (variant === "tab") {
    return (
      <button
        onClick={onOpen}
        title="Open course agent"
        className="fixed right-0 top-8 z-30 flex items-center gap-1.5 rounded-l-md bg-primary py-3 pl-2 pr-1.5 text-primary-foreground shadow-md hover:pr-2.5"
      >
        <Sparkles className="size-4" />
        <span className="[writing-mode:vertical-rl] text-xs font-medium tracking-wide">
          Course Agent
        </span>
      </button>
    );
  }
  // header variant renders inline in the title row, not floating
  return null;
}

/** The `header` variant — a prominent button promoted into the course title row. */
export function AgentHeaderButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Sparkles className="size-4" />
      Course Agent
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Dev-only floating switcher for the open-affordance variants         */
/* ------------------------------------------------------------------ */

export function AgentOpenSwitcher({ current }: { current: AgentOpenVariant }) {
  const [, setSearchParams] = useSearchParams();

  const go = useCallback(
    (dir: 1 | -1) => {
      const i = AGENT_OPEN_VARIANTS.indexOf(current);
      const next =
        AGENT_OPEN_VARIANTS[
          (i + dir + AGENT_OPEN_VARIANTS.length) % AGENT_OPEN_VARIANTS.length
        ]!;
      setSearchParams(
        (prev) => {
          prev.set("agentOpen", next);
          return prev;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [current, setSearchParams]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-2 py-1.5 text-zinc-100 shadow-2xl">
      <span className="pl-1 pr-1 text-[10px] uppercase tracking-wide text-zinc-400">
        open
      </span>
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/10"
        title="Previous (←)"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 text-xs font-medium tabular-nums">
        {current} — {OPEN_LABELS[current]}
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/10"
        title="Next (→)"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
