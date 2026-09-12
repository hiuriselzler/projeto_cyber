# 04 — Security and Authentication

> **Revised for multi-user.** This document was written when the only user was the author, which
> let several things be deferred. They are no longer deferrable: §11 has largely moved into §2a,
> and account recovery, email verification and abuse handling are now v1 requirements.

The threat model has one glaring item: **GPS traces reveal where a user lives, works, and when
their home is empty.** With many users, that is other people's physical safety, held by us. It is
the part of this document worth real care.

The second is scale of blast radius: a single missed `WHERE user_id = …` used to be a bug affecting
nobody. It is now a data breach. INV-15 is the invariant that matters most here (§4).

## 1. Assets, ranked

| Asset | Exposure if leaked |
|---|---|
| **GPS traces / home location** | Physical safety. Stalking, burglary timing. The real risk. |
| Credentials | Account takeover; password reuse harms the user elsewhere. |
| Health data (HR, body weight, sex, birth date) | Sensitive personal data under GDPR/LGPD. |
| Training logs | Low sensitivity, high personal value. Loss matters more than leak. |

## 2. Passwords

- **argon2id** via `argon2-cffi`. Parameters: `time_cost=3`, `memory_cost=64 MiB`,
  `parallelism=4`. Tuned to ~250 ms on the deploy target and re-tuned when hardware changes.
- Minimum 10 characters. Length is the only rule; no composition requirements — they push users
  toward `Password1!` and weaken outcomes.
- Check candidate passwords against a local breach list (k-anonymity offline set, not a call to
  a third party — that would leak a password prefix).
- Hash parameters are stored inside the argon2 string, so they can be upgraded and rehashed
  transparently on next successful login.
- The login endpoint must take constant-ish time whether or not the email exists: always run a
  dummy verification. Otherwise it becomes an account-enumeration oracle.

## 2a. Account lifecycle — v1, not deferred

With real users, an account they cannot recover is an account they lose. These are **v1 blockers**:

- **Password reset.** Single-use token, 30-minute expiry, stored hashed, invalidated on use and on
  any password change. The request endpoint returns the same response whether or not the email
  exists — otherwise it is an account-enumeration oracle. Completing a reset **revokes every
  refresh token** for that user, on every device, and **discards their privacy zones** (§6) — the
  reset screen must say so before the user commits, not afterwards.
- **Email verification, enforced.** Unverified accounts can log in and train — never hold training
  data hostage — but cannot change their email or receive a data export until verified.
- **Email change** requires the current password and confirmation at the new address, with a
  notification to the old one.
- **Account deletion** with a 7-day grace period (§7), counted from `users.deletion_requested_at`.
- **Session list**: the user can see their signed-in devices and revoke any of them.
- **Notification on security events**: password changed, email changed, new device signed in.
- **Every email is sent in the user's language** (`users.locale`, [ADR-008](decisions/ADR-008.md)).
  A password-reset email the user cannot read is a locked-out user, and a security notification they
  cannot read is one they ignore.

## 3. Tokens

- **Access token:** JWT, HS256, **15-minute** TTL. Claims: `sub` (user id), `jti`, `exp`, `iat`,
  `device_id`. Nothing else — never PII, never email.
- **Refresh token:** opaque 256-bit random, **60-day** TTL, stored server-side **hashed**
  (SHA-256; it is high-entropy, so a slow KDF buys nothing). Rotated on every use.
- **Refresh reuse detection:** rotation writes `replaced_by`. If a token that has already been
  replaced is presented, the whole chain for that device is revoked and the user is notified.
  That is the signal that a refresh token was stolen.
- **Client storage:** refresh token in `expo-secure-store` (iOS Keychain / Android Keystore).
  Access token in memory only — never `AsyncStorage`, never SQLite.
- Logout revokes the device's refresh token server-side; "log out everywhere" revokes all.
- Long refresh TTL is deliberate: NFR-1 means a device offline for weeks must still sync when it
  returns without forcing a re-login and risking queued workouts.

