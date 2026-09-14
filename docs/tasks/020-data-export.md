# Task 020 — Data Export

**Depends on:** 006, 007, 013, 014 · **Blocks:** the store listing · **Size:** M

> **Added 2026-09-14**, closing open question 11 with [task 019](019-account-deletion.md). Built late on purpose: an
> export has to hold every kind of data the app keeps, and the last kinds arrive with gamification (013) and
> subscriptions (014). It reads what devices have synced, so it cannot come before [task 006](006-sync-layer.md).

## Goal
A user can download everything the service holds about them — training history, activities, plans, progress, account —
in formats other tools read, at any tier, including a lapsed one.

The right of access and portability (GDPR, LGPD — [04 §7](../04-security-and-auth.md), FR-1.4), and one of the promises
the paywall never touches (INV-26). It also doubles as the user's own backup ([06](../06-operations.md)).

## Scope
- `POST /api/v1/exports` — needs a verified email (task 003's `require_verified_email` gate), never an entitlement.
  `GET /api/v1/exports/{id}` — the export's state, and its link once ready. Someone else's export is **404**.
- **Generated asynchronously**: a JSON archive of every user-owned table, plus a **GPX file per GPS activity** from
  [task 007](007-cardio-recording.md)'s writer, packed into one file.
- **Delivered by a signed, expiring link** to object storage ([05 §5](../05-integrations.md)) — the API never proxies the
  bytes — and an "export ready" email in the user's language ([ADR-008](../decisions/ADR-008.md)).
- **Values stay SI with the unit in every field name** (INV-01). What the user typed appears exactly as typed; reference
  rows appear as their keys and their names in the user's language (INV-27).
- Old export files are removed after the link expires, and by the account deletion sweep ([task 019](019-account-deletion.md)).

## Acceptance criteria
- [ ] Requesting an export needs a verified email and works at every tier — **an expired account can export**
      ([task 014](014-subscriptions.md)'s INV-26 test covers it)
- [ ] **Every user-owned table is in the archive** — a test over [03 §11](../03-database-schema.md)'s classification fails
      when a table is added and not exported
- [ ] Every numeric field carries its unit in its name, and user-typed text round-trips exactly
- [ ] Every GPS activity is in the archive as GPX that another tool opens
- [ ] The link is signed, expires, and is not guessable; another user's export is 404
- [ ] The "export ready" email arrives in the user's language, with no link in the body that works without signing in
      *or* one that expires with the file — decided at the start of the task
- [ ] Exported files are deleted when their link expires, and when the account is deleted

## Notes and risks
- **Open, to settle before building: the object storage provider.** 05 §5 names Cloudflare R2 or S3. Under the
  zero-cost preference recorded on 2026-09-14, R2's free tier is the first candidate; the storage sits behind an
  interface, as email does.
- **Open: privacy zones.** The server holds only their ciphertext ([ADR-007](../decisions/ADR-007.md)), so a server-built
  archive cannot contain a readable zone. Either the archive carries the ciphertext and the app offers the plain zones
  from the device, or zones are left out with a note. ADR-007's *Revisit if* also mentions a recovery code included in
  the export.
- An archive of a year of GPS activities can be large. Generate it in the background, in chunks, and never in a request.
