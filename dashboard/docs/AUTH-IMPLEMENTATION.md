# AUTH-IMPLEMENTATION.md

## Session model (unchanged and kept)
HttpOnly cookie `pl_session` carrying a JWT. **No auth token is stored in localStorage, sessionStorage or Zustand persisted storage**, and there is no Bearer authentication. Session state in the admin lives in React Query.

## Admin login UI
Matches the supplied Stitch design: dark brand panel on the left, light auth card on the right; reduced panel on tablet and a compact top bar on mobile. No fake status text (no invented backend status, IP, TLS version, health or app version).

| Flow | Backend | Notes |
|---|---|---|
| Sign in | `POST /auth/login {identifier, password, rememberMe}` | email or phone; show/hide password; generic errors |
| Remember me | optional `rememberMe` | omitted = existing 7-day cookie (unchanged); `true` = 30 days (`REMEMBER_ME_DAYS`); `false` = browser-session cookie, 1-day JWT. Checked by default in the admin UI |
| Forgot password | `POST /auth/forgot-password {identifier}` | non-enumerating confirmation |
| Reset password | `POST /auth/reset-password {token, password}` | token read from the link then removed from the URL; 8-72 character rule mirrored in the UI; invalid/expired token handled |
| Session expiry | 401 on any call | session cleared, "session expired" notice shown on the login page |
| Customer account on admin login | role check | refused: "This account doesn't have dashboard access." |

Reset links for non-customer accounts use `ADMIN_PASSWORD_RESET_URL` (server configuration only; never taken from the request).

## Registration and roles (UPDATED - supersedes the earlier "customers only" design)

**Decision (by the project owner):** each frontend sends its own role automatically.
- **Customer Website** registers with `role: "customer"` (the website's API layer forces it; no role input).
- **Admin Dashboard** registers with `role: "admin"` (fixed in the Register form; no role input), in the same Login/Register card as before.
- The backend accepts **only** `customer` or `admin` in `POST /auth/register` (Zod enum built from the `ROLES` constants). `staff`, `owner`, other casing/types and any extra field (`permissions`, ...) are rejected with 422. An omitted role means `customer` (backwards compatible). `staff` is deliberately not self-registrable.

### Maximum one admin (enforced in the backend and MongoDB)
1. `auth.service.register` pre-checks `User.exists({ role: 'admin' })` and answers **409 `ADMIN_ALREADY_EXISTS`**: "An admin account already exists. Additional admin registration is not allowed."
2. The pre-check alone is not race-safe, so `models/User.js` declares a **unique partial index** `unique_single_admin` on `{ role: 1 }` with `partialFilterExpression: { role: 'admin' }`. Only admin documents are indexed, so customers and staff are never limited.
3. A MongoDB duplicate-key error (E11000) on that index, or on email/phone, is converted to a clean **409** (`ADMIN_ALREADY_EXISTS` / `ACCOUNT_EXISTS`), never a 500.
4. `scripts/create-admin.js` also refuses to create a second, different admin.
5. The first admin gets no customer number (an admin is not a customer). Passwords are bcrypt-hashed; responses never include `passwordHash`/`tokenVersion`.

Existing users are never deleted or modified by any of this.

### Applying and verifying the index in MongoDB
`autoIndex` is off in production, so run once per environment:
```bash
npm run ensure-admin-index      # counts admins, builds the index, reads it back and verifies it
```
It first lists existing admins; with **more than one** it stops without changing anything (you must demote the extras yourself; the unique index cannot be built over duplicates). `npm run sync-indexes` also builds it.
Manual checks in `mongosh`:
```js
db.users.countDocuments({ role: "admin" })     // must be 0 or 1 before building the index
db.users.getIndexes()                           // look for name "unique_single_admin"
// expected: { key: { role: 1 }, name: "unique_single_admin", unique: true, partialFilterExpression: { role: "admin" } }
db.users.createIndex({ role: 1 }, { name: "unique_single_admin", unique: true, partialFilterExpression: { role: "admin" } })
```
**Not verified in this delivery:** the index was verified only as a schema declaration and through an in-memory fake that enforces the same rule (no MongoDB was reachable). Run `npm run ensure-admin-index` against your database to confirm it actually exists.

### Example requests
```http
POST /api/v1/auth/register   {"name":"Owner One","email":"owner@pehanly.pk","phone":"03001234567","password":"Correct-horse-1","role":"admin"}
201 {"success":true,"message":"Account created","data":{"user":{"_id":"...","role":"admin","email":"owner@pehanly.pk", ...}}}   + Set-Cookie: pl_session=...; HttpOnly; SameSite=Lax

POST /api/v1/auth/register   (second admin, any email/phone)
409 {"success":false,"message":"An admin account already exists. Additional admin registration is not allowed.","code":"ADMIN_ALREADY_EXISTS"}

POST /api/v1/auth/register   {... "role":"staff"}
422 {"success":false,"message":"Validation failed","code":"VALIDATION_ERROR","errors":[{"field":"role","message":"Role must be one of: customer, admin"}]}
```

### SECURITY LIMITATIONS - read this
This design was requested as specified and is documented honestly:
- **A role sent by the browser does not authenticate anyone.** Anyone who can reach `POST /auth/register` can send `"role":"admin"` with a hand-made request (curl, Postman, DevTools). The frontends sending `admin` automatically adds no protection.
- **First-admin takeover is NOT prevented.** Whoever registers first as admin owns the system. On a deployed, internet-facing API that can be an attacker who gets there before the real owner. The one-admin limit only stops a *second* admin; it does not verify *who* the first one is.
- **Forged API requests are NOT blocked** by the role field or by the origin check (the origin check is browser CSRF defence, not authentication).
- Nothing in this design (no setup token, no secret, no email verification) proves the first admin is the legitimate owner, and none was added without being requested.
- Practical consequences: create the first admin yourself immediately after deploying (before the API is publicly reachable), or use `npm run create-admin` on the server; do not expose a fresh database with an unclaimed admin slot to the internet.
- Staff RBAC permissions are unchanged. Backend authorization stays authoritative: customers get 403 on admin endpoints.

## Staff setup / invite
**Not supported - BLOCKED - BACKEND CONTRACT MISSING.** The backend has no invite or activation flow, so no staff-setup UI was built.

## Customer authentication
Customer registration, login, forgot/reset password and the account area on the website are unchanged and still use the same backend endpoints.

## Not live-verified
Login, Remember Me cookie lifetimes, and reset emails were verified with unit tests and a mocked-API browser run. They were **not** verified against a running backend, MongoDB, or a real mail provider.