## 4. Authorization — the boring rule that matters most

**INV-15: every row is owned, every query is scoped.**

- Every repository method takes `user_id` as a required parameter. Not optional, not defaulted,
  not read from a global. The base repository's typed interface makes an unscoped query fail to
  compile/typecheck rather than fail at runtime.
- No endpoint may accept an ID and return the row without an ownership check. The correct
  response to "exists but is not yours" is **404**, not 403 — 403 confirms the ID is real.
- **Postgres RLS** is enabled on all user-owned tables as a second line of defence, with the
  session's `app.user_id` set per transaction. The application must be correct without RLS; RLS
  exists to turn a missed `WHERE` from a data breach into an empty result set.
- **RLS is only a second line of defence if the API cannot skip it.** Postgres does not apply RLS to
  superusers, to roles with `BYPASSRLS`, or to a table's owner — and the Docker image's default
  `postgres` user is a superuser, so an app connected as it passes every RLS test while RLS does
  nothing. So:
  - **Two roles, locally and in every environment.** `cyberathlete_migrator` owns the schema and has
    `BYPASSRLS`; Alembic, seeds and batched backfills use it, and the running API never does.
    `cyberathlete_app` is `NOSUPERUSER NOBYPASSRLS`, owns nothing, and holds DML grants only.
  - Every user-owned table has RLS **enabled and `FORCE`d**, so a mistaken ownership grant cannot
    quietly exempt a table.
  - **Policies fail closed.** They compare against `NULLIF(current_setting('app.user_id', true), '')`,
    so a transaction with no user set sees zero rows, never all of them. `SET LOCAL` scopes the value
    to the transaction, so a pooled connection cannot carry one user into another's request.
  - **Unscoped lookups are named functions** ([ADR-011](decisions/ADR-011.md)) — a user by email at
    login, a refresh token by hash, a reset or verification token by hash, and the cross-user
    retention sweeps. Each is a narrow `SECURITY DEFINER` function that returns the minimum columns,
    pins `search_path`, and sits on an allowlist CI enforces. Never a bypass role: fail-closed RLS
    makes login impossible without them, and "connect as a role that skips RLS" is the tempting fix
    that removes the defence from every table at once.
  - **The API refuses to boot** if its role is a superuser, has `BYPASSRLS`, owns a table in the
    schema, or is a member of a role that does — and, outside local development, if the migrator's
    credentials are in its environment. A misconfigured deploy fails loudly at startup instead of
    silently in a breach.
- Global catalog exercises (`owner_user_id IS NULL`) are the single read-only exception, and
  they are never writable through any user-facing path.

## 5. Transport and API hardening

- HTTPS only, HSTS, TLS 1.2+, for every build a user can install. **The guarantee lives in the
  release build, where it can be enforced mechanically**, rather than in development habits:
  - **Release and preview builds permit no cleartext at all.** The Android network security config
    allows none, and CI fails if the release configuration permits any.
  - The API client **refuses a base URL that is not `https://`** in any non-debug build, at startup,
    before a single request.
  - **Debug builds may use `http://` to `localhost` only**, reached from a physical device over USB
    with `adb reverse` ([06 §1](06-operations.md)) — never a LAN IP, never another host. A debug build
    already needs cleartext for Metro, so a self-signed LAN certificate would add friction on every
    test device without adding a guarantee.
  - The debug-only exception is written by an Expo config plugin — platform configuration, the one
    place INV-28 allows it.
- **Rate limits** (per IP *and* per account, whichever trips first):
  `POST /auth/login` 10/15 min · `POST /auth/register` 5/hour ·
  `POST /auth/refresh` 60/hour · `POST /sync/push` 120/hour · everything else 600/hour.
  The counters live in shared storage, never in process memory, so the limits hold across more than
  one API instance (NFR-12).
- Request body caps: 2 MB general, 20 MB for a stream upload. Stream uploads are the one large
  payload and go to their own endpoint with its own limit.
