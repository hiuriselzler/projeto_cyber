# Task 019 — Account Deletion

**Depends on:** 003 · **Blocks:** the store listing · **Size:** M

> **Added 2026-09-14**, closing open question 11. FR-1.4 required deletion and export and no task owned either. They
> were split: deletion needs only task 003 and can be built now; export needs synced data and is
> [task 020](020-data-export.md).

## Goal
A user can delete their account and everything in it, from the app or from a web page, change their mind for seven
days, and after that nothing of theirs is left on the server.

It is a legal requirement (GDPR, LGPD — [04 §7](../04-security-and-auth.md)) and a store requirement: Google Play asks
any app that lets people create an account to let them delete it in the app **and** through a web link. It is also the
one real delete in a product where nothing else with history is ever deleted (INV-11's exception).

## Scope

**API**
- `POST /api/v1/auth/deletion` — needs the current password; sets `users.deletion_requested_at`; answers with the date
  deletion will run. `DELETE /api/v1/auth/deletion` cancels it within the grace period.
- **No verification and no entitlement is required** to delete: deletion is a privacy control, free at every tier
  (INV-26).
- **The sweep**, as a job: `maintenance_accounts_due_for_deletion` ([ADR-011](../decisions/ADR-011.md)) finds accounts
  7 days past their request; each one is deleted **inside its own scope**, one account per transaction, by deleting the
  `users` row and letting the cascade do the rest ([03 §10](../03-database-schema.md), [ADR-013](../decisions/ADR-013.md)).
- **A schedule.** Nothing runs jobs yet — the retention purges from task 003 are unscheduled too. This task adds one
  entry point, a command that runs the deletion sweep and the retention purges, to be run daily by the host's scheduler,
  and documents it in [06](../06-operations.md).
- **Emails, in the user's language** ([ADR-008](../decisions/ADR-008.md)): deletion requested — with the date and how to
  cancel; deletion cancelled; account deleted, sent before the row is gone.
- **The web deletion page** Google Play links to: a plain page served by the API, in both languages, where someone enters
  their email and receives a confirmation link; opening it schedules the deletion. Its answer is the same whether or not
  the address has an account ([04 §2a](../04-security-and-auth.md)). This is one page, not a web app — v1 still has none
  ([00 § Non-goals](../00-project-context.md)).
- Rate limits: the deletion request and the web page's email share the email-sending limit ([04 §5](../04-security-and-auth.md)).

**Mobile**
- A "Delete account" flow in `src/account/`, with a screen that says plainly what is deleted, that it cannot be undone
  after seven days, and how to cancel before then — asking for the password last.
- Signing in during the grace period shows that deletion is pending, with a way to cancel it.

## Acceptance criteria
- [ ] Requesting deletion needs the current password, and works for an unverified account
- [ ] The request emails the user, in their language, the date deletion runs and how to cancel
- [ ] Cancelling within 7 days leaves the account exactly as it was, and sends the cancellation email
- [ ] The sweep deletes an account 7 days after its request and not a moment before — tested with the clock moved
- [ ] **After the sweep, no user-owned table holds a row of that account** — a test over
      [03 §11](../03-database-schema.md)'s classification, so a table added later is covered without editing the test;
      another account's rows are untouched
- [ ] Each account is deleted inside its own scope, found only through ADR-011's function
- [ ] A deleted account's refresh tokens are refused, and its email address can register a new account
- [ ] Deletion can be requested without the app, from the web page, and the page answers identically for a registered
      and an unregistered address
- [ ] The sweep and the retention purges run from one scheduled command, documented in 06

## Notes and risks
- **Open, to settle before building:** whether requesting deletion signs every other device out at once (safer if the
  request comes from a thief) or leaves them signed in so any of them can cancel. Assumption: they stay signed in, and
  every session ends when the sweep runs.
- **Open:** what a device does with its local copy of the account's data once the account is gone. The phone holds a
  full local database ([ADR-001](../decisions/ADR-001.md)). Assumption: the device that asked erases it when it learns
  the deletion ran; another device erases it when its refresh is refused and the account no longer exists.
- **Backups** keep deleted data for their retention period. The privacy policy must say so — a launch blocker already.
- **Subscriptions** ([task 014](014-subscriptions.md)) do not exist yet. When they do, deletion must cancel the store
  subscription, or tell the user they must — task 014 carries that.
- **Stored objects** (exports, [task 020](020-data-export.md); stream uploads, [task 007](007-cardio-recording.md)) do not
  exist yet. Whichever task creates them adds them to the sweep, and the deletion test.
- **Email** goes through Resend ([05 §5](../05-integrations.md)). On its free test sender, messages reach only the Resend
  account owner's own address; a verified domain is needed before real users.
