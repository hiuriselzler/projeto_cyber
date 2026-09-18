# Task 019 — Account Deletion

**Depends on:** 003 · **Blocks:** the store listing · **Size:** M

> **Complete (2026-09-18).** Built on `feat/task-019-account-deletion`, rebased onto `main` after task 017's core-rs
> merge, and merged as [PR #11](https://github.com/hiuriselzler/projeto_cyber/pull/11) with all five CI jobs green.
> Every criterion below is ticked; what was settled while building is at the end of this file.

> **Added 2026-09-14**, closing open question 11. FR-1.4 required deletion and export and no task owned either. They
> were split: deletion needs only task 003 and can be built now; export needs synced data and is
> [task 020](020-data-export.md).

> **Planned 2026-09-14**, after task 003 closed. Settled: other devices stay signed in when deletion is requested; the
> web page's link opens a page and schedules nothing until its button is pressed; that link's token has a table and an
> allowlisted lookup of its own; the in-app request counts against the login limit; the "account deleted" email goes out
> after the deletion commits; and the daily command lives in a new `app/jobs/`. **Still open:** what a device does with
> its local data once the account is gone, and which scheduler runs the command — neither blocks the API half.

## Goal
A user can delete their account and everything in it, from the app or from a web page, change their mind for seven
days, and after that nothing of theirs is left on the server.

It is a legal requirement (GDPR, LGPD — [04 §7](../04-security-and-auth.md)) and a store requirement: Google Play asks
any app that lets people create an account to let them delete it in the app **and** through a web link. It is also the
one real delete in a product where nothing else with history is ever deleted (INV-11's exception).

## Scope

**API**
- `POST /api/v1/auth/deletion` — needs the current password; sets `users.deletion_requested_at`; answers with the date
  from which the account is deleted: the request plus 7 days. The daily sweep deletes it on the first run after that
  date, well inside 04 §7's 30 days. `DELETE /api/v1/auth/deletion` cancels it within the grace period. Both need a
  signed-in user.
- **No verification and no entitlement is required** to delete: deletion is a privacy control, free at every tier
  (INV-26).
- **Other devices stay signed in** when deletion is requested, so any of them can cancel; every session ends when the
  sweep deletes the account (settled 2026-09-14). `GET /auth/me` carries the pending deletion's date, so a device can
  show it.
- **The sweep**, as a job: `maintenance_accounts_due_for_deletion` ([ADR-011](../decisions/ADR-011.md)) finds accounts
  7 days past their request; each one is deleted **inside its own scope**, one account per transaction, by deleting the
  `users` row and letting the cascade do the rest ([03 §10](../03-database-schema.md), [ADR-013](../decisions/ADR-013.md)).
  It connects as `cyberathlete_app`, like the API — never as the migrator.
- **A schedule.** Nothing runs jobs yet — the retention purges from task 003 are unscheduled too. This task adds one
  entry point in a new `app/jobs/` folder ([responsibility-map](../responsibility-map.md)): a command that runs the
  deletion sweep and the retention purges, to be run daily by the host's scheduler, and documented in
  [06](../06-operations.md).
- **Emails, in the user's language** ([ADR-008](../decisions/ADR-008.md)), with plain arguments only: deletion requested —
  with the date and how to cancel; deletion cancelled; account deleted. For the last, the address, name and language are
  read inside the account's deletion transaction and the email is sent **after it commits**, like every email since
  task 003 — so no one is told of a deletion that then failed.
- **The web deletion page** Google Play links to — one page served by the API, not a web app
  ([00 § Non-goals](../00-project-context.md)), in `app/api/web/`:
  - `GET /account-deletion` shows a form for an email address. `POST /account-deletion` sends a confirmation link to
    that address, and answers the same whether or not it has an account ([04 §2a](../04-security-and-auth.md)).
  - `GET /account-deletion/confirm?token=…` **shows a page with a button**; only `POST /account-deletion/confirm`
    schedules the deletion. Mail providers and link scanners open links on their own, and a link that acted on opening
    would schedule deletions nobody asked for.
  - The token is single-use, expires in 30 minutes and is stored hashed in its own table, `account_deletion_tokens`
    ([03 §1](../03-database-schema.md)), found before the user is known through a new allowlisted function,
    `auth_redeem_deletion_token` ([ADR-011](../decisions/ADR-011.md)). A table of its own, so no reset or verification
    link can be replayed at this route.
  - The link points at the API's public HTTPS address — a new setting beside `APP_LINK_BASE`, which points into the app.
  - English or Portuguese from `Accept-Language`, with a link to the other language; every string from the shared
    catalogs (INV-27). No cookies, so there is no session for a forged request to ride; `frame-ancestors 'none'`, so
    the page cannot be framed.
  - These are the only routes outside `/api/v1` and `/health`; the route-table test lists them by name.
- **Rate limits** ([04 §5](../04-security-and-auth.md)): the in-app request checks a password, so it counts against the
  login limit, as a password change does; the web page's email request shares the email-sending limit; everything else
  takes the default. A public page limited per IP depends on open question 12 in PROJECT-STATUS before any deploy.

**Mobile**
- A "Delete account" flow in `src/account/`, with a screen that says plainly what is deleted, that it cannot be undone
  after seven days, and how to cancel before then — asking for the password last.
- A signed-in device with a pending deletion shows it, with its date and a way to cancel.

## Acceptance criteria
- [x] Requesting deletion needs the current password, works for an unverified account, and a wrong password counts
      against the login limit
- [x] The request emails the user, in their language, the date deletion runs and how to cancel
- [x] Other devices stay signed in during the grace period, and any of them can cancel
- [x] Cancelling within 7 days leaves the account exactly as it was, and sends the cancellation email
- [x] The sweep deletes an account 7 days after its request and not a moment before — tested with the clock moved
- [x] **After the sweep, no user-owned table holds a row of that account** — a test over
      [03 §11](../03-database-schema.md)'s classification, so a table added later is covered without editing the test;
      another account's rows are untouched
- [x] Each account is deleted inside its own scope, found only through ADR-011's function
- [x] The "account deleted" email is sent only once the deletion has committed
- [x] A deleted account's refresh tokens are refused, and its email address can register a new account
- [x] Deletion can be requested without the app, from the web page, and the page answers identically for a registered
      and an unregistered address
- [x] Opening the confirmation link schedules nothing; only the page's button does. A used or an expired link is refused
- [x] The web page renders in `en` and `pt-BR` from the shared catalogs, and refuses to be framed
- [x] The sweep and the retention purges run from one scheduled command, documented in 06

## Notes and risks
- **Open, to settle before the mobile half:** what a device does with its local copy of the account's data once the
  account is gone. The phone holds a full local database ([ADR-001](../decisions/ADR-001.md)). Assumption: the device
  that asked erases it when it learns the deletion ran; another device erases it when its refresh is refused and the
  account no longer exists.
- **Open, to settle with the host:** which scheduler runs the daily command. [05 §5](../05-integrations.md) names Fly.io or
  Railway, and both can run a command on a schedule. Until a host exists, the command runs by hand, and in tests.
- **The web page needs only the inbox.** Anyone who can read the account's email can schedule its deletion. The owner is
  emailed and every device stays signed in, so it can be cancelled for 7 days; it can never complete silently.
- **The page's answer is identical, its timing is not:** a registered address writes a token and sends an email — the
  same gap task 003 accepted for the reset request.
- **Backups** keep deleted data for their retention period. The privacy policy must say so — a launch blocker already.
- **Subscriptions** ([task 014](014-subscriptions.md)) do not exist yet. When they do, deletion must cancel the store
  subscription, or tell the user they must — task 014 carries that.
- **Stored objects** (exports, [task 020](020-data-export.md); stream uploads, [task 007](007-cardio-recording.md)) do not
  exist yet. Whichever task creates them adds them to the sweep, and the deletion test.
- **Email** goes through Resend ([05 §5](../05-integrations.md)). On its free test sender, messages reach only the Resend
  account owner's own address; a verified domain is needed before real users.

## Settled while building (2026-09-14)
- **Decided with the project owner before building:** other devices stay signed in; when a session ends on a device —
  a sign-out, a reset, or a refresh the server refuses, as it does once the account is gone — the device erases the
  privacy key and the account's local row, and what it keeps of training data is [task 006](006-sync-layer.md)'s to
  settle; a pending deletion shows on the home route, with a "Delete account" link there until a settings screen exists;
  and dates are written in numbers, in each language's order.
- **A second request keeps the first date** and sends no second email. Cancelling with nothing pending answers `204`
  and sends nothing.
- **Timestamps are answered in UTC.** Postgres returns a timestamp in the connection's time zone — the local server
  answers in `-03:00` — so the same instant came back written two ways. The deletion answers and the account's
  `deletion_requested_at` are normalised. The session list's `last_active_at` still carries the connection's offset:
  correct ISO 8601, left for task 006, which reads timestamps from the database throughout.
- **A deleted account's access token signs the device out.** For its last minutes, `GET /auth/me` answers `401`, not
  `404`, and `POST /workouts` answers `401`, not the misleading `409 id_unavailable` a missing account's foreign key
  produced.
- **The email sender is chosen in `app/core/email.py`**, not in the routers' wiring, so the daily command — which may not
  import a router — sends through the same transport.
- **`app.jobs` sits beside `app.api`** as an independent top layer in `.importlinter`, and every contract that names the
  app's packages names it, each with a planted violation.
- **The web page's forms are parsed with the standard library** and validated through strict models; no
  `python-multipart`. The page's date is in the account's time zone, as the email's is; the app shows the day of the
  request in the device's, and the catalog says the account goes 7 days after — the app keeps no copy of the grace
  period.
