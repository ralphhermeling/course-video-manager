# Decision Map: Course Agent (filesystem explorer)

A read-only AI agent embedded in the course view that explores a course through a
**virtual filesystem** metaphor (stateless absolute paths, bash-flavoured tools:
`ls`, `tree`, `cat`, `grep`). Goal of v1: ask questions about a course and test the
agent's exploration capability. Write-back is explicitly out of scope for v1 but the
file/Zod design must anticipate it.

## Resolved inline (do not re-litigate)

- **Infra**: reuse existing `useChat` + streaming completions pattern
  (`app/routes/videos.$videoId.completions.ts`, `app/services/text-writing-agent.ts`).
  New route under `/courses/:courseId/...`. Agent loop via `@ai-sdk/anthropic`.
- **Addressing model**: stateless **absolute paths** — every tool call carries a full
  path, no `cd`/working-directory state. (Per #10, bare/`../` paths are permitted as **input
  sugar** resolved against an immutable current-course anchor, but normalized to absolute before
  persistence/grep/round-trip — so statelessness holds; the anchor is never agent-mutable.)
- **Root & scope** (REVISED by #10 — was "agent sees only the currently-viewed CourseVersion"):
  the VFS root is the **catalogue of all non-archived courses** (`/courses/<c>/…`); the open
  course is the announced, immutable **anchor** and the default scope. Version is **per-course,
  out of the path**, pinned per thread `{courseId → versionId}` (current = view's selection,
  others = latest) — see #9, #10.
- **Search backend**: Postgres regex (`~*`, case-insensitive) over text fields — see #4
  (overrides an earlier `LIKE` assumption; same cost at this scale). No FTS — scale is
  small (see below).
- **Leaf model**: leaves are **files**. A file's content is JSON conforming to a
  per-file **Zod schema**; for v1 read-only we ship the read shape, but the schema is
  designed so a future write path can validate edits and feed Zod errors back to the
  agent.
- **`tree`**: included as a tool (recursive listing).
- **UI shell**: collapsible **side panel** on the course view; multiple chat threads
  persisted to **localStorage**; a live **context-window token counter** (raw tokens,
  e.g. "100K") shown in the UI.
- **Scale** (bounds the design, makes raw `ls`/`tree` safe): ≤20 sections/course,
  ≤20 lessons/section, ≤4 videos/lesson. Transcripts are the only large blobs.

## Search-tool reference

Mimic ripgrep: `grep(pattern, path?, mode?)` → `mode` ∈ {content, files, count}.
`content` returns `path:snippet` lines whose paths feed straight back into `cat`/`tree`.
Searches a fixed field set: section/lesson titles+descriptions, segment titles+descriptions,
clip text (transcripts), chapter names. Shared address space with navigation.

---

## Frontier

- **#1 / #2 / #3 / #4 / #5 / #6 resolved** (model, addressing, tool surface, grep, tokens,
  UI shell — #6 picked Variant B "chat-first card", folded into `app/features/course-agent/`).
- **#8 resolved**: dropped the jq binary — `cat(path, filter?)` keeps its surface but uses a
  small in-memory JS projection vocabulary, no dependency (overrides #3's shell-out plan).
- **#9 resolved**: bind a thread to its version (pin per-thread); path stays **version-free**.
  Settles the #9↔#10 coupling — version is pinned `{courseId → versionId}` per thread, never in
  the path. Also closed #1's ghost-interior gap (ghost dirs carry their metadata file + an empty
  child dir; no `timeline.json`).
- **#10 resolved (revised via `/grilling`)**: **multi-course root in v1**. VFS root = catalogue
  of non-archived courses (`/courses/<c>/…`); open course is an immutable **anchor** = default
  scope; `/` = catalogue, `..` = siblings; bare/`../` are input sugar normalized to absolute
  (statelessness #1 holds — no mutable cwd). Version stays out of the path, pinned per-thread
  `{courseId → versionId}`. Course `<c>` = sanitized, unique-among-non-archived `name` (extends
  #2 up a level — a **v1 prerequisite** migration). Overrode the resolved-inline "Version scope"
  note and #1's root; obsoleted the deferred #11 (now folded into v1).
- **All v1 frontier tickets resolved.** No open unblocked tickets remain in scope. Only **#7**
  (write-back) stays deep fog (post-v1). → v1 path is clear; ready for implementation /
  `/to-prd-project`.

## #1: Define the virtual filesystem model

Type: Discuss (domain-modelling)
Blocked by: —

### Question

What is the complete path tree and node taxonomy? Specifically:

- Full path scheme from course root down (e.g. `/sections/<x>/lessons/<y>/videos/<z>/...`).
- Which nodes are **directories** vs **files**.
- The exact set of **leaf files** at/under a Video (e.g. `transcript.json`,
  `segments.json`, `chapters.json`, `video.json`) and what each contains.
- The **Zod schema** for each file (read shape now; designed to also serve write later).
- How Segments / Clips / Chapters / derived Transcript map onto files vs listings.

### Answer

> ⚠️ **ROOT REVISED BY #10.** The single-course root below is superseded: the VFS root is the
> **catalogue** of non-archived courses, and every path here is **prefixed by `/courses/<c>/`**
> (e.g. `/courses/<c>/sections/<section>/section.json`). The current course is an immutable
> **anchor**, so bare/relative paths (`sections/<section>/…`) still resolve as written below for
> the open course — `/` now means the catalogue, not the course. The per-course taxonomy in this
> ticket (directories, files, schemas, ghosts) is otherwise unchanged. See #10.

**Root** = ~~the currently-viewed CourseVersion~~ the catalogue (#10); the open
CourseVersion is the anchor. Archived entities are excluded (soft-delete = absent from the VFS).
Standalone videos / pitches / diagrams are out of scope (not in the course hierarchy). Domain
schema reference: `app/db/schema.ts`.

**Path scheme — typed wrapper directories** (chosen over bare on-disk paths for legibility
and clean grep-scoping; bare `ls` self-describes the current course's taxonomy):

```
/courses/<c>/course.json                                                          (#10 prefix)
/courses/<c>/sections/<section>/section.json
/courses/<c>/sections/<section>/lessons/<lesson>/lesson.json
/courses/<c>/sections/<section>/lessons/<lesson>/videos/<video>/{video.json,segments.json,timeline.json}
```

`<c>` is the unique, path-safe course-name segment (#10 + #2). `<section>`/`<lesson>`/`<video>`
segment names are #2's concern; assume existing `path` slugs for now.

**Directories** (listable, no content): `/`, `sections/`, each `<section>`, `lessons/`,
each `<lesson>`, `videos/`, each `<video>`.

**Files** (cat-able, JSON, per-file Zod schema — read shape now, write contract later for #7):

| File                     | Source           | Read shape                                                                                                                                                                       |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/course.json`           | Course + version | `id, name, memory, version:{id,name,description}`                                                                                                                                |
| `<section>/section.json` | Section          | `id, slug, description, order, real:boolean` (no title field — name derives from slug; `real` is **derived**: ≥1 real lesson)                                                    |
| `<lesson>/lesson.json`   | Lesson           | `id, title, slug, description, icon, priority, dependencies[], authoringStatus, fsStatus, order`                                                                                 |
| `<video>/video.json`     | Video            | `id, name, originalFootagePath, warnings[]` (warnings derived live)                                                                                                              |
| `<video>/segments.json`  | Segments         | ordered `[{id, kind, title, description, order}]` — pre-record plan                                                                                                              |
| `<video>/timeline.json`  | Clips + Chapters | ordered union, interleaved in timeline order: `{type:"chapter", id, name}` \| `{type:"clip", id, text, sourceStartTime, sourceEndTime, videoFilename, beatType, scene, profile}` |

**Clips + chapters are one interleaved `timeline.json`, not two files.** They share one
timeline order; the Transcript domain concept _is_ the interleaved projection, and which
clips fall under which chapter is the key relationship — splitting them forces a re-merge
and loses it. Array position encodes order (explicit `order` drops from the read shape;
ids stay for write-back). Mirrors the `TranscriptItem` union in `transcript-builder.ts`.
`segments.json` stays separate — the "what I _planned_" view is deliberately distinct from
the recorded timeline.

**No `transcript.md`.** Prose→clip edits are unrecoverable, so there's no writable
transcript file. `timeline.json` is the single canonical source of clip text; an agent
"reads the video" by cat-ing it and reading each clip item's `text` in order. A prose
transcript is a UI/tooling _rendering_ of `timeline.json`, not a node. (Updates the
"Transcripts are the only large blobs" note above: clip text still is — it just lives in
`timeline.json`.)

**Ghosts are surfaced, via an `ls` type-annotation (Option A).** Ghost lessons/sections
are included (the agent should reason about planned content). Ghost-ness is a node
_attribute_, marked the way `ls -F` marks node kinds — a trailing `[ghost]` tag in
`ls`/`tree`, with the canonical path left clean (so #2 addressing and grep round-trip):

```
$ ls /sections/01-intro/lessons
01.01-welcome/
01.02-setup/
01.03-advanced/   [ghost]
```

Authoritative source of truth is the metadata file (`lesson.json.fsStatus`,
`section.json.real`); the `[ghost]` tag is the at-a-glance signal. Exact render string is
#3's to finalize; the _convention_ (attribute, not path-suffix or sentinel file) is locked
here. Mental model: a ghost is a dangling symlink — points at a disk location Materialize
hasn't created yet.

## #2: Path uniqueness & addressing strategy

Type: Discuss
Status: resolved
Blocked by: #1

### Question

The data model has **no dedup** — two sections/lessons can share a `path` (and, per #1,
sibling **videos** under one lesson are addressed by a slug too, so they collide the same
way). The VFS needs collision-free addressing. Decide between: (a) enforce uniqueness in the data
(migration + constraint + UI guard), or (b) derive unique slugs at the VFS layer
(disambiguate by appending an id/suffix), or (c) hybrid. Whichever we pick must keep
`grep` output paths round-trippable back into `cat`. Note: the user expects adding
dedup logic as part of this work.

### Answer

**Decision: enforce uniqueness in the _data_ (option a), not at read time.** The DB `path`
_is_ the VFS segment name; the VFS layer does **zero** runtime disambiguation. Rejected
option (b) runtime suffixing: it produces **unstable** addresses (delete `intro`, and
`intro-2` silently becomes `intro`), which breaks three things already locked in —
stateless _absolute_ paths (#1), grep round-tripping across edits (#1/#4), and the
localStorage-persisted chat threads that store paths across sessions (#6) — and #7
write-back makes address stability non-negotiable.

> **EXTENDED BY #10:** a **course** level is added on top (multi-course root). Course `<c>` =
> a sanitized, path-safe projection of `courses.name`, **unique among non-archived courses**.
> The same mechanism below applies one level up — backfill + partial unique index + create/rename
> guard — with two specifics: dedup on the **sanitized** segment (not raw `name`, so `"A/B"` and
> `"A B"` can't collide), and scope `WHERE NOT archived` (uses `courses.archived`, schema.ts:46).
> This is a **v1 prerequisite** — it must ship before the agent can address courses.

**Collision risk is uneven** (`app/db/schema.ts:85,113,180` — no unique constraint
anywhere today):

| Level   | Path shape                  | Scope                               | Order source                | Risk                                 |
| ------- | --------------------------- | ----------------------------------- | --------------------------- | ------------------------------------ |
| Course  | sanitized `name` segment    | per catalogue (non-archived) — #10  | n/a                         | **high — free text, no constraint**  |
| Section | `01-intro` (`NN-slug`)      | per CourseVersion (`repoVersionId`) | `order` float               | low — number prefix disambiguates    |
| Lesson  | `01.03-slug` (`XX.YY-slug`) | per Section (`sectionId`)           | `order` float               | low — number prefix disambiguates    |
| Video   | free filename               | per Lesson (`lessonId`)             | **none — sorted by `path`** | **high — no prefix, no order field** |

**Mechanism:**

1. **Backfill (= the dedup logic).** One deterministic pass renames colliding `path`s
   within each scope, keeping the first and suffixing the rest `-2`, `-3`… Stable
   tiebreak: `order` → `createdAt` → `id` (videos have no `order`, so `createdAt`/`id`
   carry it). Suffix goes _before_ a file extension if the video path has one. Required
   regardless — a unique index can't be added while duplicate rows exist.
2. **Partial unique indexes**, scoped to parent, **non-archived only** (archived rows are
   absent from the VFS per #1, so they're irrelevant to addressing): section
   `(repoVersionId, path) WHERE archivedAt IS NULL`; lesson `(sectionId, path) WHERE NOT
archived`; video `(lessonId, path) WHERE NOT archived`. **Ghosts are included** (real
   rows, not archived) — a ghost and a real sibling sharing a path is a genuine collision
   the index must catch.
3. **VFS trusts uniqueness** — paths round-trip into `cat`/`tree`/`grep` with no suffixing.
4. **Create/rename guard (in scope).** Service-layer validation at every
   section/lesson/video create and rename site, returning a friendly "name taken in this
   <parent>" error instead of a raw constraint violation. Kept under this ticket (user
   call) so steady-state collision _prevention_ ships with the one-time backfill, not after
   it — even though v1's agent is read-only and only the human UI can create a collision.

**Out of scope (confirmed with user):** no `order` column added to videos —
path-alphabetical ordering stays; once paths are unique it's deterministic.

## #3: Tool surface & command semantics

Type: Discuss → Prototype
Blocked by: #1
Status: resolved

### Question

Final tool set and signatures: `ls`, `tree`, `cat`, `grep` (and do we want `find`?).
For each: arguments, output format (plain text vs JSON), depth/truncation rules,
and error behaviour for bad paths. How "bashy" should descriptions be? Confirm the
minimal viable set vs the generous set. Also finalize the `[ghost]` annotation render
string (convention locked in #1; exact string is here).

**jq projection (candidate — leaves are all JSON, so worth it for token efficiency).**
The big blob is `timeline.json`; an agent wanting only chapter names / clip texts / a
count shouldn't `cat` the whole file. Decide: (a) a `jq?` filter arg on `cat`
(`cat(path, jq?)` — keeps the surface to four verbs) vs. (b) a standalone `jq` tool. And
implementation: evaluate the filter against the in-memory JSON we already generate (clean,
since the files are virtual) vs. shell out to a real `jq` binary.

### Answer

**Tool set: four verbs — `ls`, `tree`, `cat`, `grep`. No `find`** (`tree` lists the whole
course cheaply at this scale; `grep` covers name search). Defined via `tool()` from `"ai"`
(AI SDK v6) with Zod 4 `inputSchema` + per-field `.describe()`; each has a real `execute`
computing from the in-memory VFS object (leaves are generated, not on-disk). Names and
descriptions are deliberately **bashy** — the model has strong priors for these verbs.

**Signatures & output** — navigation/search emit **plain bash-style text**; `cat` is the
only **JSON**-emitting verb:

- `ls(path)` → one entry per line; dirs get a trailing `/`; ghost dirs tagged (below).
- `tree(path?, depth?)` → unix-`tree` indented text; full depth by default (safe at scale),
  optional `depth`. ~400-line guardrail (shouldn't trigger).
- `cat(path, filter?)` → leaf file JSON, pretty-printed 2-space; `filter` = jq (below).
- `grep(pattern, path?, mode?)` → semantics, modes, and output format owned by **#4**
  (modes `{content, files}`; `count` deferred there).

**Errors mimic bash — returned, not thrown** (the model self-corrects in-loop): e.g.
`cat: /foo: No such file or directory`, `cat: /sections: Is a directory`,
`ls: /x: No such file or directory`. `execute` returns the error text as ordinary tool
output; paths stay round-trippable.

**Ghost render string (finalizes #1's locked convention):** a trailing `   [ghost]` after
the entry, canonical path left clean — `01.03-advanced/   [ghost]`. In `ls`/`tree` only;
**grep output stays clean** (per #4, grep paths must round-trip into `cat`). Only
section/lesson dirs are ever ghosts; files never are.

**jq projection — `cat(path, filter?)`. ⚠️ SUPERSEDED BY #8:** the shell-out-to-jq
implementation below is overridden — #8 keeps the `cat(path, filter?)` surface and the
`.[i]` round-trip but drops the binary for a small in-memory JS projection vocabulary (no
jq dep). Read #8 for the live decision; the paragraph below is kept only as the rationale
trail. ~~**chosen: `cat(path, filter?)`, shelling out to the real `jq` binary.**~~
Verified `jq-1.7` is on PATH (no npm `jq` dep needed); this is a local-first tool, so binary
presence is reliable. Keeps the surface at four verbs. Impl: serialize the in-memory leaf
object → pipe to `jq <filter>` on stdin → return stdout; on non-zero exit, return jq's
stderr verbatim as the bash-style error (jq errors _are_ bash errors — consistent with the
error model above). Chosen over an in-memory JS-jq lib: real jq is more faithful/capable,
gives good native error messages, and adds zero npm dependency. Solves the one real token
problem — projecting the large `timeline.json` (chapter names / clip texts / counts) without
cat-ing the whole blob. **jq indices align with #4's read-locators** (`grep` reports
`timeline.json[i]` → `cat /…/timeline.json '.[i]'` round-trips). **Carry into
implementation:** guard for a missing `jq` binary (degrade to full `cat` + a one-line
notice) if this ever runs headless/server-side.

**Prototype follow-up:** the tool _design_ is locked here via discussion — no open decision
remains, so no separate prototype ticket is spawned. Validating the agent's actual
exploration behaviour with these four verbs is the first **implementation** step (and the v1
goal), not a map decision; UI ergonomics are covered by #6.

## #4: Search/grep semantics & output format

Type: Discuss
Blocked by: #1
Status: resolved

### Question

Lock the `grep` design (see Search-tool reference above): exact field set, output
modes, path-prefix scoping, snippet/context rules, and how transcript hits report
location (clip-level vs chapter-level). Confirm `LIKE` is adequate or whether any
field needs smarter matching.

### Answer

**Signature:** `grep(pattern, path?, mode?)`. `path` scopes the search to that subtree
(prefix match against the VFS address space); omitted = whole course. `mode ∈ {content,
files}` (default `content`). **`count` deferred** — rarely what an exploring agent wants,
trivial to add later.

**Matching engine: Postgres regex `~*` (case-insensitive), not `LIKE`.** The tool is sold
as "mimic ripgrep" and the consumer is an LLM that knows regex; rejecting `foo.*bar` would
surprise it. `~*` costs the same as `LIKE` at this scale. (Overrides the resolved-inline
"SQL LIKE" note.)

**The sub-file location problem (the crux).** Real matches live _inside_ files (a clip's
`text` is one of many in one `timeline.json`), but the finest addressable node is a file.
So a content line reports **file path + a structural locator**, chosen by file shape:

- **Array files** (`timeline.json`, `segments.json`): locator is the **array index** —
  `path[i]` where `i` is the position in the JSON array the agent will `cat` (for
  `timeline.json`, the interleaved clip+chapter union). It's terse, jq-addressable (`.[i]`),
  and aligns with #1's "array position encodes order." Indexes are stable in read-only v1
  (version is fixed).
- **Object files** (`course.json`, `section.json`, `lesson.json`, `video.json`): locator is
  the **field name** — `path:field` (e.g. `lesson.json:description`).
- **Path/name hits**: report the node's own (already-addressable) path, tagged `[path]`,
  no locator.

**Read-locator = index; write-locator = id.** grep displays index for read-time ergonomics;
the item `id` remains visible in the `cat` output (already in #1's read shape). #7's write
path addresses by `id` (survives reordering); read-time exploration stays terse with index.
Guidance for #3 (jq) and #7.

**Output formats:**

- `content` (default): one line per hit, `path[locator]: <matched text>`. Whole field/clip
  text shown (all fields are short — no windowing needed). Cap at first match per item.
- `files`: deduped paths that contain ≥1 match, one per line (one line per file even if many
  clips match). The token-saver for "where does X appear?".

**Field set (final).** Searches both directory/file _names_ (paths) and file _content_,
across the shared address space:

| Node          | Searched fields                                  |
| ------------- | ------------------------------------------------ |
| course.json   | course `name` (**not** `memory` — too noisy)     |
| section.json  | `path`/slug, `description`                       |
| lesson.json   | `path`/slug, `title`, `description`              |
| video.json    | `path`/slug only (**not** `originalFootagePath`) |
| segments.json | per-segment `title`, `description`               |
| timeline.json | per-clip `text`, per-chapter `name`              |

Excluded as structural noise: `clip.videoFilename`, `video.originalFootagePath`,
`course.memory`. (Note "path actually stores the entity _name_" in much of the DB — so
searching `path` is how you grep by section/video name, neither of which has a title field.)

**Transcript hit location: clip-level** (`timeline.json[i]` where `i` is the clip's index
in the interleaved timeline), not chapter-level — the index round-trips straight back into
`cat`/jq, and the surrounding chapter is visible by reading nearby items.

Updates the Search-tool reference above accordingly (regex not LIKE; path/slug added to the
field set; `count` mode dropped).

## #5: Token-usage accounting feasibility

Type: Research
Status: resolved
Blocked by: —

### Question

Can we render a live "context window used" counter in raw tokens? Determine what
`@ai-sdk/react` / the streaming response exposes (cumulative `usage`, per-message
tokens), whether it reflects the _full_ context (system + tools + history) or just
the last turn, and how to surface a running total. Produce a short findings note.

### Answer

**Feasible, no new infra.** Full findings + wiring code: [assets/05-token-accounting.md](assets/05-token-accounting.md).
Headlines:

- **The number exists and is the right one.** Anthropic's per-request `input_tokens` (AI SDK
  `LanguageModelUsage.inputTokens`) is the **full prompt** that turn — system + tools + entire
  history + new message, cached tokens included. That _is_ "context window used"; it is **not**
  a cumulative cross-turn sum.
- **Crux — per-step, not total.** Our agent is a `ToolLoopAgent`: one user turn = many model
  requests (one per tool round), each re-sending the growing context. `totalUsage` **sums**
  every step and badly overcounts — **do not use it**. Use the **last step's** `usage`
  (the high-water mark = real window size).
- **Plumbing (verified in `node_modules`, not docs):** `toUIMessageStreamResponse`'s
  `messageMetadata({ part })` fires on every part incl. `finish-step`
  (`ai/dist/index.mjs:7717, 7901, 7940`); return the step's `usage` on
  `part.type === "finish-step"` so the latest round overwrites — the message ends with the
  last step's count. Client reads it via `UIMessage.metadata` from `useChat`. Updates live as
  the agent explores; rides on the `UIMessage` so it survives #6's localStorage threads for free.
- **Caveats:** measured _after_ the response (no pre-send estimate without a separate
  tokenizer — not needed for v1); whether to add last-step `outputTokens` and the exact UI
  surface are **#6's** call.

## #6: Chat UI shell (side panel, threads, token counter)

Type: Prototype
Status: resolved
Blocked by: #5, #3

### Question

Prototype the collapsible side panel on the dense course view: multi-thread switcher
backed by localStorage, message rendering with tool-call display, and the token
counter from #5. Validate it coexists with the information-dense course view.

### Answer

**Decision: Variant B — "Chat-first card".** A floating rounded card on the right of the
course view: message bubbles, tool calls as collapsible cards, a dropdown thread switcher,
and the #5 token counter as a pill. Chosen over A (terminal drawer) and C (split inspector
with a live explored-paths tree) after reviewing all three on the live course route. Full
record + run notes: [assets/06-ui-shell-prototype.md](assets/06-ui-shell-prototype.md).

**Folded into real code** (prototype variants A/C + the switcher deleted), reusing the
write page's kibo AI primitives (`AIConversation`, `AIMessage`, `AIResponse`, `AITool`,
`AIInput`):

- `app/features/course-agent/course-agent-panel.tsx` — the panel.
- `app/features/course-agent/tool-call.tsx` — tool-call display; **lucide icons** per verb
  (ls→FolderOpen, tree→ListTree, cat→FileText, grep→Search), **top-aligned** to the row.
- `app/features/course-agent/mock-data.ts` — canned threads (no backend yet).
- Mounted dev-only in `_app.courses.$courseId._index.tsx`, opens via `?agentPanel`.

User refinements applied on fold-in: emojis → lucide icons; tool-call icons top-aligned;
**chat archiving** (archive/unarchive from the thread dropdown, archived ids persisted to
`localStorage`).

**Carried into v1 implementation (not map decisions):** wire the real agent-loop route +
`useChat` to replace canned data and drop the dev-only gate; whether to add last-step
`outputTokens` to the counter (#5 caveat); and honour #9's thread↔version binding (threads
persist paths/indices).

## #8: jq runtime dependency (re-opens #3's jq sub-decision)

Type: Research
Status: resolved
Blocked by: —

### Question

#3 chose to shell out to a real `jq` binary for `cat(path, filter?)`, verified as "jq-1.7 on
PATH" — but that was checked on the **dev box**, and the carry-note frames server-side
execution as hypothetical. It isn't: `videos.$videoId.completions.ts` is a React Router
`action`, so the agent loop and every `cat`-with-filter run **server-side**. `jq` is **not** a
project dependency anywhere (the repo shells out via `node:child_process` plenty, but never to
jq). So the decision rests on an unverified assumption about the deploy/CI image.

Decide: (a) confirm jq ships in the deploy/CI target and keep the shell-out; (b) bundle a binary
(`node-jq`); or (c) **drop the binary** — files are tiny and already in-memory (#3), so the only
real need (projecting `timeline.json` → chapter names / clip texts / counts) may be cheaper to
hand-roll in JS than to maintain a binary dependency + per-call subprocess spawn. Whichever wins,
the `cat(path, filter?)` surface and #4's index-alignment (`.[i]`) must survive.

### Answer

**Decision: (c) — drop the binary. No jq dependency (system or bundled); the `filter`
argument becomes a small closed projection vocabulary, evaluated in-memory in JS.**
This overrides #3's "shell out to real jq" sub-decision (#8 was explicitly licensed to
re-open it). The `cat(path, filter?)` four-verb surface and #4's `.[i]` index round-trip
both survive unchanged.

**Findings (verified, not assumed):**

- `jq` is **not** a dependency anywhere — absent from `package.json`/lockfile.
- The app is **local-first**: no production/cloud deploy exists (CONTEXT.md lists "Deploy"
  under _Avoid_; no fly/aws/k8s/heroku markers). It runs `pnpm start` → `node` on the dev
  box, where `jq-1.7` happens to be on PATH. The agent loop (a React Router `action`) runs in
  **that same local process**, so jq is present today only by coincidence of the machine.
- The **only** Dockerfile is `.sandcastle/Dockerfile` (the Sandcastle **agent sandbox**),
  which `apt-get install`s jq for the dev agent — _not_ a runtime image for the app. CI is
  `ubuntu-latest` (has jq) but never runs the app's agent loop.

**Why (c) over (a)/(b):**

1. **The round-trip is backwards.** #3's leaf files are _generated in-memory_ as typed
   objects (`timeline.json` ⇐ `TranscriptItem[]` from `transcript-builder.ts`). Shelling to
   jq means `object → JSON.stringify → spawn subprocess → jq parses → filter → stdout →
parse`. jq exists to query JSON _text from an unknown source_; we own the data. A
   subprocess to filter an object already in hand is the canonical "you don't need jq" case.
2. **Undeclared-dependency fragility.** (a) keeps a core feature riding an _undeclared_
   system binary — it works on Matt's box and silently breaks anywhere jq isn't installed
   (fresh machine, future deploy, a contributor). The #3 guard ("degrade to full `cat` +
   notice") doesn't save it: that fallback re-inflates exactly the tokens jq was added to
   save, so the feature quietly defeats its own purpose. (b) `node-jq` adds an npm dep +
   per-call subprocess spawn to solve a problem the data shape doesn't have.
3. **The real need is tiny and closed.** Projection only matters for the one large blob,
   `timeline.json` (and lightly `segments.json`); every object file is small enough to `cat`
   whole. The needed projections are a handful: chapter-names, clip-texts, count, and an
   index/range slice (the #4 round-trip). Open-ended jq syntax is more surface than the task
   needs — and for v1's goal (predictable agent exploration), a small _documented_ filter
   vocabulary the agent is told about beats arbitrary jq it can mis-write.

**The closed `filter` vocabulary (in-memory, ~30 lines, no deps).** `cat(path, filter?)`;
`filter` omitted ⇒ whole file. Each is a pure JS function over the generated leaf object:

| `filter` | Meaning                                            | Applies to                                                                  |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `.[i]`   | the item at array index `i`                        | array files (`timeline.json`, `segments.json`) — **the #4 grep round-trip** |
| `.[i:j]` | array slice (half-open)                            | array files                                                                 |
| `names`  | chapter names only, in order                       | `timeline.json`                                                             |
| `text`   | clip texts only, in order ("read the video")       | `timeline.json`                                                             |
| `count`  | number of items (or `chapters`/`clips` sub-counts) | array files                                                                 |
| `.field` | a single top-level field                           | object files                                                                |

Errors stay bash-style and **returned, not thrown** (consistent with #3): an unknown filter
or out-of-range index returns e.g. `cat: .[99]: index out of range` /
`cat: bad filter: 'foo'`. The exact final string list is an implementation detail; the
_contract_ (closed set, in-memory, `.[i]` round-trips #4) is locked here.

**Carry into implementation:** the projector lives next to the VFS leaf generator (one
function `applyFilter(leaf, filter)`), unit-tested against the `TranscriptItem` shapes.
No `jq` guard, no subprocess, no PATH check anywhere.

## #9: Version identity in the address space

Type: Discuss
Status: resolved
Blocked by: #1

### Question

The map calls paths "stateless absolute paths" (#1), justifies stable `timeline.json[i]` indices
with "version is fixed" (#4), and persists chat threads — paths and indices baked in — to
localStorage **across sessions** (#6, reinforced by #5's metadata-on-`UIMessage` plumbing). But
the path scheme has **no version segment**; root is "the _currently-viewed_ CourseVersion." These
collide: if the viewed version changes between sessions, every persisted path and index in an old
thread silently re-points at a different version's content — no error, just wrong answers.
"Stateless" is only true _within a fixed version_; the version is hidden stateful context.

Decide one: (a) **bind a thread to the version** it was created against (thread carries a
`versionId`; switching the course view either scopes/greys mismatched threads or warns); (b)
**encode version in the path** (`/versions/<v>/sections/...`) so addresses are globally stable;
or (c) **accept the reflow** and document that threads follow the live version. Interacts with
#6 (thread model) and #7 (write-back against a stale version is dangerous, not just wrong).

Also pin the small gap left by #1: what do `ls`/`cat` return _inside_ a ghost lesson/section
(no real videos, no `timeline.json`) — empty dir, or a lone `lesson.json` with `fsStatus: ghost`?

### Answer

**Decision: (a) — bind a thread to the version it was created against. The path scheme stays
version-free; the agent loop resolves every path against the _thread's_ pinned version, never
the course view's live `?versionId`.**

**Decisive fact (verified):** the viewed version is **already explicit URL state** —
`_app.courses.$courseId._index.tsx:84` reads `url.searchParams.get("versionId")`, and the
version switcher only surfaces when `versions.length > 1`. So #9's framing ("version is hidden
stateful context") is only half-true: it's a query param, not hidden — but it _floats with the
view_, and a persisted thread doesn't. That gap is the real bug.

**Why (a):**

- **A thread is a conversation _about a specific state_, not just an address book.** Its
  natural-language history ("this lesson has 3 clips", "chapter 2 covers X") is baked against
  one version. Re-pointing it at another version corrupts the _prose_ too, not only the paths —
  so this was never purely an addressing problem, and only (a) fixes the semantic one. Pin the
  thread, and "stateless absolute paths" (#1) + stable `timeline.json[i]` (#4) are honest again:
  stateless _within the thread's fixed version_, which is exactly the invariant #4 assumed.
- **Mechanism:** a thread stores the `versionId` it was created against (defaulting to the
  view's current `?versionId` at creation). The agent-loop route reads the thread's `versionId`
  and builds the VFS root from _that_ — switching the course view's version afterwards leaves
  existing threads untouched; it only sets the default for the _next_ new thread. The panel
  already renders the version name (`[Draft]` etc.), so the binding is visible. To explore a
  different version, the user starts a new thread. Rides #6's localStorage thread model for free
  (one more field).

**Why not (b) encode version in the path (`/versions/<v>/…`):** it bloats every path with a
`/versions/<v>/` segment that is _constant within a conversation_, and turns version into a
navigable directory — inviting the agent to wander across versions and inflating the address
space + token cost, against v1's "explore one course's content" goal. Worse, version `name` is
free text (route falls back to `"Draft"`, can be empty/duplicate), so encoding it as a path
segment reintroduces #2's dedup problem one level up. Rejected.

**Why not (c) accept reflow:** it _is_ the silent-wrong-answer trap #9 names — same paths, new
version's content, no error, stale prose. Rejected.

**Ghost interiors (closes #1's gap): the taxonomy stays uniform — no special-casing.** A ghost
lesson/section is a real row, so it **always has its own metadata file** (`lesson.json` /
`section.json`, with `fsStatus: ghost` / `real: false`) and its structural child dir
(`videos/` / `lessons/`), which simply **lists empty** (or contains further ghosts). So:
`cat /…/03-ghost/lesson.json` → the planned metadata; `ls /…/03-ghost/videos` → empty output
(bash empty-dir, exit 0, not an error per #3); there is **no `timeline.json`** under a ghost
(nothing recorded). This matches #1's "dangling symlink" model exactly — the node + its plan
exist, the recorded target doesn't — and keeps `ls`/`cat` free of ghost-specific branches.

**#10 interaction (now settled — #10 picked multi-course in v1):** the path stays
**version-free**; #10(b)'s old "encode version in path" hint is **dropped**. The pin generalizes
as anticipated: the thread stores a `{courseId → versionId}` resolution (current course pinned to
the view's `?versionId` at creation; every other course defaults to its **latest** version).
Paths are `/courses/<c>/sections/…` with version resolved per-course by lookup, never in the
path — and per #10, **no `../` traversal into other versions** (that would re-import version into
the address space). See #10 for the full multi-course addressing model.

## #10: Multi-course root — should the VFS span all non-archived courses?

Type: Discuss
Status: resolved
Blocked by: #1

### Question

Surfaced while reviewing the #6 panel: the agent need not be confined to one course.
**Proposal (worth taking seriously — "why not?"): the VFS root spans _all non-archived
courses_, not just the currently-open one — but the currently-open course is named to the
agent** (e.g. in the system prompt / a `/current` pointer) so "this course" still resolves.
This directly overrides the **resolved-inline "Version scope"** note ("agent sees only the
currently-viewed CourseVersion") and reframes #1's root ("Root = the currently-viewed
CourseVersion").

Decide:

- **(a) Single-course root** (status quo): root = the open course/version; cross-course
  questions impossible. Simplest; matches today's panel mount (one course route).
- **(b) Multi-course root + "current" pointer** (the proposal): add a top `/courses/<course>/…`
  level; the open course is announced to the agent and/or exposed as a stable alias. Enables
  "which other course already teaches generics?" / reuse hunting across the catalogue.

Knock-ons to settle if (b) wins:

- **Addressing (#2):** needs a course segment + course-level uniqueness (course `path`/slug
  dedup, mirroring the section/lesson/video backfill + partial unique index).
- **Version identity (#9 — RESOLVED):** #9 chose **(a) pin version per thread**, keeping the
  path **version-free**. So the earlier hint here ("encode version in path") is **dropped** —
  do _not_ add `/versions/<v>/`. Multi-course generalization: the thread stores a
  `{courseId → versionId}` map (current course pinned to the view's `?versionId` at creation;
  all others default to their **latest** version); paths stay `/courses/<c>/sections/…` and
  version is resolved per-course by lookup. This is the main #9↔#10 coupling, now settled.
- **grep scope (#4):** whole-catalogue grep gets large; the small-scale assumption (≤20
  sections etc.) was _per course_ — revisit cost, maybe default `grep` to the current course
  and require an explicit path to go wider.
- **Token budget (#5/#6):** `ls /` / `tree /` across many courses inflates context; lean on
  the "current course" default so naive exploration stays cheap.
- **Write-back (#7):** cross-course edits widen the blast radius; the permission model must
  be course-aware.
- **UI (#6, done):** the panel is mounted per course route and passes no courseId to the
  agent yet — fine for (a); (b) needs the route to tell the agent which course is "current."

Lightweight to keep open because v1 is read-only: (b) is mostly a root/addressing change, not
new write surface. Pick before the agent-loop route is wired, since it sets the path scheme.

### Answer

**Decision: (b) — multi-course root, in v1.** The VFS root is the **catalogue** of all
non-archived courses (`/courses/<c>/…`); the open course is the announced, immutable
**anchor**. _(Revised from an initial "single-course for v1" call after a `/grilling` session —
the grilling collapsed (b)'s perceived cost: with an immutable anchor + relative-path sugar, the
current-course experience is byte-identical to single-course, so multi-course is purely additive
and worth doing once, up front.)_ This **overrides the resolved-inline "Version scope" note** and
**reframes #1's root** (root is now the catalogue, not a single CourseVersion).

**The addressing model (the crux — unix semantics over an immutable anchor):**

- **Anchor = current course**, set once per thread by the route (the announced course), **never
  mutable by the agent** — there is **no `cd`, no movable cwd** (statelessness, #1, preserved).
- **Default scope is the current course.** Bare / relative / `.` paths (`sections/01`,
  `grep generics`, `tree`) resolve against the anchor → naive recon stays single-course-cheap
  **by default**. _This is the answer to "easy to scope": scoping is the default, not a
  discipline the agent must remember._
- **`/` = catalogue root** (lists courses). ⚠️ **Behavioral change to #1:** `ls /` now shows
  courses, not the current course's sections; the agent sees its own taxonomy via bare `ls` /
  `ls .`. **`..` = `/courses`** (sibling courses) — cross-course is an explicit traversal.
- **`../` and bare paths are pure input _sugar_, normalized to absolute** before they ever touch
  grep output (#4), localStorage persistence (#6), or the version pin (#9). So statelessness
  holds and every persisted/round-tripped path is absolute.
- **Version stays OUT of the path** (#9 intact): pinned per-thread as `{courseId → versionId}`
  (current course = view's `?versionId` at creation; all others = **latest**). **No `../` into
  other versions** — cross-version exploration is a new thread with a different pin, not a path
  traversal. (Rejected a "../ to versions too" idea in grilling: it would re-import #9's
  free-text-version dedup problem and put version back in the address space.)

**Course segment = the course `name`, made unique-and-path-safe (extends #2 up a level):**

- Courses have **no slug/path** today — the `courses` table (`app/db/schema.ts:38–54`) holds only
  `filePath` (nullable), `name`, `archived`, `memory`, `createdAt`. `name` is free display text
  with **no uniqueness constraint** (schema.ts:45).
- So `<c>` is a **sanitized, path-safe projection of `name`, unique among non-archived courses**
  — i.e. a slug in all but name. This requires **#2's full mechanism at the course level**:
  backfill rename of colliding/unsafe names → partial unique index `(name)`/sanitized-segment
  `WHERE NOT archived` → service-layer create/rename guard. **Dedup on the _sanitized_ form**
  (so `"A/B"` and `"A B"` can't both collapse to `a-b`). User explicitly accepted this cost.

**Hard ordering constraint (v1 critical path):** the course-uniqueness migration **must ship
before** the agent can address courses at all — same as #2's section/lesson/video backfill is a
prerequisite, now with a course level added. Sequence: course-name dedup migration → VFS root
builder (catalogue + anchor) → tools → agent-loop route.

**Knock-ons, now in-scope for v1:**

- **#2** gains a course level (above). **#9** generalizes to `{courseId → versionId}` (now
  active, not conditional). **#4 grep** defaults to the current-course anchor; catalogue-wide is
  the explicit `/` / `..` widening. **#5/#6 token budget**: the current-course default keeps
  `ls`/`tree`/`grep` cheap; only an explicit `/` pays the catalogue cost.
- **#6 route seam:** the panel (mounted per course route) must pass the **current `courseId`** to
  the agent loop and announce it as the anchor — previously noted as a carry-forward, now
  required for v1.
- **#7 write-back (still deep fog):** cross-course edits widen the blast radius; the future
  permission model must be course-aware. Noted, not resolved.

This sets the path scheme — the stated forcing function — cleanly and once: **v1 ships the
multi-course `/courses/<c>/…` scheme**, with the current course as an immutable anchor so naive
exploration stays single-course-cheap.

---

## Deep fog (beyond frontier — do not resolve yet)

## #7: Write-back — edits to files mutate real entities

Type: Discuss
Blocked by: #1

### Question

Future capability (NOT v1): editing a leaf file's JSON pushes changes back into the
underlying entities, with Zod validation errors fed back to the agent. Needs the file
schemas (#1) to double as write contracts, plus a mapping from file edits to domain
mutations and a permission/confirmation model. Left foggy on purpose.

### Answer

_(unresolved)_
