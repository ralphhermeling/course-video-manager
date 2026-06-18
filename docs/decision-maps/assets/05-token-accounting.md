# #5 Research note: live context-window token counter (AI SDK v6)

**Verdict: feasible, no new infra.** The installed stack already exposes everything needed
to render a live "context window used" counter (raw tokens, e.g. "100K"). Below are the
authoritative facts (from `node_modules`, not docs) and the recommended wiring.

Stack: `ai` ^6.0.0, `@ai-sdk/react` ^3.0.0, `@ai-sdk/anthropic` ^3.0.0.

## What the SDK exposes

`LanguageModelUsage` (`node_modules/ai/dist/index.d.ts`):

```ts
type LanguageModelUsage = {
  inputTokens: number | undefined; // FULL prompt incl. cached (= noCache+cacheRead+cacheWrite)
  inputTokenDetails: { noCacheTokens; cacheReadTokens; cacheWriteTokens };
  outputTokens: number | undefined;
  outputTokenDetails: { textTokens; reasoningTokens };
  totalTokens: number | undefined;
};
```

Anthropic provider mapping (`@ai-sdk/anthropic/dist/index.mjs`): `inputTokens.total =
input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. So **`inputTokens`
is the true size of the full prompt the model received that request** — system + tools +
entire message history + the new turn — regardless of caching. That is exactly
"context window used." Cached tokens still occupy the window, so including them is correct.

## The load-bearing subtlety: per-step vs total

`StreamTextResult` exposes two usage values:

- `usage` — **last step only**.
- `totalUsage` — **sum across all steps** ("When there are multiple steps, the usage is the
  sum of all step usages").

Our agent is a `ToolLoopAgent`: one user turn = **multiple** model requests (one per tool
round). Each round re-sends the accumulating context, so:

- ❌ `totalUsage.inputTokens` **overcounts** — it adds up every step's growing input. With 5
  tool rounds it can be several× the real window size. **Do not use it for the counter.**
- ✅ The **last step's** `inputTokens` is the real high-water mark (the largest, fullest
  context the model saw this turn). **This is the number to display.**

## How to get the right number to the client

`messageMetadata({ part })` in `toUIMessageStreamResponse` is called for **every** stream
part (verified at `ai/dist/index.mjs:7717`), and a `message-metadata` chunk is emitted for
`finish-step` parts (`:7901`, `:7940`). Each `finish-step` part carries that step's `usage`.
Returning metadata on `finish-step` overwrites the message metadata each round, so the
**final** value left on the assistant message is the **last step's** usage — precisely what
we want. (Returning on the single `finish` part would instead hand us `totalUsage` — the
wrong, summed number.)

Server (`app/routes/courses.$courseId…completions.ts`):

```ts
return result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) => {
    if (part.type === "finish-step") {
      return {
        usage: {
          inputTokens: part.usage.inputTokens ?? 0, // <- context window used
          outputTokens: part.usage.outputTokens ?? 0,
          cacheReadTokens: part.usage.inputTokenDetails?.cacheReadTokens ?? 0,
        },
      };
    }
  },
});
```

Client (`@ai-sdk/react` `useChat`): `UIMessage` carries a generic `metadata` field. Type the
chat with a metadata schema and read the latest assistant message:

```ts
const { messages } = useChat<MyUIMessage>({
  /* … */
});
const last = messages.findLast((m) => m.role === "assistant");
const tokens = last?.metadata?.usage?.inputTokens ?? 0; // render `${Math.round(tokens/1000)}K`
```

The counter updates live: a new `message-metadata` chunk lands after each tool round, so the
number climbs as the agent explores, settling on the final context size when the turn ends.

## Notes / decisions for downstream tickets

- **What to display:** last-step `inputTokens` is "the context the model just read." If you'd
  rather show "size of the conversation that will be sent next," add the last-step
  `outputTokens`. Recommendation: show `inputTokens` as the headline; both are one render
  away. (UI surface is #6's call.)
- **Persistence:** metadata rides on the `UIMessage`, so it survives the localStorage thread
  persistence (#6) for free — no separate store.
- **No pre-send estimate:** this is measured _after_ the model responds. There's no
  count-before-send number without a separate tokenizer; not needed for v1's "used" counter.
- **Empty/`undefined`:** all fields are `number | undefined`; default to `0` before the first
  response.