- CORS: not needed (no browser client in v1). Leave it off rather than setting `*`.
- Strict Pydantic models with `extra="forbid"` on every request body. Mass-assignment is
  prevented by never binding a request model directly to an ORM object.
- Client-supplied UUID PKs (INV-16) are still validated as UUIDs and are always paired with a
  server-side ownership check — a client may choose an ID, never an owner.

## 6. GPS privacy — the part that needs real thought

Requirements:

- **Privacy zones.** The user defines circles (default radius 200 m) around home, work, etc.
  Any activity track that starts or ends inside a zone is **trimmed** — points inside the circle
  are removed from the stored polyline and streams before upload, and `start_lat/lng` are set to
  the first surviving point. Trimming happens **on the device, before the data leaves it.**
  Server-side masking would mean the server already holds the address.

- **Privacy zones sync, and nothing the server stores can open them** ([ADR-007](decisions/ADR-007.md)). Two
  requirements pull against each other here and both are real:
  - A zone drawn on the phone **must** reach the tablet. A second device with no zones uploads
    untrimmed traces of the same home — the exact failure the feature exists to prevent, arriving
    silently, months later, from the device the user forgot about.
  - A zone stored in plaintext hands the server the precise coordinate the user asked us to hide.
    That is the same objection as server-side masking, and it is worse in one way: a trace only
    implies a home, whereas a zone **is** the answer, pre-computed and labelled `Home`.

  So the row syncs as ciphertext ([03 §1](03-database-schema.md)):

  1. A 32-byte **privacy key** is generated on-device at registration and never leaves it in the
     clear. It lives in `expo-secure-store`.
  2. It is wrapped with a key derived **client-side** from the user's password — argon2id at
     `m=64 MiB, t=3, p=1`, with a salt distinct from the login hash's. `wrapped_privacy_key`,
     `privacy_key_salt` and `privacy_key_kdf` are stored server-side. A new device unwraps it with the
     password the user has just typed to sign in, so there is no extra step and nothing to transcribe
     between devices.
     **The wrapping KDF is never cheaper than the login hash (§2).** The wrapped key lets anyone
     holding a dump test password guesses against it, so a weaker KDF here would become the cheapest
     way to crack the password itself — not only the zones.
  3. `{label, center_lat, center_lng, radius_m}` is encrypted under the privacy key
     (XChaCha20-Poly1305, fresh nonce per write). The server stores a blob and a nonce and knows
     nothing else — not the label, not the radius.
  4. Changing the password re-wraps the key; it does not re-encrypt the zones.
  5. All of this happens in `apps/mobile/src/crypto/`, on libsodium through a native binding
     ([responsibility-map](responsibility-map.md)).

  **A password reset destroys the zones**, because nothing the server stores can unwrap the key
  without the password. The user is told so plainly at reset time, and re-draws them. That cost is
  not a flaw in the design — it *is* the design: a reset that could recover the zones would mean the
  server could read them all along. Zone loss is an inconvenience of minutes; the property it buys is
  that a database breach yields no addresses.

  **What it does not protect against** ([ADR-007 § Amendment](decisions/ADR-007.md)): the API
  receives the password at registration, new-device sign-in and password change, so a compromised
  *running* API could derive the key of anyone who types their password during the compromise.
  Everything the server stores is safe; the server while compromised is not. Everyday use sends no
  password (§3), which keeps that window narrow.

  On-device the zones are stored **decrypted** ([03 §8](03-database-schema.md)) — the phone
  already holds raw GPS points, so encrypting them beside it would protect nothing, and the
  trimmer needs the plain values on every finish.
- **Default visibility is `private`.** Every activity, always. No opt-out-by-default sharing.
  There is no social feed in v1 ([00 § Non-goals](00-project-context.md)), so `followers` and
  `public` exist in the enum but have no read path yet — do not build one casually.
- Full-resolution streams are only ever served to the owner.
- Location permission is requested at the moment the user first taps "record", with a plain
  explanation, never at app launch. Background permission is requested only after foreground
  recording has worked once.
