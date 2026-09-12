# AGENTS — CyberAthlete (`projeto_SHS`)

Instructions for any AI agent working in this repository. Read this file first.

`docs/` is the source of truth. Live status — what is done, what is next, what is open — is in
[docs/PROJECT-STATUS.md](../docs/PROJECT-STATUS.md); do not duplicate it here.

## Read in this order before any work

1. `.agents/AGENTS.md` — this file
2. `docs/00-project-context.md`
3. `docs/PROJECT-STATUS.md`
4. `docs/invariants.md`
5. the task being worked on, in `docs/tasks/`
6. the domain documents that task refers to
7. the ADRs that task refers to, in `docs/decisions/`
8. the code that is currently relevant

## Working rules

- **Docs first.** Agree a doc change before making a code change. If a request is not covered by the
  docs, or contradicts them, raise it — as an open question in the doc — instead of silently picking
  an interpretation.
- **Do not modify code unless explicitly told to.** A request to review, explain, report or plan is
  not permission to edit.
- **Any change to `docs/invariants.md` needs a formal ADR** in `docs/decisions/` — including a change
  to how an invariant is enforced, and including a pure reordering. A decision-log note is not enough.
  When an ADR is added, update the ADR and doc counts in PROJECT-STATUS and the document map in
  `docs/00-project-context.md`.
- **A decision that was argued over belongs in an ADR**, not in a commit message.
- **If code contradicts a doc, one of them is a bug** — say which.
- **Record every decision** in PROJECT-STATUS's decision log, dated.
- **Tick a task in PROJECT-STATUS only when every acceptance criterion in its task file is ticked.**

## Easy to get wrong

- The training unit is the **microcycle** (1–28 days). Never call it a week, and never assume 7 (INV-25).
- **RIR is not RPE.** Never convert between them (INV-03).
- **Storage is SI**; only the formatting module converts units (INV-01).
- **Android first.** Only `apps/mobile/src/platform/` may know the operating system (INV-28).
- **Every query is scoped to a user**, and the API never connects as a role that can skip row-level
  security (INV-15, ADR-011).
