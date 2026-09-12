# Task 003 — Authentication and Authorization

**Depends on:** 002 · **Blocks:** 006 (sync), 012, 014 · **Size:** L

> **Device checks (2026-09-12):** there is no physical device before [task 017](../tasks/017-local-toolchain-device-spike.md). The
> criteria that need one — the libsodium binding, offline sign-in, the privacy-key flows, the
> key-derivation timing — moved there; this task closes on what the API tests, Jest and lint prove.

> **Resized for multi-user.** Password reset and email verification moved here from "deferred"
> ([04 §2a](../04-security-and-auth.md)); they are v1 blockers now that users are not the author.

## Goal
A user can register, sign in on two devices, stay signed in for weeks offline, and cannot under
any circumstance read another user's rows.

The authorization half matters more than the authentication half. Login is a solved problem;
INV-15 is a discipline that has to be built into the shape of the code in this task, because
retrofitting it means auditing every query ever written.

## Scope

**API — [04 §2–4](../04-security-and-auth.md)**
- `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` ·
  `POST /auth/logout-all` · `GET /auth/me` · `PATCH /auth/me`
- **Account lifecycle, v1 ([04 §2a](../04-security-and-auth.md)):**
  `POST /auth/password-reset/request` · `POST /auth/password-reset/confirm` ·
  `POST /auth/email/verify` · `POST /auth/email/change` · `GET /auth/sessions` ·
  `DELETE /auth/sessions/{id}`
- Reset tokens: single-use, 30-minute expiry, stored hashed. Completing a reset **revokes every
  refresh token** on every device.
- The reset *request* endpoint returns an identical response whether or not the email exists —
  otherwise it is an account-enumeration oracle, the same trap as login (§ constant time below).
- Unverified users can log in and train; they cannot change their email or request an export.
  **Never hold training data hostage to verification.**
- Security notification emails: password changed, email changed, new device signed in.
- **Every email in the user's language** — templates in `en` and `pt-BR`, selected by
  `users.locale`, with strings from the shared catalog ([ADR-008](../decisions/ADR-008.md)).
  `locale` and `unit_system` are set at registration from the device and editable via
  `PATCH /auth/me`.
- argon2id hashing, tuned to ~250 ms on the deploy target, params recorded in the hash string.
  **Raising them raises the floor for the client's wrapping KDF too** ([ADR-007](../decisions/ADR-007.md)).
- Access JWT, 15 min, claims limited to `sub`/`jti`/`exp`/`iat`/`device_id` — no PII.
- Opaque refresh token, 60 days, stored SHA-256 hashed, **rotated on every use**, with
  `replaced_by` chain and **reuse detection** that revokes the whole device chain.
- Constant-time login regardless of whether the email exists (always run a dummy verify).
- Rate limits from [04 §5](../04-security-and-auth.md), keyed on IP *and* account.
- Breach-list check on registration, from a local offline set.

**Authorization scaffolding — the important part**
- `get_current_user` dependency; every non-auth router depends on it.
- A **base repository whose every method requires a `user_id` argument**, typed such that omitting
  it is a type error rather than a runtime bug.
- Per-transaction `SET LOCAL app.user_id` so RLS engages ([04 §4](../04-security-and-auth.md)), on a
  connection as `cyberathlete_app`. Login, refresh and token redemption find their row through the
  task-002 `SECURITY DEFINER` lookups, then set the scope — never through a role that skips RLS.
  Registration sets the scope to the new account's id before inserting it. A plain `SET` is banned: it
  outlives the transaction on a pooled connection ([ADR-011](../decisions/ADR-011.md)).
- **404, never 403**, for a row that exists but is not yours.

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
  built against `src/crypto/`'s interface and tested in Jest; confirming the candidate,
  `react-native-libsodium` (argon2id, XChaCha20-Poly1305, `randombytes`), in a development build is
  [task 017](../tasks/017-local-toolchain-device-spike.md)'s, before anything relies on it. The derivation must not freeze the screen.
- **On sign-in from a new device:** unwrap with the password just entered, before it leaves scope.
  There is exactly one moment when the plaintext password is available on the client; the flow has
  to use it or the key is unrecoverable.
- **On password change:** re-wrap the key. Do **not** re-encrypt zones.
- **On password reset:** the key is gone and so are the zones. The reset screen says so before the
  user commits ([04 §2a](../04-security-and-auth.md)).
- The server never sees the key or a zone, and stores only opaque columns. **It does see the
  password** — at registration, sign-in and password change — and
  [ADR-007 § Amendment](../decisions/ADR-007.md) records what that exposes. So the password is never
  logged, never sent to Sentry, and never held past the request.

**Mobile**
- Sign-in / register screens, session bootstrap on launch. **The flows live in `src/account/`**
  ([ADR-012](../decisions/ADR-012.md)): screens call it; it calls `src/sync/` for HTTP and `src/crypto/`
  for the privacy key. Screens import neither.
- Refresh token in `expo-secure-store`; access token **in memory only** — never SQLite, never
  `AsyncStorage`.
- Automatic refresh on 401 with a single-flight lock, so ten parallel requests trigger one refresh.
- **Offline sign-in:** a user who has signed in before and whose refresh token has not expired
  must reach the app with no network. Auth is not on the path to using the app (NFR-1). This is
  the requirement most easily got wrong, and it makes the app unusable at the gym if missed.

## Acceptance criteria
- [ ] Register → login → refresh → access a protected route, on two devices simultaneously
- [ ] Replaying an already-used refresh token revokes that device's whole chain
- [ ] Logout on device A leaves device B signed in; logout-all signs both out
- [ ] `GET /workouts/{id}` for another user's workout returns **404**
- [ ] With RLS on, a deliberately unscoped repository query returns 0 rows rather than data —
      write this test, prove the second line of defence works
- [ ] Login attempts for an existing and a non-existent email differ by < 20 ms across 100 runs
- [ ] Rate limit returns 429 with `Retry-After` after 10 failed logins
- [ ] A password reset completes, and **every other device is signed out**
- [ ] A used reset token is rejected; an expired one is rejected
- [ ] Reset-request responses are identical for a registered and an unregistered email
- [ ] An unverified user can log in and log a workout, but cannot request a data export
- [ ] The session list shows both devices and revoking one signs only that one out
- [ ] The client wrapping-KDF constants are at least the server's login-hash memory and iterations; a
      test fails if either side changes so the client falls below ([ADR-007](../decisions/ADR-007.md))
- [ ] Only `src/crypto/` imports the crypto library or reads the privacy key from secure storage —
      enforced by lint
- [ ] No route or feature imports `src/sync/` or `src/crypto/`; sign-in, registration and password
      change reach both only through `src/account/` — enforced by lint
      ([ADR-012](../decisions/ADR-012.md))

## Notes and risks
- Password reset is the flow attackers probe first. The enumeration-safe response and the
  revoke-all-on-reset behaviour are the two things most often got wrong.
- Reset and verification both need working transactional email
  ([05 §5](../05-integrations.md)) — no longer optional infrastructure.
- The single-flight refresh lock is the classic source of a token-refresh stampede that revokes
  the user's own session through reuse detection. Test it with concurrent requests specifically.
- The privacy key is the one piece of this task whose omission is invisible until
  [task 007](007-cardio-recording.md) needs it, and expensive by then — every existing account
  would have no key and no password to derive one from. Build it now even though nothing encrypts
  anything yet.
- **Until task 017, the libsodium binding is unconfirmed on a device.** If it fails there, only
  `src/crypto/`'s internals change, because the flows depend on its interface — the reason to hold that
  interface narrow.