- No third-party analytics SDK ever receives a coordinate. This is a hard rule enforced by
  review, because analytics SDKs are exactly the kind of thing that quietly starts collecting
  more. See [05-integrations.md](05-integrations.md) §6.

## 7. Data rights (GDPR / LGPD)

- **Export** (FR-1.4): a full JSON + GPX archive of everything, generated asynchronously and
  delivered by a signed, expiring link.
- **Delete** (FR-1.4): a real cascading delete of all user rows, plus objects in storage, within
  30 days, with a 7-day grace period during which it can be cancelled. This is the documented
  exception to INV-11.
- Data is stored in one region; the region is stated in the privacy policy.
- Retention: revoked refresh tokens purged after 90 days; access logs after 30.
- **A privacy policy and terms of service are now required** — by Google Play at launch and the App Store when iOS ships, and
  by GDPR/LGPD. They must state what is collected (including location), where it is stored, how
  long it is kept, and how to export or delete it. This is a v1 blocker for store submission, not
  a legal nicety to be added later. **Both exist in English and in Portuguese**, and the Portuguese
  version is reviewed against LGPD in its own right rather than translated from the English
  ([ADR-008](decisions/ADR-008.md)).
- **Location deserves its own consent moment**, separate from the blanket policy: plain language,
  at the point of first use (§6), explaining that traces are private by default and that privacy
  zones exist.

## 8. Secrets and configuration

- All secrets from environment variables, injected by the platform. No `.env` file is ever
  committed; `.env.example` documents the keys with dummy values.
- `JWT_SECRET` is ≥ 32 random bytes and differs per environment. Rotation invalidates access
  tokens (15 min of pain) but not refresh tokens, which are opaque and DB-backed.
- The app boots with a startup assertion that every required secret is present and that
  `JWT_SECRET` is not a known development default. Fail loudly at boot, never silently at
  first request.
- Mobile builds ship **no secrets**. Anything in the JS bundle is public — the API base URL and
  the Sentry DSN are the only things that belong there.

## 9. Logging

- Never log: passwords, tokens, coordinates, or email addresses. Log `user_id` (a UUID) instead.
- Structured JSON logs with a request ID propagated from the client, so a user-reported problem
  can be traced without logging who they are.
- Errors go to Sentry with PII scrubbing on, and coordinate fields explicitly denylisted.

## 10. Dependencies and CI

- `pip-audit` and `pnpm audit` in CI; the build fails on high/critical. (`npm audit` needs a
  `package-lock.json`, which a pnpm workspace never has — it would never have run.)
- Dependabot for both ecosystems.
- Lockfiles committed for both.
- Expo SDK upgrades are treated as a scheduled task, not an emergency, because falling behind
  eventually blocks store submission.

## 11. Deferred to post-v1 — recorded so they are not forgotten

TOTP 2FA · OAuth sign-in (note: Apple sign-in becomes **mandatory** for App Store review the
moment any other social login is added) · certificate pinning · an audit log of security-relevant
events.

Password reset and email verification **were** on this list. Multi-user moved them to §2a as v1
blockers — the old justification was that the author could be recovered by direct database access,
which is no longer a thing that can be said about the user base.

## 12. Abuse and support — new with multi-user

Modest surface, because there is no social layer in v1, but not empty:

- **Registration abuse.** Rate-limited per IP (§5); disposable-domain blocking is *not* used —
  it mostly blocks legitimate privacy-conscious users.
- **User-supplied text** (custom exercise names, activity titles, notes) is private to its owner
  in v1, so there is nothing to moderate. It is still escaped on render, and it is included in
  exports — so it must never be trusted as HTML. **The moment any of it becomes visible to another
  user, that needs its own review**, and it is a good reason to keep the social surface closed.
- **Support access to user data.** There is no admin impersonation and no back-office read of
  training data. Support works from what the user reports plus non-PII logs (§9). If a support
  tool is ever built, it needs consent-gated, time-limited, audited access — designed deliberately,
  not grown accidentally out of a debugging script.
- **Reported bugs involving another user's data** are treated as security incidents by default.
