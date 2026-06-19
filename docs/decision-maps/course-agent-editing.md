# Decision Map: Course Agent (editing / write-back)

The expansion of `#7 (write-back)` from `course-agent-filesystem.md`. Goal: let the
read-only course agent **edit** course content through the same VFS metaphor — reorder,
edit fields, add/delete entities — with **every edit gated by an AI-SDK-v6 tool-approval**
on the frontend (accept / reject, with a click-through breakdown of exactly what changes).
Also reshapes the agent panel from a floating overlay into a fixed full-height sidebar.

Grounding (from codebase map, 2026-06-19):

- Agent: `app/routes/api.courses.$courseId.agent.ts` — `ai@^6`, `ToolLoopAgent` on
  `claude-haiku-4-5`, read-only tools `ls`/`tree`/`cat`/`grep`.
- VFS: `app/services/vfs/` — in-memory JSON projection of the DB; `timeline.json` interleaves
  clips + chapters by a shared order; leaves carry stable `id`s.
- Entities: Course → CourseVersion → Section → Lesson → Video → {Clip, Chapter, Segment}.
  Ordering today is **fractional indexing** (sections `doublePrecision`, clips `varcharCollateC`).
- Panel: `app/features/course-agent/course-agent-panel.tsx` — `fixed right-4 top-4 bottom-4
w-[400px] z-40` (overlays content).
- Write services exist: `CourseWriteService`, `CourseEditorService` (Effect-based).
- No tool-approval wiring (`needsApproval` etc.) exists yet.

## Resolved inline (do not re-litigate)

These were decided in the map-building `/grilling`. They are the **spine**; tickets below
fill in the fog around them.

- **R1 — Edit model = whole-file-diff.** The agent emits a _complete new file_; an engine
  diffs it against the current version to derive operations. One uniform write tool, not
  granular per-op tools.
- **R2 — Approval granularity = one file-write ⇒ one approval.** A single write may change
  several things; it is approved/rejected as a bundle. The click-through breakdown lists the
  derived ops _inside_ that one approval.
- **R3 — Forbidden op ⇒ atomic reject.** If a write's diff contains _any_ operation outside
  the capability matrix, reject the **entire** write before it reaches the approval UI and
  return a correction message to the agent. Never apply-legal-drop-illegal.
