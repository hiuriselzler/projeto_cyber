# Task 003 — Authentication and Authorization

**Depends on:** 002 · **Blocks:** 006 (sync), 012, 014 · **Size:** L

> **Complete (2026-09-14).** CI was green on all four jobs of pull request #9, merged to `main` as `425a970`, and every
> criterion below is ticked. What the closing review found is at the end of this file.

> **Device checks (2026-09-12):** there is no physical device before [task 017](../tasks/017-local-toolchain-device-spike.md). The
> criteria that need one — the libsodium binding, offline sign-in, the privacy-key flows, the
> key-derivation timing — moved there; this task closes on what the API tests, Jest and lint prove.

> **Resized for multi-user.** Password reset and email verification moved here from "deferred"
> ([04 §2a](../04-security-and-auth.md)); they are v1 blockers now that users are not the author.

> **Planned 2026-09-14.** Four mechanisms 04 left open are settled in [ADR-015](../decisions/ADR-015.md): rate limits
> counted in Postgres, a 60-second grace window on refresh rotation, the bundled breach list, and registration's `409`.
> Also settled: the password-change endpoint, which the list below lacked; routes under `/api/v1`; and a minimal
> `workouts` read and write, so the ownership criteria have a real route to test. **The data export and account
> deletion (FR-1.4) belonged to no task** (now tasks 019 and 020) — this task builds the verified-email gate the export will sit behind, and
> proves it on a route the test mounts.

## Goal
A user can register, sign in on two devices, stay signed in for weeks offline, and cannot under
any circumstance read another user's rows.

The authorization half matters more than the authentication half. Login is a solved problem;
INV-15 is a discipline that has to be built into the shape of the code in this task, because
retrofitting it means auditing every query ever written.

## Scope

**API — [04 §2–5](../04-security-and-auth.md)**, every route under `/api/v1` ([02 §5](../02-architecture.md))
- `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` ·
  `POST /auth/logout-all` · `GET /auth/me` · `PATCH /auth/me`
- **Account lifecycle, v1 ([04 §2a](../04-security-and-auth.md)):**
  `POST /auth/password-reset/request` · `POST /auth/password-reset/confirm` ·
  `POST /auth/password/change` · `POST /auth/email/verify` · `POST /auth/email/verification` (send again) ·
  `POST /auth/email/change` · `GET /auth/sessions` · `DELETE /auth/sessions/{id}`
- Reset tokens: single-use, 30-minute expiry, stored hashed. Completing a reset **revokes every
  refresh token** on every device, invalidates every other reset token, and soft-deletes the user's privacy zones,
  which nothing can decrypt any more. The confirmation carries the new wrapped key the device just generated.
- Verification tokens: single-use, **24-hour** expiry, stored hashed. The same token table carries an email change,
  since each token names the address it verifies.
- The reset *request* endpoint returns an identical response whether or not the email exists —
  otherwise it is an account-enumeration oracle, the same trap as login (§ constant time below).
- **Registration with an address already in use answers `409`** — accepted, behind its rate limit
  ([ADR-015](../decisions/ADR-015.md)).
- **Password change** requires the current password, carries the re-wrapped privacy key, invalidates unused reset
  tokens and **leaves other devices signed in** ([04 §2a](../04-security-and-auth.md)).
- Unverified users can log in and train; they cannot change their email or request an export.
  **Never hold training data hostage to verification.** The gate is one dependency, `require_verified_email`.
- Security notification emails: password changed, email changed (to the old address), new device signed in, and
  refresh-token reuse detected. A new device is a `device_id` never seen before for that account; registration's own
  device is not one.
- **Every email in the user's language** — templates in `en` and `pt-BR`, selected by
  `users.locale`, with strings from the shared catalogs ([ADR-008](../decisions/ADR-008.md)). Email messages take plain
  `{name}` arguments only, checked by a test: the API does not carry an ICU plural engine.
  `locale` and `unit_system` are set at registration from the device and editable via
  `PATCH /auth/me`.
- **Email goes through one sender interface** in `app/core/`: an in-memory sender in tests, a git-ignored folder in local
  development, and Resend, chosen for the prototype on 2026-09-14 ([05 §5](../05-integrations.md)). A deployed API
  boots only with Resend and its key. Mail is sent after the transaction commits; a failure to send is logged, without the
  address, and never fails the request.
