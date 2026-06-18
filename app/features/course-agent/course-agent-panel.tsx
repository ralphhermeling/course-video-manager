"use client";

// Course Agent side panel (chat-first card). Folded in from the #6 prototype's
// Variant B. Reuses the write page's kibo AI primitives for the conversation,
// messages, markdown and input. No backend yet: messages are canned (see
// mock-data.ts) and the input appends a local user turn — wire `useChat` here when
// the agent-loop route lands. Thread archiving is real and persists to localStorage.

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  AIConversation,
  AIConversationContent,
  AIConversationScrollButton,
} from "components/ui/kibo-ui/ai/conversation";
import {
  AIInput,
  AIInputSubmit,
  AIInputTextarea,
  AIInputToolbar,
} from "components/ui/kibo-ui/ai/input";
import { AIMessage, AIMessageContent } from "components/ui/kibo-ui/ai/message";
import { AIResponse } from "components/ui/kibo-ui/ai/response";
import {
  useMessageQueue,
  type ChatStatus,
} from "@/features/article-writer/use-message-queue";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Loader2Icon,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  CONTEXT_WINDOW,
  formatTokens,
  THREADS,
  type Message,
  type Part,
  type Thread,
} from "./mock-data";
import { CourseToolCall } from "./tool-call";

const ARCHIVED_KEY = "course-agent-archived-threads";

