# Reference: AI SDK v6 tool-approval flow

Asset for decision map `course-agent-editing.md` #1. Grounded in the **installed**
versions: `ai@6.0.116`, `@ai-sdk/react@3.0.118`, `@ai-sdk/anthropic@3.x` (types read
straight out of `node_modules`), cross-checked against the official v6 cookbook.

## TL;DR

v6 has first-class human-in-the-loop tool approval. A tool opts in with
`needsApproval`; when the model calls it the SDK **does not run `execute`** — it emits a
`tool-<name>` part in state **`approval-requested`** carrying an `approval.id`, and the
stream finishes that step. The client renders approve/deny buttons, calls
`addToolApprovalResponse({ id, approved, reason })` (from `useChat`), and the **full
message list is resent** to the server. On resend the SDK runs `execute` (approved) or
skips it and surfaces a denial to the model (denied). It maps cleanly onto our existing
`ToolLoopAgent` + `toUIMessageStreamResponse` + `useChat` + localStorage setup.

## The state machine (per tool-call UI part)

`ToolUIPart` (typed `tool-<name>`) and `DynamicToolUIPart` (`dynamic-tool`) carry a
`state` that walks through these values (`node_modules/ai/dist/index.d.ts`):

```
input-streaming → input-available
                → approval-requested   (approval: { id })                  ← PAUSE here
                → approval-responded    (approval: { id, approved, reason? })
                → output-available      (approval?: { id, approved: true })   ← approved + ran
                → output-denied         (approval:  { id, approved: false })  ← denied, never ran
                → output-error          (errorText)                            ← execute threw
```

Key shapes (verbatim from the installed `.d.ts`):

- **`approval-requested`** — `{ state, input, approval: { id: string } }`. No `approved`
  yet. This is what the UI keys off to show the accept/reject card.
- **`approval-responded`** — `{ ..., approval: { id, approved: boolean, reason?: string } }`.
  Transient: set locally by `addToolApprovalResponse`, sent to the server.
- **`output-denied`** — `{ ..., approval: { id, approved: false, reason? } }`. **Terminal.**
  The tool never executed. This is the state our R3/R7/user-reject paths land in.
- **`output-available`** — normal result; `approval?.approved === true` when it came via
  the approval gate.

## Server side (our `api.courses.$courseId.agent.ts`)

Today the route builds tools with `tool({ … , execute })`, constructs a `ToolLoopAgent`,
calls `agent.stream({ messages })`, and returns `result.toUIMessageStreamResponse({…})`.
To gate a write tool, **add `needsApproval`** to that tool — nothing else about the
stream construction changes:

```ts
const writeTool = tool({
  description: "Write a complete new version of a VFS file …",
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  needsApproval: true, // boolean — or a function (see below)
  execute: async ({ path, content }) => {
    // derive ops, validate matrix, apply — runs ONLY after approval
  },
});
```

`needsApproval` type (`@ai-sdk/provider-utils`):

```ts
needsApproval?: boolean | ToolNeedsApprovalFunction<INPUT>;
// ToolNeedsApprovalFunction = (input, { toolCallId, messages }) => boolean | PromiseLike<boolean>
```