- argon2id hashing, tuned to ~250 ms on the deploy target, params recorded in the hash string. It runs off the event
  loop. **Raising them raises the floor for the client's wrapping KDF too** ([ADR-007](../decisions/ADR-007.md)): the
  login hash's parameters are recorded in `packages/shared/security/password-kdf.json`, which both suites test against.
- Access JWT, 15 min, claims limited to `sub`/`jti`/`exp`/`iat`/`device_id` — no PII.
- Opaque refresh token, 60 days, stored SHA-256 hashed, **rotated on every use**, with
  `replaced_by` chain and **reuse detection** that revokes the whole device chain — with the
  **60-second grace window** of [ADR-015 §2](../decisions/ADR-015.md) for a response that never arrived.
- `device_id` is a random identifier the app generates once and keeps in secure storage; `device_name` is optional.
- Constant-time login regardless of whether the email exists (always run a dummy verify).
- Rate limits from [04 §5](../04-security-and-auth.md), keyed on IP *and* account, **counted in Postgres**
  (`rate_limit_buckets`, [ADR-015 §1](../decisions/ADR-015.md)); `429` with `Retry-After`.
- Breach-list check at registration, password change and reset, against the bundled list of
  [ADR-015 §3](../decisions/ADR-015.md), rebuilt by a script from its verified source.

**Authorization scaffolding — the important part**
- `get_current_user` dependency; every non-auth router depends on it, **proven by a test over the route table**.
- A **base repository whose every method requires a `user_id` argument**, typed such that omitting
  it is a type error rather than a runtime bug — proven by a known-bad fixture mypy must reject.
- Per-transaction `SET LOCAL app.user_id` so RLS engages ([04 §4](../04-security-and-auth.md)), on a
  connection as `cyberathlete_app`. Login, refresh and token redemption find their row through the
  task-002 `SECURITY DEFINER` lookups, then set the scope — never through a role that skips RLS.
  Registration sets the scope to the new account's id before inserting it. A plain `SET` is banned: it
  outlives the transaction on a pooled connection ([ADR-011](../decisions/ADR-011.md)).
- **404, never 403**, for a row that exists but is not yours.
- **The first owned routes:** `POST /workouts` and `GET /workouts/{id}`, minimal — enough to prove ownership and the
  unverified user's right to train. [Task 004](004-exercise-catalog-and-logging.md) extends them.

**The privacy key — [ADR-007](../decisions/ADR-007.md)**

Built here rather than in [task 007](007-cardio-recording.md), because it hangs off registration,
sign-in and password change, and retrofitting it into an auth flow that already has users means a
migration with no way to derive the missing keys.

- **On registration:** generate a 32-byte privacy key on-device from the OS CSPRNG, store it in
  `expo-secure-store`, wrap it with `argon2id(password, privacy_key_salt)` at `m=64 MiB, t=3, p=1`,
  derived **client-side** — a salt distinct from the login hash's — and send only
  `wrapped_privacy_key`, `privacy_key_salt` and `privacy_key_kdf`.
- **The wrapping KDF is never cheaper than the login hash** — memory and iterations each at least the
  server's. The wrapped key is a password-guessing oracle for anyone holding a dump, so a cheaper KDF
  here would make it the cheapest route to the password itself ([ADR-007](../decisions/ADR-007.md)).
- **All of it lives in `apps/mobile/src/crypto/`**, on libsodium through a native binding. The flows are
  built against `src/crypto/`'s interface and tested in Jest — against libsodium's own JavaScript build, so wrapping and
  unwrapping really run; confirming the candidate,
  `react-native-libsodium` (argon2id, XChaCha20-Poly1305, `randombytes`), in a development build is
  [task 017](../tasks/017-local-toolchain-device-spike.md)'s, before anything relies on it. The derivation must not freeze the screen.
- **On sign-in from a new device:** unwrap with the password just entered, before it leaves scope.
  There is exactly one moment when the plaintext password is available on the client; the flow has
  to use it or the key is unrecoverable.
