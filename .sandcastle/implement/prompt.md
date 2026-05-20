# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from `main`. Pull in the
issue with `gh issue view {{ISSUE_NUMBER}} --comments`. If it has a
parent PRD, pull that in too.

# CONTEXT

Read `CONTEXT.md` and any relevant ADRs under `docs/adr/` before
starting. Explore the repo and fill your context with the parts
relevant to this issue — especially test files that touch the area
you'll change.

# EXECUTION

Use red-green-refactor where applicable.

1. RED: write one failing test
2. GREEN: implement to pass it
3. REPEAT until the issue is done
4. REFACTOR

Before committing, run `npm run typecheck` and `npm run test`.

# COMMIT

Make one or more git commits on `{{BRANCH}}`. Use conventional-commit messages (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Do NOT use a `RALPH:` prefix — that prefix is reserved for the RALPH loop.

# OUTPUT

When the work is committed, emit a single block as the last thing in your response:

<output>
{
  "prTitle": "feat: short imperative summary",
  "prDescription": "## Summary\n\n- bullet 1\n- bullet 2\n\nCloses #{{ISSUE_NUMBER}}"
}
</output>

- `prTitle` must be a single line, under 70 characters.
- `prDescription` must include `Closes #{{ISSUE_NUMBER}}` so the PR closes the issue on merge.

Do not close the issue yourself.
