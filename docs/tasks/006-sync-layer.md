# Task 006 — Sync Layer

**Depends on:** 003, 004 (005 if it lands first) · **Blocks:** multi-device use · **Size:** L

## Goal
Data written on one device appears on another, nothing is ever lost, and the user never sees a
spinner because of it. Implements the protocol in [02 §7](../02-architecture.md) and pays the
debt taken on in [ADR-001](../decisions/ADR-001.md).

**This is the hardest task in the project.** It is a separate task precisely so it is not
smuggled into feature work and rushed.

## Scope

**Server**
- `GET /sync/changes?since=<cursor>&limit=` — rows changed after the cursor, grouped by entity,
  in dependency order (exercises before workouts before sets), with a new cursor. Cursor is
  `(updated_at, id)`, not a bare timestamp — a bare timestamp drops rows sharing a millisecond.
- `POST /sync/push` — a batch of upserts and soft deletes. Idempotent because the client owns the
  IDs (INV-16). Ownership checked per row (INV-15); a client may choose an ID, never an owner.
- Per-row results, so one bad row rejects itself instead of failing the batch. The response says
  which rows were rejected and why.
- **Tolerate unknown fields in both directions** — an old client and a new server must coexist
  ([06 §4](../06-operations.md)).
- Reject-rate metric exposed; it is the early-warning signal ([06 §7](../06-operations.md)).

**Client**
- `outbox` writer: every local mutation enqueues an entity/op/payload row in the same transaction
  as the mutation itself. If the write happened, the outbox entry exists — no window where they
  disagree.
- Drain worker: batched, exponential backoff, resumable, triggered on connectivity change, app
  foreground, and after any mutation.
- Pull worker with cursor persistence in `sync_state`.
- **Never sync a workout while it is in progress** (`ended_at IS NULL`). It is unstable, and
  syncing it invites a conflict with itself from another device.
- Conflict resolution per [02 §7](../02-architecture.md): last-write-wins per row by
  `updated_at`, with three carve-outs —
  - **a set or an activity present on either side is never dropped** (NFR-4);
  - **plans resolve at microcycle granularity**, so a cycle is never half from each device;
  - **within a microcycle, writer and engine version decide before the clock** — a higher
    `engine_version` beats a lower one, a user write beats an engine write, and only same-kind,
    same-version writes fall back to `updated_at` ([ADR-004](../decisions/ADR-004.md)).
- **`superseded` is a result, not a rejection.** A pushed projection from an older engine is answered
  `superseded` in the per-row results; the device keeps the server's projection, and the push's
  *logs* are still processed normally, so the server re-reconciles at its own version. It is excluded
  from the outbox rejection-rate alert ([06 §7](../06-operations.md)).
- UI: a quiet sync indicator; a visible warning only after repeated failure or a large stale
  outbox. Sync is never a blocking gate (NFR-1).

**Streams** (once task 007 exists) upload separately from the activity row, so an activity's
summary appears before its charts ([ADR-003](../decisions/ADR-003.md)).

## Acceptance criteria
- [ ] Log a workout offline on device A, go online, and it appears on device B
- [ ] Pushing the same batch twice creates no duplicates (idempotence, INV-16)
- [ ] Killing the app mid-push loses nothing; the outbox drains on next launch
- [ ] A 500 from the server leaves the outbox intact and retries with backoff
- [ ] Two devices editing different fields of the same workout converge, and no set is lost
- [ ] Two devices editing different microcycles of one mesocycle both survive
- [ ] **A device offline for a month on an older engine converges without losing anything**: every
      logged set arrives, every user edit survives, its stale projections are superseded by the
      server's — and nothing is rewritten again on the next sync (INV-06, INV-10)
- [ ] Two devices on different engine versions reconciling the same mesocycle stop rewriting each
      other after a single sync round
- [ ] A `superseded` result is not counted toward the rejection-rate metric
- [ ] One malformed row is rejected individually; the rest of the batch commits
- [ ] A client built against an older schema syncs successfully against the current server
- [ ] 30 days of offline usage (~40 workouts) syncs without timeout, in batches
- [ ] A clean reinstall pulls full history and reaches the home screen in reasonable time

## Notes and risks
- **Open, from [task 019](019-account-deletion.md): what a device erases when its account is deleted or its session
  ends.** Today a device erases the session, the privacy key and the account's local row. Once this task gives a device
  training data of its own, decide what happens to it — including an outbox not yet pushed, which is the one copy of a
  workout that exists — when a refresh is refused because the account is gone, and when it is refused for any other
  reason. The server cannot tell the two apart for the device without saying which addresses have accounts.
- **Test with two real devices**, not two simulators against one database. Clock skew, real
  network flakiness, and backgrounding behaviour are where the bugs live.
- The clock is untrustworthy: `updated_at` comes from the device and devices are wrong. For
  last-write-wins, prefer server-assigned ordering for the pull cursor and treat client
  `updated_at` as advisory. This is a known weakness of LWW — accepted for v1 because the
  carve-outs protect the data that actually matters.
- Deletions are soft (INV-11), which is what makes them syncable at all. Never hard-delete a
  syncable row outside account deletion.
- **⚠ Unresolved before this task starts — [ADR-004](../decisions/ADR-004.md)'s condition 3.** Under
  option B, server reconciliation must be *authoritative*, "not one more last-write-wins writer". The
  resolution table in [02 §7](../02-architecture.md) still lets a device's engine write beat the
  server's at the **same** engine version when its `updated_at` is newer. Same version means the same
  function, but not always the same inputs — a device may lack logs the server already has. Decide how
  the two rules combine, and write it into 02 §7, before building conflict resolution.
- **Applying a resolved cycle must pass the INV-06 backstop** ([ADR-013](../decisions/ADR-013.md)). The
  trigger rejects a changed prescription in a cycle that is no longer `projected` unless the set is
  `user_edited`. Apply a winning cycle's children before its new status, or replace them; never look for
  a way round the trigger.
- If this task overruns badly, that is the signal in [ADR-001 § Revisit if](../decisions/ADR-001.md)
  — evaluate PowerSync or ElectricSQL over the existing Postgres rather than pushing on.