- **R4 — Capability matrix** (all deletes are **soft**; ordering is always position, never a
  field — see R5):

  | Entity  | Add      | Delete | Reorder                              | Editable fields                                                                   |
  | ------- | -------- | ------ | ------------------------------------ | --------------------------------------------------------------------------------- |
  | Course  | ❌       | ❌     | —                                    | none (read-only top level)                                                        |
  | Section | ✅ ghost | ✅     | ✅                                   | description, slug/name                                                            |
  | Lesson  | ✅ ghost | ✅     | ✅ (+ move between sections, see R8) | title, slug, description, icon, priority, dependencies, authoringStatus, fsStatus |
  | Video   | ✅       | ✅     | ✅ (manifest pos)                    | name                                                                              |
  | Segment | ✅       | ✅     | ✅                                   | kind, title, description                                                          |
  | Chapter | ✅       | ✅     | ✅                                   | name                                                                              |
  | Clip    | ✅ copy  | ✅     | ✅                                   | text only                                                                         |

  Clip `scene`/`profile`/`beatType` ❌ (**firmed in #4: beatType ❌**). Clip Add ✅ **copy-only**
  (#4): a null-id clip whose footage triple verbatim-matches an existing clip; free-form add ❌.
  Video `originalFootagePath`/`warnings` ❌. Course `memory` is **hidden from the agent** for now;
  version block + publishing are **out of scope**. Lesson `fsStatus` edit _is_
  materialize/dematerialize (touches the real FS — heavier than a field write; see #5).
  Section delete is **empty-only** (#4): cannot delete a section while non-archived lessons remain.

- **R5 — Order is position, not a field.** Where an entity sits in its parent's `_members.json`
  _is_ its order — that is the agent's UI for ordering. Drop the `order` field from VFS leaves.
  **(Amended by #4: unified `_members.json` for EVERY parent — no array files.** `timeline.json` /
  `segments.json` are gone; `<video>/timeline/` and `<video>/segments/` are manifest+leaf
  directories like the rest. Order = manifest position everywhere.) `ls`/`tree` list children in
  manifest order. (See #3 + #4 for the manifest representation; executor full-reindexes order
  back to the DB's int/fractional keys, #5.)
- **R6 — Identity = stable, read-only ids.** The diff engine keys off `id`, not position/content:
  same id moved ⇒ reorder; same id, fields changed ⇒ edit; id gone ⇒ delete; item with **no/null
  id** ⇒ add (mint real id on apply). The agent must preserve ids it keeps and must **omit** ids
  for new items. Inventing, changing, or duplicating an id ⇒ hard error (atomic reject, as R3).
  **Encode these rules in the system prompt**, not just the engine (see #8).
- **R7 — Read-before-write + staleness guard.** A write is auto-rejected (tool error, before
  approval) if (1) the agent has **not `cat`-ed that file in this thread**, or (2) the file has
  **changed beneath it** since that read. Stamp each read with a version/hash per thread; a write
  must reference an unchanged, already-read file. Otherwise the agent must re-read and redo.
  (Recording is concurrent, so this is load-bearing.)
- **R8 — Cross-section lesson move = two approvals via the archive exception.** Removing an id
  from a manifest **archives** (soft-deletes) the entity. The **one exception to R6**: writing an
  id into a manifest that refers to an **existing-but-archived** entity is _not_ an error — it
  **unarchives + reparents** it there. So: null id = create; archived id in a manifest = resurrect
  - move; unknown/duplicate/active-misplaced id = error. Delete and move share step 1; intent
    resolves only if step 2 (re-add elsewhere) happens. (**Resolved by #4:** Unarchive+reparent
    generalizes to **videos** too — both lessons and videos are manifest-backed. It does **not**
    apply to clips/chapters; footage is reused across videos via **clip copy** (a verbatim-match
    null-id Add), so a clip "move" = copy-into-B + delete-from-A. #4 also renames this op
    **Unarchive** (was "resurrect").)

---

## Frontier

**MAP COMPLETE.** All tickets resolved: #1–#13. No fog remains; the path to implementation is clear.
#7 (the final ticket — approval-flow wiring) resolved with two amendments it folded back into #9
(R3/R7 = structured `{applied:false}` result, not an `output-error` throw) and #11 (revalidate gate
= `output.applied === true`). Next step: implement (see the per-ticket answers + linked assets), or
`/to-prd-project` to schedule a multi-session build.

- **#1** ✅ Research the AI SDK v6 tool-approval API — resolved.
- **#2** ✅ Fixed-sidebar layout — resolved (prototype landed; recommend variant A + collapse).
- **#3** ✅ VFS write-side representation — resolved (Model A manifests; **amended by #4: unified
  `_members.json` everywhere, array blobs removed**).
- **#10** ✅ Write-tool surface — resolved (**two tools `write`+`edit`**; `edit` reuses
  `document-editing-engine.ts` with a batch `edits[]`; op model unchanged; agent bumped to Sonnet).
- **#4** ✅ Operation vocabulary + diff engine — resolved (4 ops, index-space engine, unified
  manifests, clip-copy, empty-only section delete, video Unarchive). The engine spine.
- **#12** ✅ VFS read-projection restructure — resolved (`_members.json` at every parent; per-item
  clip/chapter/segment leaves under `timeline/`+`segments/`; order = manifest insertion position,
  sorts/comparators deleted; `.text`/`.names` cat filters retire).
- **#5** ✅ Execution layer — resolved (new `AgentDiffExecutor`, policy-centralized; per-op FS
  atomicity via one-FS-op-per-write rule (b); pure-DB atomicity deferred to #13; materialize in v1
  but ghost-course-guarded + dematerialize reuses the destructive-delete warning; whole-course
  re-projection on apply, re-stamp from DB not the agent's input; segment `archived` migration;
  soft-delete does **not** cascade. **Spawned #13.**).

Open & unblocked: **#7** only — the final ticket. **#13** resolved (executor-owned `db.transaction`,
ops factories rebuilt over `tx`; pure-DB atomicity in v1, FS-cascade saga deferred). **#11** resolved
(revalidate-to-truth via explicit `useRevalidator()` on `output-available`; optimistic layer **not**
extended to agent writes). **#6** resolved (breakdown UI = variant C, monochrome); **#8** + **#9**
resolved (all land at #7 wiring). **#7** is now fully unblocked (all of #1/#4/#5/#13 resolved) — wire
it and the map is done.

## #1: AI SDK v6 tool-approval flow

Type: Research
Blocked by: —
Status: resolved

### Question

How does `ai@^6` model human-in-the-loop tool approval end to end? Specifically: the API for
marking a tool call as needing approval (`needsApproval` / equivalent), how the stream **pauses**
and surfaces the pending call to the client, how the client **accepts/rejects** and **resumes**,
and how a **rejection** is fed back to the agent loop (does it see a tool result it can react to,
or is the turn aborted?). How does approval state survive a page reload given threads live in
**localStorage**? Produce a small reference (asset) with the exact `@ai-sdk/react` `useChat`
surface + server `toUIMessageStreamResponse` wiring, and any version caveats vs the installed
`ai@^6` / `@ai-sdk/react@^3`.

### Answer

Resolved. Full reference: [`assets/ai-sdk-v6-tool-approval.md`](./assets/ai-sdk-v6-tool-approval.md).
v6 has first-class HITL approval that maps onto our existing `ToolLoopAgent` + `useChat` +
localStorage setup with minimal wiring. Key facts:

- **Opt in per tool** with `needsApproval: true` (or `(input, {messages}) => boolean`). The
  tool keeps its `execute`; the SDK runs it only after approval. No other change to
  `agent.stream()` / `toUIMessageStreamResponse()` construction.
- **Pause/surface**: instead of running `execute`, the SDK emits the `tool-<name>` UI part
  in state **`approval-requested`** carrying `approval.id`, and ends the step. State machine:
  `input-available → approval-requested → approval-responded → output-available | output-denied`.
- **Accept/reject + resume**: client calls `addToolApprovalResponse({ id, approved, reason })`
  (exposed by `useChat` in `@ai-sdk/react@3.0.118`); the **full message list is resent** and
  the SDK runs `execute` (approve) or skips it (deny). Auto-resend via
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`.
- **Reject feeds the loop, not abort**: deny → terminal `output-denied`; the model **sees
  it and can respond**. Distinct from our server-side R3/R7 rejects, which should throw a
  tool error (`output-error`) carrying the correction message. Both keep the loop alive.
- **localStorage**: approval lives _inside_ `UIMessage.parts`, so our existing
  `saveThreads(courseId, messages)` already persists pending/denied approvals — a thread in
  `approval-requested` rehydrates with the card intact across reload. No extra work.

**Version caveats (installed `ai@6.0.116`):**

1. ⚠ **vercel/ai#13670 (OPEN, affects 6.0.116):** `lastAssistantMessageIsCompleteWith­ApprovalResponses`
   omits `output-denied`, so after a **user reject** the auto-resend predicate never fires
   and the stream **hangs**. #7 must handle denial explicitly: call `sendMessage()`/`regenerate`
   manually on reject, or supply a custom predicate that treats `output-denied` as complete.
2. Always pass `originalMessages: messages` to `toUIMessageStreamResponse` (we drive the
   stream manually) so the resend can attach output to the original tool-call part
   (root cause of vercel/ai#10196).

**Spawned #9** (open question surfaced here): the `approval-requested` UI part exposes only
the tool **input** (the new file content), not the derived op-list R2 wants in the
breakdown. #6/#7 must decide where the diff is computed/transported for the UI.

## #2: Fixed full-height sidebar (floating → reflow)

Type: Prototype
Blocked by: —
Status: resolved

### Question

Convert the agent panel from a floating overlay (`fixed … w-[400px] z-40`,
`course-agent-panel.tsx`, mounted in `_app.courses.$courseId._index.tsx`) into a **fixed
full-height right sidebar that reflows the course content** instead of covering it. How does the
course-view layout become a two-column shell (content + sidebar) without disturbing the existing
course view? Open/close behaviour, width, responsive collapse. Prototype the layout.

### Answer

**Prototype asset:** `app/features/course-agent/course-agent-sidebar.prototype.tsx` (throwaway;
3 variants switchable via `?agentLayout=A|B|C` + ←/→ keys on the live course route — flip through
to confirm the verdict, then fold the winner in and delete the file). Run `pnpm dev`, open a
course, open the agent (actions menu → adds `?agentPanel`).

**The reflow mechanism (this is the load-bearing answer, independent of which variant wins):**

- The route root changes from one column (`flex flex-1 flex-col`) to a **flex _row_**: a content
  column (`flex flex-1 min-w-0 flex-col`) + a right `<aside>`. `min-w-0` lets the content shrink
  instead of overflowing. The whole existing course view (title, stats, SectionGrid, modals) moves
  **unchanged** into the content column — no other course-view edits needed.
- The sidebar is **`sticky top-0 h-screen`** pinned to the right with `border-l`. The app shell
  (`_app.tsx`) is `min-h-screen` + page-scroll, so the content column keeps scrolling the page
  while the sidebar stays full-viewport-height with its **own** internal conversation scroll
  (`AIConversation` already `flex-1 overflow-y-auto`). No change to `_app.tsx` required.
- The panel itself gained one prop, **`embedded`** (in `course-agent-panel.tsx`): swaps the
  `fixed … rounded-xl border shadow-2xl` overlay chrome for `h-full w-full` so the shell owns the
  frame. This prop is real (not throwaway) — keep it.
- Open/close still drives off the `?agentPanel` search param (close button → `closeAgentPanel`).

**Shell decision — DRAG-RESIZABLE (user-chosen).** The sidebar is `sticky top-0 h-screen`,
pinned right, with a 2px drag handle straddling the left border; width clamps **320–640px**
(currently in-memory — persist to a cookie/localStorage when folding in, like `view-mode`). This is
the live shell in the prototype (`CourseAgentSidebar`). A/C (fixed-width, collapse-rail) were
discarded.

**Open affordance — EDGE TAB (user-chosen).** A vertical "Course Agent" handle docked to the
**top-right** edge (`fixed right-0 top-8`), always visible while the panel is closed; clicking sets
`?agentPanel`. Persistent and discoverable, and it anchors visually to where the sidebar opens.
Discarded: fab (floating pill, bottom-right) and header (button in the title row). The
actions-dropdown entry stays as a secondary path regardless.

**Responsive:** not deeply explored (desktop-first tool). Below ~`md`, the reflowed columns get
cramped; simplest follow-up is to fall back to an overlay (the old `fixed` mode — `embedded={false}`)
on small screens. Noted, not blocking.

## #3: VFS write-side representation

Type: Grilling
Blocked by: —
Status: resolved

### Question

What does the writable VFS look like, given R5/R6/R7? Specifically:

- **Order-manifest files**: where do they live (e.g. `sections/_order.json`, a section's
  `lessons/_order.json`), what's their exact shape (ids? slugs?), and how do `ls`/`tree`/`cat`
  consume them so listings obey manifest order?
- **Dropping `order`** from `section.json` / `lesson.json` leaves and from `timeline.json` /
  `segments.json` items — confirm nothing else reads it.
- **Per-thread read tracking + hash stamping** (R7): where is "files this thread has read" and
  their content hashes stored, and how is the hash computed so it's stable across re-projection?
- Confirm `id` presence on every writable item (clip/chapter/segment/lesson/section) and how new
  (null-id) items are represented in the projected JSON.

### Answer

> **Amended by #4 (2026-06-19):** the split below — manifests for directories, no manifest for
> `videos/`, array files for `timeline`/`segments` — is **superseded** by a single rule: a
> `_members.json` for **every** parent (incl. `videos/`, `timeline/`, `segments/`), array blobs
> removed, order = manifest position everywhere. The hash/read-tracking (point 3) and null-id /
> id-presence rules (points 1, 4) below still hold. Read-projection rewrite tracked as #12.

Grounding correction to the map header: sections/lessons are **not** fractional-indexed today.
They store a `doublePrecision` `order` that is **rewritten as sequential ints `0,1,2…` on every
reorder** (`batchUpdate{Lesson,Section}Orders`, SQL `CASE`). Only clips/chapters/segments
(`varcharCollateC`) use real `fractional-indexing` keys. So #4's "reconcile derived order against
the DB" is two different reconciliations.

**Manifest model = A ("membership + order"), chosen over a POSIX verb set (`mkdir`/`mv`/`rm`).**
The manifest _is_ the directory's child list, so all four structural ops are edits to one file
(one approval each, R2). `mkdir` was considered and rejected: it re-opens R1, doesn't remove the
manifest (still needed for ordering + R8 moves), and forks the add mechanism (directory-add via
verb vs array-add via null-id). Model A keeps **one add concept — "a thing with no id" —**
everywhere.

1. **Order-manifest files.** One per ordered _directory_ level: `sections/_order.json` and each
   section's `lessons/_order.json`. **No** manifest for `videos/` (reorder is a no-op, sorts by
   name) and **none** for array files (`segments.json`/`timeline.json` order by index). Shape — an
   array of `{ id, slug }` entries; **position = order**:

   ```jsonc
   // /courses/<course>/sections/_order.json
   [
     { "id": "a1b2…", "slug": "intro" },
     { "id": "c3d4…", "slug": "narrowing" },
     { "id": null, "slug": "conditional-types", "description": "" }, // an add
   ]
   ```

   - `id` is the diff key (R6); existing entries have it, a new entry is `id: null` + create-fields
     (section: `slug`,`description`; lesson: the create subset).
   - `slug` is a **read-only echo** for legibility (makes the file read like a listing, not raw
     UUIDs). On existing entries the engine **ignores** it and keys only on `id`; rename happens in
     `section.json`/`lesson.json`, not here.
   - The numbered prefix in `ls`/`tree` (`01-intro`, `02-narrowing`) is **derived from position at
     render time, never stored** → reorder = move a line, no renumber cascade.
   - Ops, all as edits to this one file: **reorder** = move a line; **add** = insert a `{id:null,…}`
     line; **delete** = remove a line (→ archive, R8); **move** (lesson) = remove the line from
     section A's `lessons/_order.json`, paste the **same id** into section B's (→ resurrect+reparent,
     R8).
   - `ls`/`tree` consume it by reading `_order.json` and listing children in array order (replacing
     the current DB-`order` sort); `_order.json` lists **itself** (a real, cat-able, writable file).

2. **Dropping `order` — confirmed safe.** Inside the VFS the leaf `order` field is consumed in
   exactly one place: `vfs-tree.ts:107,123` copies `section/lessonLeaf.order` onto `VfsDirNode.order`,
   which `vfs-tree-tool.ts:42-43` uses to sort dir children. Re-point that sort at the manifest and the
   field is dead. `timeline.json` items already carry no `order`; `segments.json` item `order`
   (=index) is asserted only in `vfs-leaves.test.ts`. The `.order` reads in `app/features/*`
   (`reference-panel`, `ghost-lessons-reducer`, `optimistic-applier`) are **separate domain/DB
   objects, not VFS leaves** — untouched. Blast radius = the tree child-sort only.

3. **R7 read-tracking + hashing — no new server state.** The full message history is replayed to the
   server every request and already contains every prior `cat` result. So: **stamp each `cat` output
   the model sees with `{path, hash}`**; on a write, **scan the message history backward** for the most
   recent `cat` of that path → compare its stamped hash against a freshly recomputed hash → _not found_
   = "never read" reject, _mismatch_ = "changed beneath you" reject (both R7 tool-errors, pre-approval).
   Survives reload for free (localStorage carries the messages); no Redis/DB read-set. **Hash =
   SHA-256 over canonical JSON (sorted keys) of the projected leaf, hashing _everything the agent
   saw_** (incl. derived `section.real`/`video.warnings`) — strictly safe; false-reject noise from
   concurrent recording is the acceptable failure mode and a later optimization if it bites.

4. **`id` presence + null-id representation.** Every projected leaf/array-item already carries a
   stable UUID `id` (`crypto.randomUUID()` at row creation): section/lesson/video leaves, and
   segment/clip/chapter array items. Read projection keeps `id` **required**; the **write-parse**
   schema makes it `.nullish()`. A new item = `id` omitted/null — inline in the array file
   (segments/timeline) or as a null-id manifest entry (sections/lessons). Engine mints the real id
   on apply (R6); the agent must preserve ids verbatim and never invent them (taught in #8).

Feeds #4 (the diff engine reads these manifests/arrays and the R7 stamps). Surfaced **#10**
(write-_tool-surface_: whole-file rewrite vs targeted edit) — out of scope here.

## #4: Operation vocabulary + diff engine

Type: Grilling
Blocked by: #3
Status: resolved

### Question

Define the canonical **operation set** (Add / Delete / Reorder / EditField / Move) and each op's
payload, then the **engine** that turns (before, after) → ops via id-keyed diff (R6), including:
the **archived-id move** exception (R8) and whether it generalizes to clips/chapters across
videos; **forbidden-op detection** against the matrix (R4) for atomic reject (R3); the
**staleness/read guards** (R7); how derived array order maps back to the DB's **fractional
indices** (full reindex vs compute-new-keys — user leans "don't mind duplicated work"); and the
**section delete-cascade** rule (empty-only vs cascade, given derived real-ness).

### Answer

**Operation set — four ops, id-keyed (R6).** The engine diffs (before, after) per file:

- **Add** — entry with `id: null`; engine mints the real id on apply. Two _guarded_ sub-cases:
  - **Unarchive** — a non-null id appearing in a `_members.json` that resolves to an _archived_
    entity ⇒ unarchive + reparent to that manifest's owner (R8). Applies to **lessons and
    videos** (both manifest-backed). _Not_ clips/chapters/segments — they don't move via id
    reappearance (see copy).
  - **Clip copy** — an `id: null` clip whose `videoFilename`/`sourceStartTime`/`sourceEndTime`
    **exactly match an existing non-archived clip** (verbatim-match form); otherwise it is
    fabrication ⇒ reject (R3). This is how footage is reused across videos; a cross-video
    **move = copy-into-B + delete-from-A** (two approvals). No clip cross-video Unarchive.
- **Delete** — id in before, absent in after ⇒ **soft-archive**. Every entity is now soft-
  deletable; **segments gain an `archived` boolean** (migration → #5).
- **EditField** — same id both sides, scalar fields differ ⇒ one op per changed field; each
  field checked editable against R4.
- **Reorder** — same id-set, order differs ⇒ `Reorder { finalIdsInOrder }`. **Engine is
  index-space-only**; the executor (#5) **full-reindexes** the sibling set wholesale (sequential
  ints for sections/lessons; regenerated fractional keys for clips/chapters/segments). Honours
  the "don't mind duplicated work" lean; engine never touches `doublePrecision`/`varcharCollateC`.

**Identity errors (R6 ⇒ hard reject):** unknown id, duplicated id, or a non-null id resolving to
an _active_ entity in the wrong parent. Only the two guarded Add sub-cases are legal exceptions.

**Engine algorithm (per file):** R7 read/staleness guard runs **first** (via #3's history
hash-scan — not-previously-`cat`-ed or hash-mismatch ⇒ pre-approval reject). Then: parse
before/after → key by id → classify each id into the ops above → validate every op against the
R4 matrix → **any forbidden op ⇒ atomic reject of the whole write (R3)** with a correction
message. Never partial-apply.

**Unified representation (amends #3 + R5).** Every parent with children gets a `_members.json`
— **no exceptions**: `sections/`, `<section>/lessons/`, `<lesson>/videos/`, and now
`<video>/timeline/` (clips+chapters interleaved, `{id, type, …}` entries) and
`<video>/segments/`. The array blobs (`timeline.json` / `segments.json`) are **removed**; each
clip/chapter/segment becomes its own leaf file under its manifest's directory. **Order =
manifest position, uniformly** — drops the "videos sort by name" special case. Payoff: a reorder
edits only the (tiny) manifest and a field edit touches only one leaf, so the agent never
re-emits hundreds of transcripts. (Complements #10's targeted `edit` tool — both attack the same
re-emission cost, from the data-shape and tool-surface sides respectively; neither blocks the
other.) The read-side projection rewrite this implies is tracked as **#12**.

**Section delete = empty-only.** Removing a section's manifest line is rejected (R3 correction:
"empty the section first") while it has any non-archived lesson; reuses today's `archiveSection`
guard. Composes with the existing auto-demote + renumber as the agent empties real lessons.

**Matrix firm-ups (this ticket's charter):** clip `beatType` **❌** (clips stay text-only); clip
Add **✅ copy-only** (was ❌); Video Reorder **✅ manifest position** (was no-op/name); segment
delete **soft** via the new `archived` column; R8 Unarchive generalizes to **videos**, not to
clips/chapters. Matrix above updated in place.

Feeds **#5** (migration, full-reindex, empty-only guard, copy validation, unarchive+reparent),
**#6/#9** (the op-list to render), **#8** (teach copy-not-move, empty-first, id discipline).
Surfaced **#12** (read-projection restructure to manifest+leaf everywhere).

## #5: Execution layer (ops → DB)

Type: Grilling
Blocked by: #4
Status: resolved

### Question

How are derived ops applied? Reuse `CourseWriteService` / `CourseEditorService` or add an
agent-specific writer? Atomicity of one approved file-write (all-or-nothing transaction);
soft-delete semantics across all entities; materialize/dematerialize when `fsStatus` changes
(touches the real FS); and how the VFS the agent sees **refreshes** after apply so subsequent
`cat`/`ls` reflect the change (and re-stamp R7 hashes).

### Answer

**Grounding (codebase map, 2026-06-19).** Two-tier write surface: low-level Effect ops services
(`LessonSectionOperationsService`, `ClipOperationsService`, `SegmentOperationsService`,
`VideoOperationsService` — each method its own `makeDbCall`, **no shared tx, no `tx` param**)
cover every entity; `CourseWriteService` orchestrates the **FS-touching** lesson/section ops
(materialize, real-lesson rename, real-lesson reorder) wrapped in `withPreAndPostValidation` (two
repo-divergence scans per write). `CourseEditorService` is a UI-shaped RPC layer **missing
clip/chapter/video ops** — dead end. VFS (`buildVfsForCourse`) is rebuilt fresh from one DB query
per request, **no cache**. Soft-delete: `archived` boolean on lesson/video/clip/chapter (sections
use `archivedAt` timestamp); **segments have none — hard-delete only today**.

**E1 — New `AgentDiffExecutor`, policy centralized (Q3 = b).** A new server-side Effect program
owns the op→service mapping; the agent action is already server-side Effect so the RPC indirection
buys nothing, and extending `CourseEditorService` to the missing entities is a big refactor of a
UI-facing service for an agent-only need. Routing: **`CourseWriteService`** for FS-touching
lesson/section structural ops; the **low-level ops services** for clip/chapter/segment/video and
ghost/DB-only lesson/section ops. **All R3/R4 capability checks, FS-op detection, and the
ghost-course guard live in the executor** — the matrix is enforced in exactly one place; the
services stay dumb primitives.

**E2 — Atomicity = real transactions; per-op for FS, with carve-outs (Q1 + Q5).**

- _Pure-DB multi-op write_ (e.g. add-ghost-lesson + reorder-siblings in one `_members.json` edit):
  must be **all-or-nothing in one transaction**. The ops services don't thread a `tx` today, so
  this needs a shared transaction API — **see #13** (its shape is a separate decision; #7
  implementation depends on it).
- _FS-touching write_ → **rule (b): at most one FS-touching op per write; ≥2 ⇒ atomic-reject
  (R3)** with a correction ("split this into separate edits"). One FS op per write makes each FS
  write inherently atomic at the op level, so there is **no FS mid-sequence failure** to roll back.
  Real-lesson reorder is the main casualty (becomes N approvals) — judged rare; **tagged
  revisit-later**.
- _Residual gap (revisit-later):_ a single `materializeGhost` cascades internally (materialize
  lesson → renumber real siblings on disk → maybe materialize section → renumber sections), and
  that cascade is **not** transactional with the FS. Accepted for v1; folds into the #13 hardening
  pass.

**E3 — `fsStatus` materialize/dematerialize: in v1, guarded (Q2).**

- **Ghost course ⇒ atomic-reject.** Materializing a lesson under a ghost course triggers
  `materializeCourseWithLesson`, which must assign a course `filePath` — **user-only input**. The
  executor rejects any `fsStatus` edit while the course is a ghost, with a legible correction
  ("this course isn't on disk yet; materialize the course manually first"). Real course →
  materialize/dematerialize freely (lesson→section cascade is fine; needs no user input).
- **Dematerialize is destructive** (`convertToGhost` recursively deletes the lesson dir from disk,
  incl. hand-authored exercise files). Kept in v1, but the **approval card must surface the same
  warning the existing UI shows** — `app/components/convert-to-ghost-modal.tsx` renders "These
  files will be permanently deleted:" + the on-disk file list. The preview path (#9) must compute
  that `filesOnDisk` list for the op so #7's approval card can render it. Reuse the modal's
  content, don't invent a new warning.

**E4 — VFS refresh + R7 re-stamp (Q4).** After a successful apply, **rebuild the whole-course
VFS** from the DB (one query; matches the existing per-request path; writes are human-gated so
frequency is low — not worth a surgical subtree re-projection). The **write/edit tool result
returns the freshly re-projected content + R7 hash of the written file**, which doubles as the
read-stamp so the agent can immediately chain another edit without a redundant `cat`.

- **Hard constraint:** the returned content + hash must come from the **post-apply re-projection,
  NOT the agent's submitted after-file** — minted ids, normalized fields, and derived numbering
  differ from what the agent sent, and the R7 hash must match what the next `cat` produces or the
  agent's very next edit auto-rejects as stale.
- **Any state the agent doesn't already know — chiefly minted ids for null-id Adds — is returned
  in the tool result** (it falls out of returning the re-projected file).
- Return **only the written file's** content+hash (Q4 = i), **plus a small notice listing any
  sibling FS renames** the write triggered (real-lesson reorder/materialize renumbers siblings on
  disk → their paths shifted). The notice warns the agent to re-`cat` those before touching them;
  it does **not** re-stamp them.

**E5 — Recorded, follow from #4 (no new decision):**

- **Segment `archived` migration** — the one schema change #5 owns: add `archived` boolean to
  `segments`, update the segment ops + read-projection filters (#12) to honour it. Segments go
  hard-delete → soft-delete.
- **Soft-delete does NOT cascade** (followup): archiving a lesson/video leaves its children
  active-but-orphaned under the archived parent (projection hides the parent). Chosen to "try it
  and see"; **flagged as a decision for much later** if it causes weird states (e.g. R8 move
  restoring an empty-looking parent). Not cascading keeps unarchive trivially symmetric.
- **Clip-copy execution** — verbatim-match null-id clip Add → executor calls `appendClips` with
  the matched clip's footage triple + new `text`.
- **Unarchive+reparent (R8)** — executor unarchives + reparents: `moveToSection` for lessons,
  `updateVideoLesson` + clear `archived` for videos.
- **Full-reindex on reorder** — regenerate the sibling set's order keys wholesale: sequential ints
  via `batchUpdate{Lesson,Section}Orders` for sections/lessons; regenerated `generateNKeysBetween`
  fractional keys for clips/chapters/segments. Timeline reorder regenerates across the
  **interleaved clips+chapters** set and writes back to both tables. (Concurrency tension with
  live recording noted in #4 is **moot** — recording and the agent don't run simultaneously; R7
  stays as cheap insurance.)

**Spawned #13** (transaction API shape — E2 pure-DB atomicity + the FS-cascade revisit).
**Feeds #7** (wiring: approval surfaces the dematerialize warning + minted ids; depends on #13),
**#11** (revalidation), **#12** (re-projection is the same path E4 rebuilds + must filter the new
segment `archived`).

## #6: Proposed-edit breakdown UI

Type: Prototype
Blocked by: #1, #4
Status: resolved

### Question

Design the per-approval UI in the sidebar: the pending tool-call card, the accept/reject
controls, and the **click-through breakdown** rendering the derived op-list (R2) — e.g. "reorder:
clip X 2→4", "delete chapter Y", "set lesson.title = …". How are adds/deletes/moves/edits
visually distinguished? Prototype against realistic diffs (timeline reorder + chapter delete in
one write).

### Answer

**Verdict — variant C (spatial before/after), monochrome.** Three variants were prototyped (A flat
expandable list, B grouped-by-op-kind, C spatial); **C won — user-chosen.** Losing branches + the
variant switcher are deleted; the prototype now renders only C.

**Prototype asset:** `app/routes/prototype.agent-approval.tsx` (throwaway route — `/prototype/
agent-approval`). Renders the chosen card against **4 fixture diffs** (`?scenario` chips:
`timeline` reorder+chapter-delete, `lesson-fields` 4-field edit, `move` R8 unarchive+reorder,
`add-copy` ghost-create + clip-copy), at real 400px sidebar density with a faux conversation
above. Not wired to a live agent — the `edit`/`write` tools (#5/#7) don't exist yet, so the
op-lists are fixtures; Accept/Reject just `console.log`. Run `pnpm dev`, open the route.

**The design (firm):**

1. **The card renders the derived op-list, not the raw tool input.** Confirms #9's premise: the
   breakdown is driven by an `Op[]` (the #4 vocabulary), not the proposed file content. The
   prototype pins the **render contract** #9 must deliver to the client:
   `edit | delete | add{sub: create|unarchive|copy} | reorder{order:[{label,fromIndex,toIndex}]}`,
   each op carrying a human `target` label + the before/after detail it needs. (Reorder needs the
   _moved-from index per line_; unarchive needs the _source parent_; copy needs the _footage
   echo_ — #9 must transport these, not just ids.)
2. **Spatial, not a sentence (variant C).** Each op renders as a _shape_: edits → before→after
   chips; reorder → a two-column before/after of the ordered list; add → the new item (unarchive
   shows the source parent struck-through → here); delete → the struck-through target. Reads
   faster than prose and fits the four-fixture set in a 400px column.
3. **Monochrome — icons carry the op distinction; red is reserved for delete (user-chosen).** Six
   icons, one per op flavour: Edit (pencil), Archive (trash — **the only coloured op, red**),
   Reorder (list-ordered), Add-create (file-plus), Unarchive/“Move in” (archive-restore), Clip-copy
   (copy). All non-delete tones are `text-muted-foreground`; chips are `bg-muted`; the “Proposed
   edit” header is neutral. The two guarded Add sub-cases stay distinguishable by **icon alone**.
4. **One card = one approval = one file (R2).** Chrome: neutral “Proposed edit” header with the
   `write|edit` tool chip + target file path; an optional **two-step-move banner** (R8: “Step 2 of
   2 … rejecting leaves the lesson archived”) — load-bearing, a lone Unarchive card is meaningless
   without it; op-list body; **primary Approve-all + secondary text Reject** footer.

**Open follow-up handed to #7:** this card only models a _user-facing_ approval. R3/R7 server-side
rejects (forbidden-op / stale-read correction messages) need a **distinct, non-approval
appearance** — not built here. #7 owns that rendering when it wires the flow.

**Feeds #9** (render contract above — what the diff transport must carry), **#7** (Approve/Reject
wiring + the R8 two-step banner + R3/R7 correction-message rendering, which this card does _not_
yet cover — a forbidden/stale reject should look different from a user-facing approval; noted as a
follow-up for #7), **#2** (folds into `course-agent-panel.tsx`’s conversation render where
`CourseToolCall` sits today).

## #7: Approval-flow wiring + reject/retry + refresh

Type: Grilling
Blocked by: #1, #4, #5, #13
Status: resolved

### Question

Wire the engine (#4) + executor (#5) into the v6 approval flow (#1): tool returns the derived
diff for approval; on **accept** → execute + refresh; on **reject** → what does the agent see and
how does it retry; how forbidden-op/staleness rejects (R3/R7) surface as correction messages vs
user rejections. Thread/localStorage persistence of in-flight approvals.

### Answer

**Verified against installed `ai@6.0.116` / `@ai-sdk/react@3.0.118` (types + source in
`node_modules`).** #9's transport plan survives a structural shift; #9 + #11 are amended on two
points (below). The map is complete after this ticket.

**W1 — Stream architecture: wrap the agent in `createUIMessageStream`; capture the `writer` by
closure.** The route moves off `agent.stream().toUIMessageStreamResponse()` (its result exposes
**no** writer) to:

```ts
const stream = createUIMessageStream<CourseAgentUIMessage>({
  originalMessages: messages,                 // required for resume (#1 caveat 2)
  execute: ({ writer }) => {
    const writeTool = tool({
      inputSchema, outputSchema,              // outputSchema = WriteResult (W4)
      needsApproval: async (input, { toolCallId, messages }) => {
        const res = deriveDiff(input, messages, root);   // pure, server-side (#9)
        if (!res.ok) return false;            // → execute returns {applied:false} (W3), no card
        writer.write({ type: "data-proposed-ops", id: toolCallId, data: res });  // writer in closure
        return true;
      },
      execute: async (input, { toolCallId, messages }) =>
        applyOrReject(input, messages, root), // re-derive + R7 re-check + #5/#13 apply (W3)
    });
    const agent = new ToolLoopAgent({ … tools: { …, write: writeTool, edit: editTool } });
    writer.merge(agent.stream({ messages }).toUIMessageStream({ originalMessages: messages, messageMetadata }));
  },
});
return createUIMessageStreamResponse({ stream });
```

Source-confirmed facts that make this robust (not assumptions):

- **Closure capture, no writer arg.** `needsApproval`/`execute` receive only
  `{toolCallId, messages, experimental_context}` — **no writer**. Defining the tools _inside_ the
  `execute({writer})` closure makes `writer` lexically reachable (the Explore "abandon
  needsApproval" suggestion was wrong — the v6 approval state machine #1/#6 depend on is kept).
- **Ordering is guaranteed.** `writer.write` and `writer.merge` feed the **same**
  `controller.enqueue` (`safeEnqueue`), and the agent loop `await`s `needsApproval` **before** it
  emits the `approval-requested` chunk → the `data-proposed-ops` part always precedes its card. No
  race.
- **`needsApproval` must never throw** — a throw there is uncaught and **crashes the whole
  stream** (verified). All correction paths run through `execute` (W3).

**W2 — `deriveDiff` is one pure function, called in both hooks** (as #9 said): `needsApproval`
runs it to _decide + emit the ops_; `execute` re-runs it (fresh request, no shared state) to
_apply_. Discriminated return so the two hooks can't drift:
`deriveDiff(input, messages, root) → { ok: true, ops, note? } | { ok: false, rejection }`.

**W3 — Three failure surfaces, mapped to distinct states (amends #9: structured result, NOT a
thrown error).** R3/R7 rejects are a _successful_ tool result reporting "invalid write", not a tool
malfunction — so `execute` **returns** `{applied:false, rejection}`, it does **not** throw.
`output-error` is **reserved for genuine exceptions** (executor bug / DB failure) and renders as a
real error. Full table:

| v6 state / output                               | Cause                                           | Render                                                                                                         | Revalidate (#11) |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| `approval-requested` + `data-proposed-ops`      | valid write, awaiting user                      | #6 breakdown card                                                                                              | no               |
| `output-available` `{applied:true}`             | approved → applied                              | "applied" confirmation                                                                                         | **yes**          |
| `output-available` `{applied:false, rejection}` | R3 forbidden / R7 stale-or-unread / R6 identity | **muted "agent proposed an invalid edit → retrying"** line (user-chosen 2A) — distinct from card & user-reject | **no**           |
| `output-denied`                                 | user clicked Reject                             | user-reject card (#6)                                                                                          | no               |
| `output-error`                                  | genuine exception (bug/infra)                   | real error appearance                                                                                          | no               |

R3/R7/identity rejects need **no human round-trip**: `needsApproval`→false → `execute` returns the
rejection **same request** → model reads `rejection.message` and self-corrects in-loop. Only
user-approve/deny need the client resend. **TOCTOU:** an _approved_ write can still come back
`{applied:false}` if the file went stale between card render and grant (concurrent recording, R7
re-checked in `execute`); the card flips approved → the same 2A "couldn't apply, file changed"
line. Same branch.

**W4 — Type safety end-to-end (one shared module imported by route + client):**

```ts
export type CourseAgentDataParts = { "proposed-ops": ProposedOps }; // ProposedOps = #6 render contract
export type CourseAgentTools = InferUITools<typeof courseAgentTools>;
export type CourseAgentUIMessage = UIMessage<
  UsageMetadata,
  CourseAgentDataParts,
  CourseAgentTools
>;
```

Threads through `createUIMessageStream<CourseAgentUIMessage>` → `writer.write` rejects any unknown
`type` / wrong `data` shape at compile time; the tool's `outputSchema` (`WriteResult`) makes
`part.output` typed so the client narrows `applied` true/false; `useChat<CourseAgentUIMessage>()`
narrows `part.type === "data-proposed-ops"` to `ProposedOps`. The `WriteResult` discriminated union
(`{applied:true,…} | {applied:false, rejection:{kind,message}}`) is what the W3 table keys off —
no stringly-typed `errorText` parsing anywhere.

**W5 — Denial-resume bug fix (user-chosen 1A; bug confirmed in installed source).**
`lastAssistantMessageIsCompleteWithApprovalResponses` omits `output-denied` from its terminal-state
check (vercel/ai#13670), so a user **reject** hangs the stream. Ship a **custom
`sendAutomaticallyWhen` predicate** = the upstream one-liner + `output-denied` treated as terminal.
One declarative place; covers approve _and_ deny uniformly; survives reload-then-click. (Rejected:
manual `sendMessage()` in the reject handler — imperative, easy to miss a path.) Drop the override
if/when the upstream fix ships.

**W6 — Transport = persisted `data-proposed-ops`, keyed by `toolCallId`** (confirms #9). Persisted
(not `transient`) so a reloaded thread re-renders the breakdown from `UIMessage.parts` (same
localStorage story as the approval card, #1); re-writing the same `id` merges. Payload =
`{ ops, note? }` (`note` = R8 two-step-move banner, #6). Client correlates the data part to the
`approval-requested` tool part on `toolCallId` — natively per-emit, which is why #9 chose data parts
over message-level `messageMetadata` (kept for usage only).

**W7 — Apply path.** On approval, `execute` runs in a fresh request: rebuild VFS
(`buildVfsForCourse`, existing per-request path), re-derive, **re-apply the R7 freshness guard**,
then apply via the **#5 `AgentDiffExecutor`** inside the **#13** `db.transaction` boundary
(pure-DB ops atomic; ≤1 FS op outside-and-after). Returns the **post-apply re-projected** file +
hash (#5/E4) as `{applied:true,…}` — minted ids / normalized fields / renumbering included, so the
agent's next edit doesn't auto-reject as stale.

**Amends recorded:** #9 (R3/R7 = structured `{applied:false}` result, not `output-error` throw);
#11 (gate revalidate on `output-available && output.applied === true`, not bare `output-available`).
**No new tickets** — #7 was the last. **Map complete.**

## #8: System-prompt rewrite (teach the edit rules)

Type: Grilling
Blocked by: #4
Status: resolved

### Question

Extend the agent's system prompt to teach the write tool and **all** the rules it must self-enforce
(R4 matrix, R5 order-as-position, R6 id discipline, R7 read-before-write, R8 move protocol), plus
worked examples, so violations are rare rather than relying solely on engine rejection.

### Answer

**Drop-in draft + design notes:** [`assets/08-edit-system-prompt.md`](./assets/08-edit-system-prompt.md).
The rules are all already decided (R4/#4/#10); #8's work was prompt **architecture** + assembling
them into a form the agent reliably self-enforces. Key calls:

- **Reframe, don't append.** Opener changes "read-only course explorer" → **course editor**, stating
  the safety model up front: every write is human-approved, and the server engine rejects illegal
  writes as a _backstop the agent should never need to hit_ (aim for zero rejections). Existing
  read/navigation sections (path conventions, glossary, `cat` filters, `grep`) stay — read-before-
  write depends on fluent reading.
- **New sections:** _Editing_ (the two tools `write`/`edit` + when to use each + read-before-write),
  _Capabilities_ (R4 table verbatim), _The rules you must follow_ (R5/R6/R7 + atomic-reject R3),
  _Moving and copying_ (R8 as named recipes), _When a write is rejected_ (the 3 rejection classes
  R3/R6/R7 + user-reject vs engine-reject).
- **Id discipline (R6) gets the most ink** — highest-risk, least-intuitive (LLMs love regenerating
  ids). Explicit DO (omit id for new) / DON'Ts (invent / change / duplicate ⇒ whole-write reject).
- **R8 taught as recipes, not theory** — lesson cross-section move = 2 writes (remove line A →
  re-add same id in B = unarchive+reparent); clip/chapter "move" = copy-into-B + delete-from-A;
  videos move like lessons.
- **Tool heuristic (#10):** `write` for tiny files, `edit` for big leaves; reorder = manifest line
  move (`edit` replace+insert_after pair, or just `write` the manifest).
- **fsStatus flagged as the heavyweight exception** (materialize/dematerialize, touches real FS; UX
  deferred to #5). All other field edits are pure DB writes.
- **7 worked examples** drafted (field edit, reorder, reorder+delete-in-one-write, ghost add, clip
  copy, cross-section move, empty-only section delete); 3–4 go inline, rest reused by #6/#7.

**Not wired** — this is a Discuss deliverable; the `write`/`edit` tools don't exist in the route
yet, so the prompt lands during the #7 wiring session (asset has line-level impl notes).

**Dependency on #12 (non-blocking):** the rules are layout-independent, but the prompt's literal
**VFS-structure ascii + example paths** assume #4's unified `_members.json`-everywhere layout. #12
fixes the exact clip/chapter/segment leaf filenames; reconcile the ascii + paths before merge. No
new tickets spawned.

## #9: Where is the derived diff computed + transported for the approval UI?

Type: Grilling
Blocked by: #4
Status: resolved

### Question

Surfaced by #1: the v6 `approval-requested` UI part carries only the tool **input** (the
proposed new file content, per R1), not the derived op-list R2 wants the breakdown to render.
So the diff (before → ops) has to reach the client some other way. Options: (a) compute the
diff **client-side** from the before-file (which the agent must have `cat`-ed, R7) and the
proposed after-file in the part input; (b) have the **server** run the diff engine (#4) at
`approval-requested` time and ship the op-list to the client via a data part /
`messageMetadata` / a preliminary tool output; (c) a dedicated non-executing "preview"
channel. Decide which, given the engine (#4) lives server-side and R3/R7 rejects also happen
server-side **before** the approval card should appear. Feeds #6 (rendering) and #7 (wiring).

### Answer

**Decision: (b) server-side.** Option (a) client-side diff is rejected — the engine lives
server-side (#4) and _needs server/DB context the client lacks_: R8 archived-id resolution
(Unarchive), R4 clip-copy verbatim-match lookup, and the R7 freshness re-hash. Running it in the
browser would fork the engine into two languages and still leave R3/R7 rejects server-side. Option
(c) preview channel is unnecessary — v6's approval pause already gives a pre-execute hook. So: **one
engine, server-side, run once per write; ship the derived `Op[]` to the client.**

**Where it runs — `needsApproval`, the only pre-approval server hook.** R3/R7 require rejecting
_before the approval card appears_ (R3), and in v6 the only server code that runs before the
approval pause is `needsApproval(input, {messages})` (the function form, #1). So the diff +
validation pipeline (#4: reconstruct after-file → R7 history-hash guard #3 → id-keyed diff → R4
matrix check) runs **inside `needsApproval`**. Outcomes:

- **Invalid (R3 forbidden-op / R7 stale-or-unread):** `needsApproval` returns **`false`** (no human
  approval) → `execute` runs _immediately, same request_ and **throws** the correction string →
  `output-error` the model sees and retries. No approval card ever renders (R3). ✅
- **Valid:** `needsApproval` **emits the `Op[]` as a persisted data part** (below) and returns
  **`true`** → SDK pauses in `approval-requested` with the breakdown already attached.

**What's transported — the #6 render contract, not raw input.** #6 pinned the shape the card needs:
`edit | delete | add{sub: create|unarchive|copy} | reorder{order:[{label,fromIndex,toIndex}]}`,
each op carrying a human `target` label + before/after detail (reorder→moved-from index per line;
unarchive→source parent; copy→footage echo). This is _derived_ state the client can't recompute —
hence the transport. Payload: `{ toolCallId, path, tool: "write"|"edit", ops: Op[], note? }`
(`note` = R8 two-step-move banner).

**Transport mechanism — a persisted, id-keyed data part** (`data-proposed-ops`), written from
`needsApproval` via a `createUIMessageStream` `writer` captured in closure, keyed by `toolCallId`.
Chosen over the alternatives:

- vs **`messageMetadata`** (already wired in this route for usage): metadata is _message_-level, so
  multiple approvals in one step force a hand-built `{[toolCallId]: ops}` map — data parts correlate
  per-emit by id natively. Keep messageMetadata for usage only.
- vs **stuffing into tool input/output:** input is the agent's (can't enrich); output only exists
  post-execute (too late for the pre-approval card).
- **Persisted (not `transient`)** so a reloaded thread re-renders the breakdown from
  `UIMessage.parts` — same localStorage story as the approval card itself (#1). The op-list is a
  _frozen proposal_; staleness is re-checked at apply, not on the card (see below). Client renders
  by matching the `data-proposed-ops` part to the `approval-requested` tool part on `toolCallId`.

**`execute` re-derives — no cross-request state.** On approve, the client resends the full message
list (#1) and `execute` runs in a **fresh request** (the `needsApproval` in-memory stash is gone by
design). `execute` therefore re-runs the same pure `deriveDiff(input, messages, vfs)` helper to get
the ops, **re-applies the R7 freshness guard** (TOCTOU: the file may have changed between request
and grant — concurrent recording), and only then applies via the #5 executor. So `deriveDiff` is a
**single pure function called in both hooks** (needsApproval to decide+emit; execute to apply) —
zero shared mutable state, freshness enforced at the moment of truth.

**Open API-mechanics check for #7** (verification, not a design fork — no new ticket): confirm
against installed `ai@6.0.116` that (1) a `writer` from `createUIMessageStream` is reachable inside
the tool's `needsApproval` closure and writes interleave correctly before the pause, and (2) the
return-`false`-then-`execute`-throws path yields a clean `output-error` (if `needsApproval` can
itself throw into `output-error`, collapse the two hooks — a simplification). #1's reference already
covers the surrounding `useChat`/`addToolApprovalResponse` wiring.

**Feeds #7** (wires `needsApproval`/`execute` + the `writer` + client correlation + accept/reject),
**#6** (confirms its render contract is the transport payload — already aligned). No new tickets.

## #10: Write-tool surface — whole-file rewrite vs targeted edit

Type: Grilling
Blocked by: #3
Status: resolved

### Question

Surfaced by #3. R1 says "the agent emits a complete new file." For large files (`timeline.json`
can hold hundreds of clips with full transcripts) a whole-file rewrite-per-edit is token-wasteful
**and** a corruption risk (the agent re-emits content it never meant to touch). Should the write
tool instead accept a **targeted edit** (old_string/new_string, like the existing file-write
page's editor), with the engine reconstructing the after-file before diffing? Decide the tool
surface: full-file write, targeted edit, or both; how it interacts with R1 (the diff engine still
runs on reconstructed before→after, so the op model is unchanged) and with R7 (a stale `old_string`
fails to match → staleness becomes partly self-enforcing). Note: manifests/`section.json` are tiny
so full-file is fine there; the win is concentrated on the big array files. Grounding to gather:
how the file-write page's edit mechanism actually works.

### Answer

**Two tools — `write` (whole-file) and `edit` (targeted, batch) — both shipped now.** Not
whole-file-first: re-emitting clip transcripts is a _correctness_ hazard (the agent corrupts
content it never meant to touch), not just a token cost, so targeted edit lands in v1.

**Grounding correction:** the ticket's premise was wrong. The file-write page
(`app/components/standalone-file-management-modal.tsx` → `app/routes/api.standalone-files.update.ts`)
is a **whole-file textarea rewrite**, _not_ a patch editor. The real targeted-edit precedent — and
what `edit` reuses — is **`app/features/article-writer/document-editing-engine.ts`**: a tested patch
engine with `replace` (exact match → whitespace-insensitive fallback, **errors on ambiguity**),
`insert_after`, `rewrite`, and `applyEdits(before, edits) → {document} | {error}`. Today it's
client-side for the article writer only.

Sizes confirm the win is narrow: only **`timeline.json` (100KB–1MB+, full transcripts per clip)**
and `segments.json` are big; manifests/`section.json`/`lesson.json`/`course.json` are tiny. `cat`
already chunks reads via `.text`/`.names`/`.[i:j]`/`.count`.

**Tool surfaces** (both `tool({ inputSchema: z.object(...), execute })`, `needsApproval` per #1):

- **`write`** — `{ path, content }`. Whole-file. Use for tiny files (manifests, `section.json`,
  `lesson.json`) and whenever a full rewrite is genuinely clearer.
- **`edit`** — `{ path, edits: [...] }`, an **array** of edits applied in sequence (one tool call
  may batch several edits to the same file). Reuse `document-editing-engine.ts`'s edit types
  (`replace`/`insert_after`; `rewrite` is redundant with `write`). Use for the big array files.

**Reorder via `edit` is supported** (decided fine): a clip/segment move = a `replace(block, "")` +
`insert_after(anchor, block)` pair within the one `edits` array. No special reorder op at the tool
surface — it falls out of the R6 id-keyed diff (#4) once the after-file is reconstructed. The agent
may also just use `write` for a reorder if that reads cleaner.

**Op model (R1) unchanged.** Both tools resolve to the same pipeline: reconstruct the **after-file**
(`write` = the literal content; `edit` = `applyEdits(beforeFile, edits)`), then run the #4 diff
engine on before→after. "Before-file" = the most-recent `cat` of that path from the message-history
scan (#3 mechanism) — the same content R7's hash is computed over. One write/edit call = one
approval = one diff (R1/R2/R3 intact regardless of tool).

**R7 interaction.** `edit`'s `old_string`-match is a _partial_ staleness self-enforcement (a stale
anchor fails to match → tool error), but it does **not** replace the R7 hash guard — keep both. A
`write` carries no anchor, so it relies entirely on the R7 hash. `edit`'s ambiguity-error (multiple
matches) is an extra safety net the article-writer engine already provides.

**Also decided this session: bump the agent model haiku → Sonnet** (`claude-sonnet-4-5`, the id used
elsewhere in the repo) — the edit discipline (R6 id rules, R7 read-before-write, R8 move protocol)
is more than haiku should be trusted with. Done now: `api.courses.$courseId.agent.ts:179`. Feeds #8
(the system prompt is written for Sonnet's capability).

**Feeds:** #4 (engine diffs the reconstructed after-file — no new ops from the tool split), #6/#9
(UI/transport key off the derived op-list, not the raw `write`/`edit` input), #8 (system prompt must
teach _both_ tools + when to use each + the reorder-as-edit-pair idiom, and is now written for Sonnet).

## #11: Revalidate the visible course page after an agent write

Type: Grilling
Blocked by: #5

Status: resolved

### Question

#5 covers refreshing the **agent's** VFS view after an approved write; this covers the
**user-facing** page. The agent mutates the DB via a _separate_ resource route
(`api.courses.$courseId.agent.ts`), so React Router will **not** auto-revalidate the course
route's loader (it only revalidates after its own actions/navigations) — the SectionGrid the
user is watching goes stale the moment the agent edits. Decide the sync mechanism: explicit
`useRevalidator().revalidate()` fired from the approval-accept handler (#7) once the write
completes, vs routing agent edits through the existing optimistic layer
(`app/features/course-view/optimistic-applier.ts`, already used for ghost-lesson edits) for
instant reflection, vs both (optimistic + revalidate-to-truth). Consider: timing (revalidate
only on **accept/execute**, not on the `approval-requested` preview), and concurrent recording
already mutating the same page. Pairs with #7 (the accept handler is where the trigger lives).

### Answer

**Decision: explicit `useRevalidator().revalidate()` — revalidate-to-truth, no optimistic layer.**
Fired from #7's approval wiring when an agent write/edit tool-call reaches **`output-available`**
(the apply succeeded server-side), never on `approval-requested`. The optimistic applier is **not**
extended to agent writes.

**Grounding (codebase map, 2026-06-19):**

- Course route `app/routes/_app.courses.$courseId._index.tsx`: loader → `selectedCourse`
  (sections→lessons→videos→segments); `SectionGrid` renders off `useOptimisticCourse(loaderData)`
  (`:138-143`). **The agent panel (`CourseAgentSidebar`) is mounted _inside this same route_**
  (`:533`) — so a `useRevalidator()` from the panel hits the very loader behind `SectionGrid`. The
  "separate route" framing is real only in that `useChat`'s `DefaultChatTransport` POSTs to
  `/api/courses/$courseId/agent` as a **plain fetch**, not an RR action/navigation — so RR's
  automatic post-action revalidation never fires. Hence an **explicit** call is required, but **no
  cross-route plumbing** is — the hook lives in the panel, same route tree.
- `useRevalidator()` is already used same-route in ~5 places (publish, video-edit, chapter-gen);
  `useFocusRevalidate` (`:209`, 5 s poll + on-focus) already exists as a backstop.
- The optimistic layer (`use-optimistic-course.ts` + `optimistic-applier.ts`) anticipates **in-flight
  fetcher submissions to `/api/course-editor` / `/api/videos/delete`**, translating a
  `CourseEditorEvent` into an immutable transform keyed to that pending fetcher.

**Why revalidate, not optimistic (the live decision):** three structural mismatches kill the
optimistic path for agent writes —

1. **Wrong transport.** Agent writes don't flow through a `/api/course-editor` fetcher; the
   optimistic applier keys off exactly those fetchers and would never see them. Wiring agent ops in
   would mean forging synthetic fetchers or a parallel optimistic channel — new machinery for no
   instant-feel payoff.
2. **No optimism window worth filling.** The write is **human-gated** (the user already waited to
   click Approve) and applied **server-side inside the `execute`** round-trip (#5/#9). By the time
   the client gets the success result the DB is already truth — the only gap is the agent
   round-trip, which optimism can't shorten.
3. **Client can't predict the result.** #5/E4 is explicit: the post-apply projection **differs from
   the agent's submitted after-file** — minted ids for null-id Adds, normalized fields, full-reindex
   renumbering. An optimistic render of the proposed ops would show _wrong_ state (no real ids, stale
   numbering) and then flicker-correct on revalidation. Revalidate-to-truth shows the real state
   once, no flicker.

So agent writes are **server-authoritative + human-gated** — the textbook case for plain
revalidation, the opposite of the low-latency ghost-lesson edits the optimistic layer was built for.

**Mechanics (handed to #7):**

- The trigger lives in the panel/sidebar component that owns `useChat` (same route as the loader).
  Watch message parts; when an agent `write`/`edit` tool part transitions to **`output-available`**,
  call `revalidator.revalidate()`. (`onFinish` is an acceptable coarser hook — fires once per turn —
  but per-tool `output-available` reflects each approved write as soon as it lands.)
- **Fire only on successful apply.** `approval-requested` (preview) and the R3/R7/`output-error` and
  user-`output-denied` rejects (#1/#9) mutate **nothing** ⇒ **no revalidate**. Gate strictly on
  `output-available`.
- **Cheap + idempotent.** RR coalesces concurrent `revalidate()` calls, so multiple writes in one
  turn need no debounce. A full loader re-fetch returns fresh objects; this is the same blast the
  existing `/api/course-editor` POST + revalidate path already produces, so DND/reference-equality
  is not a new concern (and the optimistic layer's reference-preservation only matters for _pending_
  fetcher edits, of which there are none here).
- **Concurrent recording:** revalidation pulls DB truth, so it reflects the agent's write **and** any
  concurrent recording change in one go — strictly better than optimism, which would only know the
  agent's delta. `useFocusRevalidate` stays as the existing slow backstop.

**No new tickets.** Feeds **#7** (which owns the `output-available` watcher + the `revalidator`
call alongside the accept/reject wiring).

## #12: Restructure VFS read-projection to unified manifest+leaf

Type: Grilling
Blocked by: #4

Status: resolved

### Question

Surfaced by #4's "unified `_members.json` everywhere, no array blobs" decision (which amends #3).
The read-side projection (`app/services/vfs/`) currently emits `timeline.json` and `segments.json`
as **array files**; #4 requires them to become **directories** — `<video>/timeline/` and
`<video>/segments/`, each with a `_members.json` (membership + order; for timeline an interleaved
`{id, type}` list of clips+chapters) plus **one leaf file per item** (clip/chapter/segment). Plus a
`_members.json` for `videos/` (membership-only; order ignored, but present for identity/Unarchive).
Decide: the exact virtual layout and leaf filenames for clips/chapters/segments; how `ls`/`tree`/`cat`
traverse the new directories (and how `cat`'s `.text`/`.[i:j]`/`.count` chunking maps onto per-item
leaves now that the giant `timeline.json` is gone); how `_members.json` order drives listing; and the
blast radius in `vfs-tree.ts` / `vfs-leaves.ts` / `vfs-schemas.ts` / `vfs-tree-tool.ts`. Pairs with
#4 (engine reads these manifests) and #10 (the `edit` tool now targets small per-item leaves + tiny
manifests, not a 1MB blob — re-confirm the `edit` win still lands and the reorder-as-edit-pair idiom
operates on manifest lines).

### Answer

**Virtual layout — `_members.json` at every parent, one leaf file per item, order = manifest
position uniformly:**

```
/courses/<slug>/
  course.json
  sections/
    _members.json                       [{ id, slug }]            ← position = order
    <NN-slug>/
      section.json                      (loses `order` field)
      lessons/
        _members.json                   [{ id, slug }]
        <NN.M-slug>/
          lesson.json                   (loses `order` field)
          videos/
            _members.json               [{ id, name }]            ← reorderable (see note)
            <video-path>/
              video.json
              timeline/
                _members.json           [{ id, type, label }]     ← clips+chapters interleaved
                <NN>-<slug(name)>.chapter.json    { id, name }
                <NN>.clip.json                    { id, text, sourceStartTime, sourceEndTime,
                                                    videoFilename, beatType, scene, profile }
              segments/
                _members.json           [{ id, label }]
                <NN>-<slug(title)>.json           { id, kind, title, description }
```

**Decisions (firm):**

1. **Leaf filenames = render-time `<NN>-` prefix + content hint.** The numeric prefix is **derived
   from manifest position at projection time, never stored** (same rule as `01-intro` sections, #3)
   → reorder moves a manifest line, no renumber cascade. **Chapters/segments** carry a slug hint
   (`slug(name)` / `slug(title)`); **clips have no short name → terse `<NN>.clip.json`** (transcript
   text is too long/churny for a path). The `.clip.json` / `.chapter.json` **type suffix** disambiguates
   the two kinds sharing `timeline/`. The leaf's stable identity is its `id` (inside the file + in
   the manifest), never the filename.
2. **`_members.json` carries a read-only echo (`slug`/`name`/`label`) — the cheap "table of contents".**
   Mirrors #3's `slug` echo: the engine **ignores it on existing entries** (keys only on `id`, R6).
   For `timeline/`, `label` = chapter name or a clip text-snippet, so `cat timeline/_members.json`
   gives the ordered structure of the whole video **without pulling a single transcript** — exactly
   the token win #4/#10 want.
3. **Order = manifest (insertion) position everywhere; drop `VfsDirNode.order` + the order-aware
   comparator.** Build children into the `Map` **in manifest order** (Maps preserve insertion
   order); `ls`/`tree`/`grep` iterate insertion order — **no sort at all**. Ghosts inline naturally
   (inserted in their manifest position — the old comparator's whole job). `_members.json` is
   inserted first so it heads the listing (like `sections/_order.json` listing itself, #3).
4. **Drop `order` from `SectionLeaf`/`LessonLeaf` and the positional `order` from segment items**
   (executes R5/#3 — order is now position). Confirmed dead per #3's blast-radius scan.
5. **`cat` filters: retire `.text`/`.names` (+ the `isTimeline` helper); keep the generic array
   filters, now pointed at `_members.json`.** Bulk-pull of every transcript is precisely what the
   restructure exists to avoid — per-clip `cat <NN>.clip.json` or `grep` replaces it. `.[i]`/`.[i:j]`/
   `.count` stay generic and operate on any array file (= the manifests); `.count` special-cases the
   timeline manifest → `{ clips, chapters }` by reading each entry's `type`. `.field` unchanged for
   object leaves.
6. **`videos/` reconciliation:** the ticket said "order ignored", but **#4 is authoritative and
   later** — order = manifest position uniformly, Video Reorder ✅ (R4). So videos **sort by manifest
   position and are reorderable**; the old "sort by name" special case is gone. `_members.json` =
   `[{ id, name }]`.

**`ls`/`tree`/`cat`/`grep` traversal:** all iterate `children` in insertion (manifest) order; the
`vfs-tree-tool.ts:41-48` comparator and `vfs-ls.ts` alpha sort are **deleted**, and
`vfs-grep.ts:62` `walkTree`'s `localeCompare` sort → insertion order. `grep`'s array-item matchers
(`matchSegments`/`matchTimeline`, `[i]` locators) are **replaced by per-leaf matchers** keyed on
filename suffix (`.clip.json`/`.chapter.json`/`segments/*.json`); the locator becomes the leaf
path + `:field`, consistent with the existing `section.json`/`lesson.json` matchers.

**Blast radius (files):**

- **`vfs-schemas.ts`** — add `MembersEntry` manifest schemas (section/lesson/video/timeline/segment
  variants); add `ClipLeaf`/`ChapterLeaf`/`SegmentLeaf` (the former array-item shapes, segment loses
  `order`); **remove** `SegmentsLeaf`/`TimelineLeaf`/`TimelineItem`; drop `order` from `SectionLeaf`/
  `LessonLeaf`.
- **`vfs-leaves.ts`** — `generateSegmentsLeaf` → `generateSegmentLeaf` + segments-manifest gen;
  `generateTimelineLeaf` → `generateClipLeaf`/`generateChapterLeaf` + timeline-manifest gen; add
  section/lesson/video manifest generators; drop `order` from section/lesson gens; add the render-time
  `<NN>-`/`.clip`/`.chapter` filename derivation.
- **`vfs-tree.ts`** — remove `VfsDirNode.order`; build `timeline/`+`segments/` dirs with `_members.json`
  - per-item leaf nodes at every level, **in manifest order**; `CourseEntry` grows ordered
    clip/chapter/segment arrays.
- **`vfs-tree-tool.ts`** — delete comparator (41-48), iterate insertion order.
- **`vfs-ls.ts`** — delete alpha sort, iterate insertion order; ghost tags unchanged.
- **`vfs-cat.ts`** — remove `.text`/`.names`/`isTimeline`; keep generic array + `.field`; `.count`
  reads manifest `type`.
- **`vfs-grep.ts`** — `walkTree` insertion order; per-leaf matchers keyed on filename suffix; new
  path/`:field` locators.
- **`vfs-loader.server.ts`** — `courseToEntry` emits per-item leaves + manifests (DB already loads
  clips/chapters/segments ordered, lines 74-82).
- **Tests** — `vfs-leaves.test` (order-field + timeline/segments structure), `vfs-tree-tool`
  (ghost-inline now via insertion order, not comparator), `vfs-cat` (retired filters), `vfs-grep`
  (locators), `vfs-ls`, `vfs-tree`; **`index.ts`** export updates.

**#10 re-confirmed — the `edit` win lands and amplifies:** a clip-text change now `write`s a single
small `.clip.json` (or `edit`s it) — sibling transcripts are never re-emitted; a reorder edits the
tiny `_members.json` (ids + echoes only), and the **reorder-as-edit-pair idiom** (`replace(block,"")`

- `insert_after(anchor, block)`) now operates on **manifest lines (a few bytes)** instead of clip
  blocks. The `edit` tool targets small per-item leaves + tiny manifests, exactly as #10 anticipated.

**No new tickets.** #8's system-prompt ascii must use these exact filenames/suffixes
(`.clip.json`/`.chapter.json`, `_members.json` everywhere) — already flagged non-blocking in #8;
no new ticket. #5's executor still owns mapping manifest position → DB int/fractional keys (already
in #4/#5 scope).

## #13: Shared transaction API for the agent executor

Type: Grilling
Blocked by: #5

Status: resolved

### Question

Surfaced by #5 (E2). A pure-DB multi-op write (e.g. add-ghost-lesson + reorder-siblings in one
`_members.json` edit) must apply **all-or-nothing**, but today's low-level ops services
(`LessonSectionOperationsService`, `ClipOperationsService`, `SegmentOperationsService`,
`VideoOperationsService`) each wrap their own `makeDbCall` with **no shared transaction and no
`tx` parameter** — only single-statement batch ops are atomic, and `copyVideo` opens its own
`db.transaction` internally. So the `AgentDiffExecutor` (#5/E1) cannot currently compose several
service calls atomically. Decide the **shape** of a shared transaction API:

- Thread an optional `tx`/scoped Drizzle handle through the ops service methods (clean, true
  atomicity, but touches every service signature) vs. an Effect-layer "current transaction"
  context the services read implicitly vs. an executor-owned `db.transaction` that calls services
  rebuilt to accept the tx. Which pattern fits the Effect-Service architecture best?
- How does it compose with `CourseWriteService`'s **FS-touching** ops, which can't sit in a DB
  transaction? (#5 rule (b) already limits a write to one FS op; does the tx API simply not wrap
  those, or does it model a compensating-action / saga for the `materializeGhost` internal cascade
  flagged revisit-later in #5/E2?)
- Scope: minimum needed to unblock #7 (pure-DB multi-op atomicity) vs. the fuller hardening pass
  that also addresses the FS-cascade rollback gap. Recommend shipping the former for v1.

Feeds **#7** (the wiring uses it to apply an approved write atomically).

### Answer

**Grounding (codebase map, 2026-06-19).** Every low-level ops service is built by a **factory
that takes a bare `db` handle** — `createLessonSectionOperations(db)`, `createClipOperations(db)`,
`createSegmentOperations(db)`, `createVideoOperations(db, deps)` — returning `Effect.fn` methods
that **close over that handle** (`db.query…` / `db.insert…`) and **never `yield*` another
service**. The only `yield* DrizzleService` lives in the thin `Effect.Service` wrapper
(`…OperationsService.effect`), which just does `db = yield* DrizzleService; return
create…Operations(db)`. So the factories produce **context-free Effects** (`R = never` for
LessonSection/Clip/Segment; Video carries only its `getCourseNavigationData` dep). Drizzle
transactions are already used once: `copyVideoImpl` (`db-video-operations.copy.server.ts:54`) opens
`db.transaction(async (tx) => …)` and hand-writes raw `tx` calls inside one `makeDbCall`.
`makeDbCall` (`Effect.tryPromise`) is **duplicated verbatim** in ~14 files.

**T1 — Pattern = executor-owned `db.transaction`, factories rebuilt over `tx` (option c). The
db-handle-as-factory-arg already _is_ the seam; we use it.** No method signature changes, no
implicit context. The executor (#5) does, for the pure-DB ops of one approved write:

```ts
const db = yield * DrizzleService;
yield *
  makeDbCall(() =>
    db.transaction(async (tx) => {
      const lessonOps = createLessonSectionOperations(tx); // tx-scoped instances
      const clipOps = createClipOperations(tx);
      const segmentOps = createSegmentOperations(tx);
      const program = Effect.gen(function* () {
        /* apply each DB op in sequence */
      });
      await Effect.runPromise(program); // R = never (ops close over tx); reject ⇒ drizzle rollback
    })
  );