- **On password change:** re-wrap the key. Do **not** re-encrypt zones.
- **On password reset:** the key is gone and so are the zones. The reset screen says so before the
  user commits ([04 §2a](../04-security-and-auth.md)), and the device generates a new key.
- The server never sees the key or a zone, and stores only opaque columns. **It does see the
  password** — at registration, sign-in and password change — and
  [ADR-007 § Amendment](../decisions/ADR-007.md) records what that exposes. So the password is never
  logged, never sent to Sentry, and never held past the request.

**Mobile**
- Sign-in / register / reset / password-change / session-list screens, session bootstrap on launch. **The flows live in
  `src/account/`** ([ADR-012](../decisions/ADR-012.md)): screens call it; it calls `src/sync/` for HTTP and `src/crypto/`
  for the privacy key. Screens import neither.
- Refresh token in `expo-secure-store`; access token **in memory only** — never SQLite, never
  `AsyncStorage`.
- Automatic refresh on 401 with a single-flight lock, so ten parallel requests trigger one refresh.
- **Offline sign-in:** a user who has signed in before and whose refresh token has not expired
  must reach the app with no network. Auth is not on the path to using the app (NFR-1). This is
  the requirement most easily got wrong, and it makes the app unusable at the gym if missed. The account's profile is
  kept in the local `users` row, so language and units come from the account from then on, not the device.

## Acceptance criteria
- [x] Register → login → refresh → access a protected route, on two devices simultaneously
- [x] Replaying an already-used refresh token revokes that device's whole chain, and sends the reuse notification
- [x] A refresh token presented again within 60 s of its rotation, while its successor is unused, receives a new
      successor instead; once the successor is used, or after 60 s, it is reuse ([ADR-015](../decisions/ADR-015.md))
- [x] Logout on device A leaves device B signed in; logout-all signs both out
- [x] `GET /workouts/{id}` for another user's workout returns **404**
- [x] With RLS on, a deliberately unscoped repository query returns 0 rows rather than data —
      write this test, prove the second line of defence works
- [x] A repository call without `user_id` fails mypy — a known-bad fixture proves it; and every route outside
      `/auth` and `/health` depends on `get_current_user` — a test over the route table proves it
- [x] Login attempts for an existing and a non-existent email differ by < 20 ms across 100 runs
- [x] Rate limit returns 429 with `Retry-After` after 10 failed logins, and the count holds across two API instances
      sharing one database
- [x] A password reset completes, and **every other device is signed out**
- [x] A used reset token is rejected; an expired one is rejected
- [x] Reset-request responses are identical for a registered and an unregistered email
- [x] A password change keeps other devices signed in, replaces the wrapped key, and rejects the old password afterwards
- [x] A password on the breach list, or shorter than 10 characters, is refused at registration, change and reset —
      *the length rule at change and reset is proven through the one check all three routes call, unit-tested, while
      the breach list is refused at each route in integration; accepted at the close, 2026-09-14*
- [x] An unverified user can log in and log a workout, but cannot change their email, and is refused by the
      verified-email gate the data export will sit behind — proven on a route the test mounts, since the export is
      task 020's
- [x] The session list shows both devices and revoking one signs only that one out
- [x] Every email renders in `en` and `pt-BR` from the shared catalogs, with plain arguments only
- [x] The client wrapping-KDF constants are at least the server's login-hash memory and iterations; a
      test fails if either side changes so the client falls below ([ADR-007](../decisions/ADR-007.md))
- [x] Only `src/crypto/` imports the crypto library or reads the privacy key from secure storage —
      enforced by lint
- [x] No route or feature imports `src/sync/` or `src/crypto/`; sign-in, registration and password
      change reach both only through `src/account/` — enforced by lint
      ([ADR-012](../decisions/ADR-012.md))
- [x] Ten parallel requests that meet a 401 trigger exactly one refresh; the access token is never written to storage
- [x] With no network, a launch holding an unexpired refresh token reaches the signed-in app — proven in Jest here,
      on a device in task 017

## Notes and risks
- Password reset is the flow attackers probe first. The enumeration-safe response and the
  revoke-all-on-reset behaviour are the two things most often got wrong.