function loadArchived(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ARCHIVED_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

function saveArchived(ids: string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ARCHIVED_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function updatedLabel(ts: number): string {
  const label =
    Date.now() - ts < 60_000
      ? "now"
      : formatDistanceToNow(ts, { addSuffix: true });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function textOf(parts: Part[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

export function CourseAgentPanel({ onClose }: { onClose: () => void }) {
  const [threads, setThreads] = useState<Thread[]>(THREADS);
  const [archivedIds, setArchivedIds] = useState<string[]>(() =>
    loadArchived()
  );
  const [activeId, setActiveId] = useState<string>(THREADS[0]!.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const newCount = useRef(0);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const archived = useMemo(() => new Set(archivedIds), [archivedIds]);
  const activeThreads = threads.filter((t) => !archived.has(t.id));
  const archivedThreads = threads.filter((t) => archived.has(t.id));
  const thread =
    threads.find((t) => t.id === activeId) ?? activeThreads[0] ?? threads[0]!;

  const setArchived = (ids: string[]) => {
    setArchivedIds(ids);
    saveArchived(ids);
  };

  const archiveThread = (id: string) => {
    setArchived([...archivedIds.filter((x) => x !== id), id]);
    if (id === activeId) {
      const next = threads.find((t) => t.id !== id && !archived.has(t.id));
      if (next) setActiveId(next.id);
    }
  };

  const unarchiveThread = (id: string) => {
    setArchived(archivedIds.filter((x) => x !== id));
  };

  const newThread = () => {
    newCount.current += 1;
    const t: Thread = {
      id: `new-${newCount.current}`,
      updatedAt: Date.now(),
      contextTokens: 0,
      messages: [],
    };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setMenuOpen(false);
  };

  const appendMessage = (threadId: string, msg: Message) =>
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, messages: [...t.messages, msg], updatedAt: Date.now() }
          : t
      )
    );

  // Actually "sends" a message. No backend yet, so we fake a streaming reply so
  // queueing + stop are observable; swap this for the real useChat send later.
  const onSend = useCallback((text: string) => {
    const threadId = activeIdRef.current;
    appendMessage(threadId, {
      id: `u-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text }],
    });
    setStatus("submitted");
    replyTimer.current = setTimeout(() => {
      setStatus("streaming");
      replyTimer.current = setTimeout(() => {
        appendMessage(threadId, {
          id: `a-${Date.now()}`,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "_(stub reply — the agent loop isn't wired yet.)_",
            },
          ],
        });
        setStatus("ready");
      }, 1200);
    }, 400);
  }, []);

  const { submit, queuedMessages, clearQueue } = useMessageQueue(
    status,
    onSend
  );

  const stop = () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    clearQueue();
    setStatus("ready");
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    submit(text);
    setDraft("");
  };

  return (
    <div className="fixed right-4 top-4 bottom-4 z-40 flex w-[400px] flex-col rounded-xl border border-border bg-card text-foreground shadow-2xl">
      {/* header: thread switcher + token pill + close */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold hover:bg-muted"
          >
            Current Chat
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
              {activeThreads.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center rounded hover:bg-muted",
                    t.id === thread.id && "bg-muted"
                  )}
                >
                  <button
                    onClick={() => {
                      setActiveId(t.id);
                      setMenuOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-left text-sm"
                  >
                    <span className="truncate">
                      {t.id === thread.id
                        ? "Current Chat"
                        : updatedLabel(t.updatedAt)}
                    </span>
                    <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                      {formatTokens(t.contextTokens)}
                    </span>
                  </button>
                  <button
                    title="Archive chat"
                    onClick={() => archiveThread(t.id)}
                    className="mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Archive className="size-3.5" />
                  </button>
                </div>
              ))}

              <button
                onClick={newThread}
                className="mt-1 flex w-full items-center gap-1.5 rounded border-t border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <MessageSquarePlus className="size-3.5" /> New chat
              </button>

              {archivedThreads.length > 0 && (
                <div className="mt-1 border-t border-border pt-1">
                  <button
                    onClick={() => setShowArchived((s) => !s)}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        !showArchived && "-rotate-90"
                      )}
                    />
                    Archived ({archivedThreads.length})
                  </button>
                  {showArchived &&
                    archivedThreads.map((t) => (
                      <div
                        key={t.id}
                        className="group flex items-center rounded hover:bg-muted"
                      >
                        <button
                          onClick={() => {
                            setActiveId(t.id);
                            setMenuOpen(false);
                          }}
                          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-muted-foreground"
                        >
                          {updatedLabel(t.updatedAt)}
                        </button>
                        <button
                          title="Unarchive chat"
                          onClick={() => unarchiveThread(t.id)}
                          className="mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <ArchiveRestore className="size-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          className="ml-auto rounded p-1 hover:bg-muted"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* conversation */}
      <AIConversation className="flex-1">
        <AIConversationContent>
          {thread.messages.length === 0 && (
            <div className="mt-10 text-center text-sm text-muted-foreground">
              Ask anything about this course.
            </div>
          )}
          {thread.messages.map((m) => {
            if (m.role === "user") {
              return (
                <AIMessage from="user" key={m.id}>
                  <AIMessageContent>{textOf(m.parts)}</AIMessageContent>
                </AIMessage>
              );
            }
            const text = textOf(m.parts);
            return (
              <AIMessage from="assistant" key={m.id}>
                <div className="w-full">
                  {m.parts.map((p, i) =>
                    p.type === "tool" ? (
                      <CourseToolCall key={i} part={p} />
                    ) : null
                  )}
                  {text && <AIResponse imageBasePath="">{text}</AIResponse>}
                </div>
              </AIMessage>
            );
          })}
          {queuedMessages.map((text, i) => (
            <AIMessage from="user" key={`queued-${i}`}>
              <AIMessageContent>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2Icon className="size-3 shrink-0 animate-spin" />
                  {text}
                </span>
              </AIMessageContent>
            </AIMessage>
          ))}
        </AIConversationContent>
        <AIConversationScrollButton />
      </AIConversation>

      {/* input */}
      <div className="border-t border-border p-3">
        <AIInput
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <AIInputTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the course agent…"
          />
          <AIInputToolbar>
            <span
              title={`${thread.contextTokens.toLocaleString()} / ${CONTEXT_WINDOW.toLocaleString()} tokens`}
              className="px-2 text-[11px] font-medium tabular-nums text-muted-foreground"
            >
              {formatTokens(thread.contextTokens)} /{" "}
              {formatTokens(CONTEXT_WINDOW)}
            </span>
            <AIInputSubmit status={status} onStop={stop} />
          </AIInputToolbar>
        </AIInput>
      </div>
    </div>
  );
}
