# #6 — Chat UI shell prototype (NOTES)

**Question:** What should the Course Agent side panel look like on the dense course
view — message + tool-call rendering, multi-thread switching, and the #5 token counter?

**Shape:** UI prototype, sub-shape A. Three structurally-different variants mounted on
the **real** course route (`_app.courses.$courseId._index.tsx`) so they're judged against
real density. Read-only, no backend — canned threads/transcript in `mock-data.ts`.

## How to run

```
pnpm dev   # then open any course
```

Append `?agentPanel=A` to the course URL (e.g.
`/courses/<id>?agentPanel=A`). Flip variants with the floating bottom bar or ←/→ keys.
`?agentThread=t1|t2|t3` selects a thread (t3 is empty, to see the empty state).
Dev-only — gated on `!import.meta.env.PROD`, never ships.

## The three variants

| Key | Name            | Structure / primary affordance                                                                                         |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A   | Terminal drawer | Right drawer, **shell metaphor** — monospace, tool calls as `$ ls …` + output. Threads as tabs. Token = thin bar.      |
| B   | Chat-first card | Floating rounded card, **conversation** — bubbles, tool calls as collapsible cards. Threads = dropdown. Token = pill.  |
| C   | Split inspector | Right drawer split: compact transcript on top + **live filesystem tree of explored paths** below. Threads = left rail. |

All three render: tool-call display (the four verbs from #3), multi-thread switching
(localStorage in the real build — here URL-param so it's shareable), and the #5 token
counter (raw "47K"-style, against a 200K window).

## Verdict — **B (Chat-first card) wins.** ✅ Folded in; A/C + switcher deleted.

Winner is the conventional floating chat card: message bubbles, tool calls as
collapsible cards, dropdown thread switcher, token pill. No bits grafted from A/C.

Folded into a real feature folder, reusing the write page's kibo AI primitives
(`AIConversation`, `AIMessage`, `AIResponse`, `AITool`, `AIInput`):

- `app/features/course-agent/course-agent-panel.tsx` — the panel (Variant B).
- `app/features/course-agent/tool-call.tsx` — tool-call display; **lucide icons** per
  verb (not emojis), **pinned to the top** of each row.
- `app/features/course-agent/mock-data.ts` — canned threads (no backend yet).
- Mount: `_app.courses.$courseId._index.tsx`, dev-only, opens via `?agentPanel`.

Refinements applied on fold-in (user calls): swapped emoji tool glyphs for lucide
icons; aligned tool-call icons to the top; added **chat archiving** (archive/unarchive
from the thread dropdown, archived ids persisted to `localStorage`).

**Still open (the v1 implementation, not a map decision):** wire the real agent-loop
route + `useChat` (replacing canned data), then drop the dev-only gate. Plus the two
carry-overs: last-step `outputTokens` in the counter (#5), and #9's thread↔version
binding (threads persist paths/indices).

The prototype variant files (`app/features/course-agent-prototype/`) are deleted.