- Reset and verification both need working transactional email
  ([05 §5](../05-integrations.md)) — no longer optional infrastructure. **The provider is Resend** (2026-09-14):
  everything here is built and tested against the sender interface, and Resend is one adapter behind it.
- The single-flight refresh lock is the classic source of a token-refresh stampede that revokes
  the user's own session through reuse detection. Test it with concurrent requests specifically.
- **A refresh killed in flight and relaunched more than 60 seconds later still signs the device out**
  ([ADR-015](../decisions/ADR-015.md)). Accepted; its revisit condition is written down.
- argon2id at 64 MiB with `p=4` per login is real memory and CPU under concurrent sign-ins (NFR-12). It runs in a
  worker thread, and it is one of the first things a load test measures.
- The constant-time test sends 200 logins, far past the login limit, so it runs with the limiter replaced; the limiter
  has its own test.
- The privacy key is the one piece of this task whose omission is invisible until
  [task 007](007-cardio-recording.md) needs it, and expensive by then — every existing account
  would have no key and no password to derive one from. Build it now even though nothing encrypts
  anything yet.
- **Until task 017, the libsodium binding is unconfirmed on a device.** If it fails there, only
  `src/crypto/`'s internals change, because the flows depend on its interface — the reason to hold that
  interface narrow.

## Settled while building (2026-09-14)
- **A reset request for a registered address takes longer** than one for an unknown address: it writes a token and
  sends an email. The response is identical, the timing is not. Accepted for now; doing that work after the response
  is the fix if it matters.
- **A wrap is re-wrapped under current parameters at a password change, not at every sign-in.** Replacing a wrap
  without a password change would need a route of its own, and in v1 no wrap cheaper than current can exist — the API
  refuses one. Task 017's criterion says "next password change".
- **A wrap that will not open does not stop a sign-in.** Training never waits on the privacy key; zones stay unavailable
  on that device.
- **An access token outlives a logout or a revoked session by up to 15 minutes** — it is a stateless JWT (04 §8). What
  signs a device out is its refresh token failing, and that is what the tests assert.
- **The three routes that send an email on request share a 10-per-15-minutes limit.** Under 04 §5's "everything else",
  anyone could have aimed 600 emails an hour at one inbox. 04 §5 now lists them.
- **No screen links to the password, email and session screens yet.** They are routes (`/account/…`) and the auth
  screens are reached through the session gate and the email links; a settings screen that lists them comes later.

## Found at the close (2026-09-14)
- **Per-IP limits count the socket's peer**, `request.client.host`. Behind a hosting platform's proxy that is the proxy,
  for every user at once. Open question 12 in PROJECT-STATUS, to settle before the first deploy.
- **Only one lost refresh response is forgiven.** A grace refresh retires the unused successor, so the same replaced
  token presented again inside the window is reuse. Added to [ADR-015](../decisions/ADR-015.md)'s accepted consequences.
- **Revoking a session can answer 404** when the session list is older than that device's last refresh: the list names
  each device's newest token, and a refresh retires it. Left as it is for now.
- **The retention purges are unscheduled**, so `rate_limit_buckets` gains a row per limited request until
  [task 019](019-account-deletion.md) adds the daily command.

## Measured on hardware (2026-09-18, [task 017](017-local-toolchain-device-spike.md))

The privacy-key criteria this task deferred to task 017 were run on a **Galaxy S21 FE** with real
`react-native-libsodium`.

- **The wrapping derivation — argon2id `m=64 MiB, t=3, p=1` — takes 177 ms**, and the screen stays
  live through it. This is the number [task 017](017-local-toolchain-device-spike.md)'s criterion
  asked to be written here.
- **It corrects an estimate that had become documentation.** `src/crypto/privacy-key.ts` asserted the
  derivation "holds the JavaScript thread for about a second on a mid-range phone". Nothing had ever
  timed it. The `setTimeout(0)` yield before each derivation stays regardless — 177 ms on this phone
  is a floor, not a typical value, and a genuinely mid-range device will be slower.
- Unchanged by this: the **API's** login hash is still to be tuned to ~250 ms against a real deploy
  target ([§ Scope](#scope)). That is a server measurement and a different machine; this number says
  nothing about it.
