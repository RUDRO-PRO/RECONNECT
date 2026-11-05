# TalentBridge / Kindred

A Google-authenticated builder directory with MongoDB profiles, team invitations, notifications, accepted connections, and Gemini complementarity matching. The application never seeds profiles or falls back to browser/in-memory records. A failed API request displays an error; an empty database displays an empty directory.

## Run locally

Requires Node.js 22+ and a MongoDB replica set (MongoDB Atlas works). Transactions atomically persist invitations and notifications; a standalone MongoDB instance is not supported.

1. Install dependencies: `npm --prefix backend install` and `npm --prefix frontend install`.
2. Copy `backend/.env.example` to `backend/.env` if it does not exist. Configure:
   - `MONGODB_URI`: your Atlas connection string or local replica-set URI.
   - `GOOGLE_CLIENT_ID`: Google OAuth web client ID. Add `http://localhost:5173` to its authorized JavaScript origins (also add `http://127.0.0.1:5173` if using that URL).
   - `JWT_SECRET`: a random secret of at least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   - `GEMINI_API_KEY`: server-only Gemini API key.
   - `GEMINI_MODEL`: defaults to `gemini-flash-latest`; choose a model available to your account.
   - `FRONTEND_ORIGIN`: defaults to `http://localhost:5173`.
   - `PORT`: defaults to 5000; keep Vite's proxy target in sync if changed.
3. In separate terminals run `npm run backend:dev` and `npm run frontend:dev`.
4. Open http://localhost:5173. Sign in using the one Google button, publish a profile, and invite another registered builder.

The checked-out `.env` initially had placeholder service credentials. A JWT secret has been generated locally; service credentials must still be supplied. Never commit `.env`.

Production: `npm run frontend:build`, then `npm run backend:start`. Express serves `frontend/dist` and `/api` from one origin. Configure HTTPS, the actual `FRONTEND_ORIGIN`, and the production Google authorized origin. Do not deploy the root `index.html` or `code.html`; these are informational launch pages replacing obsolete demo copies.

## Behavior and security

- Google ID tokens are verified with Google's library and the configured audience. No supplied email, decoded-only token, password login, or development identity bypass is accepted. Verified Google subject IDs identify accounts.
- Sessions are signed HS256 JWTs with issuer, audience, and an eight-hour expiration. The browser keeps its token in tab-scoped `sessionStorage`; sign-out removes it. A copied token remains valid until expiry, so use HTTPS.
- A user has one profile. The API derives ownership from the JWT and validates field lengths, skills, availability, and HTTP(S) links. Profile descriptions are self-reported proof of work; the service does not verify repository achievements.
- Invitations require two published profiles. A unique unordered pair prevents duplicates and opposite-direction races. Declined invitations remain visible and cannot be resent in this version.
- Only the recipient can accept or decline. Notifications are polled every 15 seconds while the page is visible, refreshed on focus, and marked read when opened. This is polling, not WebSocket push or email delivery.
- Both builders can see one another's account email through `/api/connections` only after acceptance. Public profiles and notification sender objects exclude email.
- Gemini receives role tags and skills, plus opaque profile IDs, from up to 100 recent available candidates. It does not receive account emails. Only supplied candidate IDs can be returned. No candidates produces an empty result without calling Gemini; provider/configuration failures produce an explicit error. Previously invited builders are excluded.
- The native profile dialog traps focus and supports Escape; canvas layers cannot intercept inputs. Tags wrap and toasts are capped at 320 × 48 pixels.
- Legacy `candidates` and `groups` collections are not queried. No existing database data is deleted or automatically migrated. Legacy seeded documents therefore never appear in the new directory; users should publish their new profile after Google sign-in.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/config` | Public Google client ID only |
| GET | `/api/health` | Database connectivity |
| POST | `/api/auth/google` | Verify `{ credential }`, provision account, return `{ token, user }` |
| GET | `/api/auth/me` | Current user |
| GET | `/api/profiles?search=` | Public directory |
| GET | `/api/profiles/me` | Current user's profile |
| POST | `/api/profiles` | Create/update owned profile |
| GET / POST | `/api/invitations` | List own invitations / send `{ receiverId }` |
| GET | `/api/notifications` | Recipient's notifications |
| POST | `/api/notifications/read` | Mark owned `{ ids: [] }` as read |
| POST | `/api/notifications/:id/respond` | `{ action: "accept" \| "decline" }` |
| GET | `/api/connections` | Accepted counterpart contact details |
| POST | `/api/match` | Complementary registered builders |

Protected routes require `Authorization: Bearer <token>`. Profile body: `fullName`, `roleTag`, `skills` (array), `proofOfWork`, `availabilityStatus`, `githubUrl`, `portfolioUrl`.

## Verification

`npm --prefix backend test` launches a disposable real MongoDB replica set using `mongodb-memory-server`. Its first run downloads MongoDB and requires network access. Test fixtures exist only in the disposable test database; they are never application seed data. The tests replace Google's external verifier and Gemini responses with test doubles, so no provider credentials are needed. They cover empty state, forged/missing/expired credentials, account upsert, profile ownership and validation, escaped search, duplicate/reverse invitations, unread notifications, recipient-only responses, acceptance/decline, private contact access, AI result ID filtering, provider failure, availability filtering, and database outage behavior.

`npm run frontend:build` checks the production bundle. Real Google browser sign-in and real Gemini output must additionally be exercised with configured credentials. Manual UI check: open Create Profile, click/type in every field, close/reopen to retain an unpublished draft, sign in, publish, then use two accounts to send and accept an invitation. Verify wrapping at narrow screen widths and that an offline API shows an error rather than an empty directory.