So approval can be **conditional on the input** — e.g. skip approval for no-op writes, or
(per our matrix) we could pre-screen here, though R3's atomic-reject is better as a thrown
tool error than a `needsApproval` decision (a denial isn't a correction message).

**Resume requires `originalMessages`.** When the approved message list is resent, the SDK
must locate the original tool-call part to attach the new output to. Pass the incoming
messages through:

```ts
return result.toUIMessageStreamResponse({
  originalMessages: messages, // the UIMessage[] from the request
  messageMetadata({ part }) {
    /* …existing usage code… */
  },
});
```

(This is the root cause of vercel/ai#10196 — "no tool invocation found" — which was a
missing `originalMessages` in `createAgentUIStream`; fixed for v6.0, but the lesson is to
always thread `originalMessages` ourselves since we drive the stream manually.)

`convertToModelMessages(messages)` already handles `approval-responded`/`output-denied`
parts in 6.0.116 — no change needed there beyond keeping the parts intact in localStorage.

## Client side (our `course-agent-panel.tsx`)

`useChat` exposes `addToolApprovalResponse` (confirmed in `@ai-sdk/react@3.0.118`):

```ts
const { messages, sendMessage, addToolApprovalResponse, status } = useChat({
  transport: new DefaultChatTransport({
    api: `/api/courses/${courseId}/agent`,
    body: { versionId },
  }),
  messages: thread.messages,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses, // ⚠ see caveat
});

addToolApprovalResponse({ id, approved, reason }); // id === part.approval.id
```

Signature (`ChatAddToolApproveResponseFunction`):
`({ id: string; approved: boolean; reason?: string }) => …`

Rendering, slotted into the existing `m.parts.map` (alongside `asVfsToolPart`):

```tsx
if (part.type === "tool-write" /* or dynamic-tool w/ toolName==="write" */) {
  switch (part.state) {
    case "approval-requested":
      return (
        <ApprovalCard
          input={part.input}
          onApprove={() =>
            addToolApprovalResponse({ id: part.approval.id, approved: true })
          }
          onReject={() =>
            addToolApprovalResponse({ id: part.approval.id, approved: false })
          }
        />
      );
    case "output-available":
      return <Applied output={part.output} />;
    case "output-denied":
      return <Rejected reason={part.approval.reason} />;
    case "output-error":
      return <Errored text={part.errorText} />;
  }
}
```

Our write tool is registered statically on the agent, so it arrives as `tool-write`
(typed part) — same branch the existing `asVfsToolPart` normalizer already handles for
`tool-*` vs `dynamic-tool`. The #6 breakdown UI renders inside the `approval-requested`
card from `part.input` (the proposed file) — but note the **derived op-list isn't in the
UI part**: the tool input is just the new file content. Either (a) the breakdown is
computed client-side from before/after, or (b) the diff is surfaced some other way. **This
is a genuine open question for #6/#7 — see "Handoff".**

## What the model sees on reject (answers the ticket's core question)

- **Approve** → `execute` runs on resend; its return value becomes the tool result the
  model reacts to. Normal loop continuation.
- **Deny** → `execute` is **skipped**; the SDK feeds a denial back into the loop as the
  tool's outcome (state `output-denied`). The model **sees it and can respond** — the turn
  is _not_ aborted. This is exactly the channel R3 (forbidden-op) and R7 (staleness) want
  for correction messages — though those two are server-side rejects (a thrown tool error
  → `output-error`), distinct from a _user_ denial (`output-denied`). Both keep the loop
  alive; they differ only in which terminal state and who triggered it.

## ⚠ Version caveats (specific to `ai@6.0.116`)

1. **`sendAutomaticallyWhen` does not fire on denial — vercel/ai#13670 (OPEN, affects
   6.0.116).** `lastAssistantMessageIsCompleteWithApprovalResponses` omits `output-denied`
   from its terminal-state check, so after a **reject** the predicate never fires and the
   stream **hangs** — it only auto-resumes on approve. This directly hits our reject/retry
   flow (#7). Workarounds until upstream PR #13672 lands:
   - **Don't rely solely on the predicate for denials.** After `addToolApprovalResponse({
approved: false })`, call `sendMessage()` (or `regenerate`) manually to kick the
     resend; or
   - Pass a **custom `sendAutomaticallyWhen`** that also treats `output-denied` as
     complete (the one-line fix, reimplemented locally), or
   - Pin/upgrade `ai` once the fix ships and drop the workaround.
     Whichever we pick, #7 must explicitly handle "user denied → resume the loop."

2. **Always pass `originalMessages` to `toUIMessageStreamResponse`** (vercel/ai#10196).
   We drive the stream manually, so this is on us.

3. **localStorage persistence is essentially free.** Approval lives _in the message parts_
   (`approval-requested` / `approval-responded` / `output-denied` are normal
   `UIMessage.parts` entries). Our existing debounced `saveThreads(courseId, messages)`
   already persists them. On reload, a thread whose last assistant message sits in
   `approval-requested` rehydrates with the pending card intact — the user can approve/deny
   after a refresh. The only in-flight state that does NOT survive is an _actively
   streaming_ response (same as today). No extra persistence work needed for approvals
   themselves; just ensure the resend wiring (#7) re-fires on rehydrated pending approvals
   if desired (or simply let the user click the still-rendered button).

## Sources

- Installed types: `node_modules/ai/dist/index.d.ts`,
  `node_modules/@ai-sdk/provider-utils/dist/index.d.ts`,
  `node_modules/@ai-sdk/react/dist/index.d.ts`.
- [AI SDK UI: Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
- [Next.js: Human-in-the-Loop cookbook](https://ai-sdk.dev/cookbook/next/human-in-the-loop)
- [AI SDK 6 beta announcement](https://ai-sdk.dev/docs/introduction/announcing-ai-sdk-6-beta)
- [vercel/ai#13670 — sendAutomaticallyWhen never fires on denial (open, 6.0.116)](https://github.com/vercel/ai/issues/13670)
- [vercel/ai#10196 — "no tool invocation found" / missing originalMessages (closed, v6.0)](https://github.com/vercel/ai/issues/10196)
