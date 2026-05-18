# Deliverables Calendar is manual and informational

The Deliverables Calendar is a planning surface for scheduling Courses and Pitches against ship dates. We chose to model **Deliverables as standalone, manually-curated entries** rather than as a derived view of Pitch/Course state — and their links to Courses and Pitches are purely informational, with **no automatic state propagation in either direction**. Flipping `Deliverable Status` does not flip the linked Pitch's status, and vice versa.

The alternative we considered was the obvious one: derive Deliverables from `Pitch Status.scheduled` (and an equivalent for Courses), and have shipping a Pitch auto-flip its Deliverable to `done`. We rejected it because the calendar's primary value is as a _planning_ artifact — entries often exist before the linked entity does, get moved around speculatively, and bundle multiple linked items under a single ship date that doesn't correspond to any single entity's lifecycle. Coupling Deliverable state to Pitch/Course state would force premature consistency on what is, deliberately, a loose bookkeeping layer.

## Consequences

- A Pitch with `status = scheduled` and no linked Deliverable is valid, and so is a `done` Deliverable whose linked Pitch is still `idle`. Neither is a bug.
- `Pitch Status.scheduled` keeps its meaning as a manual marker; its glossary entry no longer references the external Google Doc.
- Auto-derivation (in either direction) remains an additive future change. Reversing _to_ derivation later means writing migration logic to reconcile manually-curated divergence; reversing _away_ from derivation later would be harder still, which is part of why we start manual.
