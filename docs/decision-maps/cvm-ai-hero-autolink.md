# Decision Map: CVM → AI Hero CMS auto-link (`course.json`)

Goal: make AI Hero CMS content updatable **directly from CVM**. The mechanism is an
aggregated `course.json` (every section/lesson/video + all text) emitted into the
existing Dropbox publish, which AI Hero ingests. The blocking prerequisite: CVM
currently has **no way to attach body text or an SEO description to a video** — that
content must become first-class, DB-owned and editable in CVM before the export is
meaningful. Origin: Slack DMs with Joel (June 18), Todoist "CVM -> AI Hero CMS Auto Link".

## Grounding (from codebase exploration, 2026-06-30)

- **Stack:** React Router v7 + Drizzle/Postgres + **Effect v3**. Domain: Course →
  CourseVersion (Draft/Published) → Section → Lesson → Video → {Clips, Chapters, Segments}.
- **Problem/Solution/Explainer are _videos_ under a lesson** (`video.path` ∈
  `explainer|problem|solution`; on disk `<lesson>/<videoPath>/readme.md`). A CVM lesson
  already _is_ the AI Hero lesson; its videos are the lesson's parts.
- **`videos` table has NO body/description column.** `lessons` has `title` + an
  **internal-facing** `description`. `clips.text` holds transcript text.
- **Existing publish** `app/services/course-publish-service.ts` → `syncToDropbox` writes,
  per video, the `.mp4` + `<video>.transcript.md` + `<video>.meta.json` (chapters), copies
  repo `.md`/source files (incl. `<video>/readme.md`), writes `changelog.md`, and sweeps
  stale files. Target `DROPBOX_PATH/<courseName>/`. `ALLOWED_FILE_EXTENSIONS_FROM_REPO`
  includes `.md`.
- **AI Hero today** ingests a lesson `body` from the copied `readme.md` via a `sourcePath` +
  `contentSyncStatus` comment block embedded in the body. AI Hero lesson shape:
  `fields { title, body, description, slug, state, visibility, github, optional, prompt,
thumbnailTime }` + `resources[]` (problem videoResource pos 0, solution pos 1, each with
  `srt`/`transcript`/`chapters`/`muxAssetId`/`sourcePath`). See `docs/ai-hero-api.md`.
- **`cvm` CLI is read-only**, agent-facing (`app/cli/`) — NOT the home for writes.
- **VFS layer** (`app/services/vfs/`) already projects course→JSON incl. a shallow
  `course.json`, but it is agent-only and Zod-based — explicitly **NOT reused** here.
- **Per-video UI** tabs: Video / Write / Post(YouTube / X-LinkedIn / **AI Hero** / Skills
  Changelog / Newsletter), registered in `_app.videos.$videoId.tsx`. A
  `markdown-monaco-editor.tsx` component already exists.

## Resolved inline (do not re-litigate)

Decided in the map-building `/grilling`. These are the spine; the tickets fill in the fog.

- **R1 — Source of truth = CVM database**, not the on-disk `readme.md`.
- **R2 — Two new columns on `videos`: `body` (markdown) + `description` (SEO).**
  `lesson.description` is internal-facing and stays untouched. The SEO `description` is
  **per-video** (a new field, not a reuse of `lesson.description`).
- **R3 — On publish, CVM _writes_ a derived `<video>.body.md`** (alongside the existing
  `<video>.transcript.md` / `<video>.meta.json`) from `video.body`. The source `readme.md`
  is left alone. `course.json` is **additive** — it does not replace the `readme.md`
  channel yet; an AI-Hero cutover to `course.json` is its own (fogged) ticket.
- **R4 — `course.json` contract = Effect v3 + Effect Schema.** Do **not** reuse the VFS
  layer. Stay on Effect 3 (no v3→v4 bridge to Joel's stack). Emit inside `syncToDropbox`.

## body-editor-ui: Where does the video body + SEO-description editor live?

Blocked by: —
Status: open
Type: Prototype

### Question

The editor for the new `video.body` (markdown) + `video.description` (SEO) needs a home in
the per-video UI. Candidates: (a) fold into the existing **AI Hero** sub-tab (fields are
AI-Hero-facing; that surface already loads AI Hero context/auth); (b) a **new dedicated
sub-tab** under Post; (c) a **new top-level tab**. The "Write" tab is the AI article/
newsletter writer (different artifact) and is out. Build prototypes of the variants to
compare. Persistence pattern: new `api.videos.$videoId.*` action → new `VideoOperationsService`
write method; reuse `markdown-monaco-editor.tsx`.

### Answer

_unresolved_

## course-json-shape: The `course.json` Effect Schema contract

Blocked by: —
Status: open
Type: Grilling

### Question

Define the exact aggregated document: field names; how explainer/problem/solution videos
nest under a lesson; whether the shape **mirrors the CVM domain** or **pre-maps to AI Hero's**
`fields`/`resources`/`tags`/`parentResources` shape; Draft-only vs versioned; where
transcripts/chapters/meta live in the document; how `body` + SEO `description` are carried.
Encode/decode boundary via Effect v3 `Schema`. (R2/R4 already fix the tech + fields.)

### Answer

_unresolved_

## description-backfill: Where do the initial SEO descriptions come from?

Blocked by: —
Status: open
Type: Research

### Question

AI Hero already stores per-lesson `description` values. Options: backfill `video.description`
from AI Hero (and define the lesson→video mapping for problem/solution lessons, since AI Hero
holds one description per lesson and CVM stores one per video), or leave blank for manual
authoring. Check coverage/quality via `wiki aihero` before deciding.

### Answer

_unresolved_

## readme-migration: One-time import of existing `readme.md` → `video.body`

Blocked by: —
Status: open
Type: Grilling

### Question

Mechanics of seeding `video.body` from the ~68-per-course existing
`<lesson>/<videoPath>/readme.md` files: matching logic (folder `explainer|problem|solution`
→ video; note on-disk lowercase folder vs capitalised `video.name`), lossless verification by
regenerate-and-diff against `<video>.body.md`, what happens to the now-redundant source
`readme.md` afterward, and scope (which/how many courses migrate).

### Answer

_unresolved_

## aihero-cutover: Switch AI Hero to ingest `course.json` as the source (FOG — beyond MVP)

Blocked by: course-json-shape
Status: open
Type: Research

### Question

Whether/when AI Hero stops ingesting per-file `readme.md` (via `sourcePath`) and instead reads
the aggregated `course.json` as the single source. Cross-team coordination with Joel/Vojta;
out of scope for the CVM-side MVP. Kept fogged until `course-json-shape` resolves.

### Answer

_unresolved_