```

Rejected alternatives — same reasoning #5 used to reject extending `CourseEditorService`:

- **(a) thread an optional `tx` through every method signature** — touches every ops method for an
  **agent-only** need, permanently taxing unrelated callers. The factory arg already gives true
  atomicity with **zero** signature churn; (a) buys nothing over it.
- **(b) implicit "current transaction" Effect context** (FiberRef/Service the services read) —
  would force every factory to **stop closing over `db`** and instead resolve a handle per call from
  context, rewriting the one clean pattern shared by ~14 services. Over-engineered for v1; revisit
  only if non-agent code later needs ambient transactions.

**T2 — The Effect/Promise boundary (the one real wrinkle, handed to #7).** Drizzle's callback is
`async ⇒ Promise`, the ops are Effects. Because tx-scoped ops are `R = never`, run the per-write
sequence with **`Effect.runPromise` _inside_ the callback**; a failure must **reject the Promise**
so drizzle rolls back — so use `runPromiseExit` and **rethrow on `Exit.failure`** (preserving the
typed error to re-surface as the R3 correction) rather than letting a failed Effect resolve into a
committed write. Two impl notes for #7: **(i)** drizzle's `tx` types as `PgTransaction`, not
`PostgresJsDatabase` — widen the factory param to a shared `Database = DrizzleDB |
PgTransaction<…>` alias (a **one-line param widening per factory**, _not_ per-method threading), or
the rebuild-over-`tx` won't typecheck; **(ii)** `createVideoOperations` needs its
`getCourseNavigationData` dep — if the executor's video ops (rename / reorder / unarchive+reparent
= `updateVideoLesson` + clear `archived`) touch it, capture a runtime via `yield* Effect.runtime()`
and use `Runtime.runPromiseExit`; if they don't, pass a throwing stub. Confirm which against the op
set when wiring.

**T3 — Composition with FS-touching ops: the tx wraps DB only; FS stays outside.** Per #5 rule (b)
a write has **≤1 FS-touching op**, and FS work can't join a DB transaction. So a write partitions
into _(pure-DB op set)_ + _(≤1 FS op)_:

- The **pure-DB set** runs in the single `db.transaction` above (the common case — e.g. add-ghost-
  lesson + reorder-siblings — is fully atomic). This is the entirety of v1's new guarantee.
- The **one FS op** runs through `CourseWriteService` (its existing `withPreAndPostValidation`),
  **outside** and **after** the DB tx commits. Ordering = **DB-tx-first, FS-last**: a DB failure
  (cheaper, likelier) rolls back and never leaves orphaned disk files; an FS failure after commit is
  the rare residual, surfaced as an error to retry.
- **Not solved in v1 (explicitly deferred):** the FS-vs-DB cross-boundary gap and the
  `materializeGhost` internal FS-cascade (#5/E2's "revisit-later"). True FS+DB atomicity needs a
  **saga / compensating action**, which is the **fuller hardening pass — out of v1 scope**. v1 ships
  pure-DB atomicity only, exactly the minimum #7 needs (the question's recommended cut).

**T4 — Where it lives + optional consolidation.** The orchestration belongs in the
`AgentDiffExecutor` (#5/E1 already centralizes policy there); factor the boundary into a tiny
**`withDbTransaction(db, (tx) => Effect): Effect`** helper that captures the `runPromiseExit`/rethrow
dance once. Two **non-blocking** cleanups this enables, neither required to unblock #7: `copyVideoImpl`
can adopt `withDbTransaction` instead of its hand-rolled `db.transaction`; the ~14 duplicated
`makeDbCall` definitions can collapse into one shared export. Nested-tx safety is moot — the agent's
clip "copy" uses `appendClips`, not `copyVideo`, so no `db.transaction` runs **inside** the
executor's tx; if one ever did, drizzle nests it as a savepoint on `tx`, which is correct.

**Scope shipped (v1):** pure-DB multi-op atomicity via factory-rebuild-over-`tx` (T1) inside the
executor, FS ops outside-and-after (T3). FS-cascade saga **deferred**. **Unblocks #7** (the last
blocker — its `execute` applies an approved write atomically by routing the DB ops through this
boundary). No new tickets.
