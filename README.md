# Reconnect

**Bridging the Talent Gap — Where Builders Connect & Form Winning Teams.**

A Vite/vanilla-JavaScript frontend and Express/Mongoose API. Accounts, published profiles, invitations, notifications, team listings, and saved teams are persisted in MongoDB. There is no runtime mock data, demo identity, browser-only profile store, or in-memory database fallback.

## Start the application

Requires Node.js 22+ and MongoDB configured as a replica set (Atlas is supported). Invitation/notification updates and profile deletion/team closure use transactions.

```sh
npm --prefix backend install
npm --prefix frontend install
npm run backend:dev
# In another terminal:
npm run frontend:dev
```

Open http://localhost:5173. The default API port is 5000. Restart any previously running API after upgrading: an old Node process does not automatically load new routes unless it is running under nodemon.

For an isolated preview, set `PORT=5001` for the API and `API_PROXY_TARGET=http://localhost:5001` for Vite, then launch Vite with `--port 5174`. The preview prepared during development uses this arrangement without replacing the pre-existing port-5000 process. Include any preview origin you use in Google's authorized JavaScript origins.

For production, run `npm run frontend:build` and `npm run backend:start`. Express serves `frontend/dist`, the public profile routes, and the other application routes from the same origin. Configure HTTPS and the production origin. The root `index.html` and `code.html` are informational launch pages, not separate application builds.

## Configuration

Copy `backend/.env.example` to `backend/.env` only if the latter does not already exist. Preserve existing credentials and database names. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Replica-set URI or Atlas connection string |
| `JWT_SECRET` | Random secret of at least 32 characters |
| `PORT` | API port, default 5000 |
| `FRONTEND_ORIGIN` | Allowed browser origin, default http://localhost:5173 |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID; configure authorized JavaScript origins |
| `GEMINI_API_KEY` | Server-only Gemini credential |
| `GEMINI_MODEL` | Model available to the account; defaults to `gemini-flash-latest` |
| `SMTP_HOST`, `SMTP_PORT` | Authenticated mail provider; default port 587 |
| `SMTP_SECURE` | `true` for implicit TLS; port 465 also enables it |
| `SMTP_USER`, `SMTP_PASS` | Mail provider credentials |
| `SMTP_FROM` | Authorized sender, e.g. `Reconnect <noreply@your-domain.com>` |
| `PUBLIC_GITHUB_URL` | Confirmed official GitHub destination |
| `PUBLIC_LINKEDIN_URL` | Confirmed official LinkedIn destination |
| `PUBLIC_TWITTER_URL` | Confirmed official X/Twitter destination |
| `PUBLIC_DISCORD_URL` | Confirmed official Discord invite |

SMTP requires TLS; codes are not printed to the console or returned in API responses. If email is not configured, recovery returns an explicit error. Missing official social URLs lead to clear informational pages rather than invented external destinations. Only public client ID and official links are returned by `/api/config`.

At verification, MongoDB and Google configuration were present. Gemini was still a placeholder; SMTP and official social destinations were not configured. No real email or Gemini request was sent during tests.

## Features

- Reconnect identity, 80px sticky header, high-contrast navigation, active indicators, responsive menu, expandable search with Ctrl/Cmd+K, account dropdown, and complete five-column site map footer.
- White default theme and deep-slate dark theme with 300ms transitions; reduced-motion preferences are respected. Theme choice persists in `reconnect_theme`. Canvas hands remain interactive and sit below the hero text.
- One auth modal for Google, email sign-in/registration, and password recovery. Header has distinct Sign In and Join Reconnect buttons that open the same modal.
- Profile create/read/update/delete, public `/profile/:id` pages, categorized skills and optional self-assessed proficiency, education, multiline about text, projects, interests, document links, event domains, collaboration roles, and mentoring opt-in.
- Empty optional sections are omitted for visitors. Owners get actionable edit prompts. Existing legacy string skills are read without inventing proficiency claims.
- Directory filters by search, skill, college, and availability. Project showcase, college hubs, opt-in mentors, and upcoming calendar entries all use actual published records. Calendar dates are supplied by team owners; this is not an external event feed.
- Team creation/editing/deletion, open/closed recruitment, optional event date/link, and per-account saved teams. Team connections remain invitations between builders; acceptance does not automatically allocate a team slot. Owners maintain slot counts.
- Atomic invitation and notification creation, recipient-only accept/decline, unread badges, and contact email sharing only after acceptance. Declined connections cannot currently be resent.
- Gemini complementarity matching against up to 100 recent available builders. Only real eligible candidate IDs are accepted from the provider, duplicate or invented IDs are discarded, and provider failures are not disguised as successful matches.
- Visible pages and notifications refresh every 15 seconds; health refreshes every 30 seconds. These are polling updates, not WebSocket push or email notifications.

## Identity, persistence, and upgrades

- Passwords use bcrypt with 12 rounds; passwords are limited to 72 UTF-8 bytes to prevent silent truncation. Emails are normalized and uniquely indexed. Google subject IDs have a sparse unique index so multiple local accounts can coexist.
- Google tokens are verified with the configured audience. A Google account is not automatically merged into an existing local account just because its email matches; the existing account can sign in or prove email ownership using password recovery.
- HS256 session JWTs contain `userId`, `email`, `authProvider`, and a session version, with issuer `reconnect`, audience `reconnect-web`, and eight-hour expiry. The browser stores them under `reconnect_token` in localStorage and attaches Bearer authorization. Old-brand sessions are intentionally invalidated by the issuer/key change; sign in again.
- Logging out or completing password recovery increments the account's session version and invalidates existing tokens. Cross-tab session changes are synchronized. Use HTTPS and keep untrusted HTML out of the page because localStorage tokens are readable by same-origin JavaScript.
- Six-digit reset codes use cryptographic randomness, keyed hashing at rest, a ten-minute expiry, a one-minute resend cooldown, five reserved verification attempts, atomic single-use consumption, and endpoint rate limits. SMTP failure clears the unusable code. Tests inject a mail transport; production always uses Nodemailer.
- Startup replaces only a legacy non-sparse Google-ID index and ensures required indexes, including unique email. It does not delete user data. Duplicate historical emails must be resolved by the operator before the unique index can be created. The existing database name is not renamed by rebranding.
- Legacy profile fields remain readable; old `candidates`/`groups` demo collections are not used, migrated, or deleted. User content is never fabricated. Deleting a profile removes the public profile and closes owned team listings but keeps the account and connection history.
- The status badge is based on a live database ping plus integration configuration. It reports limited services while integrations are missing. External provider uptime is not independently probed; the status page explicitly explains this distinction.
- Resource and policy pages describe the implemented service. Before a public launch, the platform operator should review them, supply official social destinations, and configure the actual mail and AI providers.

## API reference

The application includes `/resources/api` and `/resources/faq`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/config`, `/api/health` | Public configuration / live database and integration status |
| POST | `/api/auth/register` | `{ fullName, email, password }` |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/google` | `{ credential }` from Google Identity Services |
| POST | `/api/auth/forgot-password` | `{ email }` |
| POST | `/api/auth/verify-otp-reset` or `/api/auth/reset-password` | `{ email, otp, password }` |
| GET / POST | `/api/auth/me` / `/api/auth/logout` | Current account / revoke sessions |
| GET | `/api/profiles` | `search`, `skill`, `college`, `available=true|false` filters |
| GET | `/api/profiles/me`, `/api/profiles/:id` | Owned profile / public profile |
| POST | `/api/profiles` | Create or replace owned profile |
| PUT / DELETE | `/api/profiles/:id` | Owner-only replacement / deletion |
| GET | `/api/projects`, `/api/colleges`, `/api/mentors` | Live community views |
| GET | `/api/teams`, `/api/teams/me`, `/api/teams/saved` | Active / owned / saved teams |
| POST | `/api/teams` | Create owned listing |
| PUT / DELETE | `/api/teams/:id` | Edit / delete owned listing |
| POST / DELETE | `/api/teams/:id/save` | Save / unsave for current account |
| GET / POST | `/api/invitations` | Own invitations / send `{ receiverId }` |
| GET | `/api/notifications` | Recipient-only notifications |
| POST | `/api/notifications/read` | Mark owned `{ ids: [] }` read |
| POST | `/api/notifications/:id/respond` | `{ action: "accept" or "decline" }` |
| GET | `/api/connections` | Accepted counterpart contact details |
| POST | `/api/match` | Match against the authenticated user's persisted profile |

Protected routes require `Authorization: Bearer <token>`. Ownership comes from the verified session, never supplied user IDs. URLs, nested records, counts, lengths, statuses, dates, emails, passwords, and OTPs are validated. Rendered user content is escaped.

## Verification

```sh
npm --prefix backend test
npm --prefix frontend test
npm run frontend:build
```

Backend tests start disposable real MongoDB replica sets. First use downloads MongoDB. Google, Gemini, and email transports are test doubles; fixture accounts never enter the application database. Coverage includes identity rejection, unique accounts, hashing, expired sessions, OTP expiry/replay/attempt cap, password-reset session revocation, profile ownership and validation, legacy skills, filter queries, duplicate invitation races, recipient-only responses, accepted-contact privacy, team ownership/closure, saved-team isolation, project showcase, and outage handling.

Frontend tests check conditional sections, stored-text/link safety, and invitation rendering. Browser review covered both themes, persistence across reload, authentication mode navigation, the actual existing public profile, project empty state, footer, live status, and 390px navigation with an 80px header and no horizontal overflow. Authenticated profile editing, real email delivery, and real Gemini responses still require a manual run with configured provider credentials.


### Community rooms, messages, and team invitations

Community cards open member-only chat rooms. Joined members can add builders; only the creator can remove members, and the creator cannot be removed. Room attachments are re-encoded locally to JPEG at up to 800 × 800 pixels. Group and direct-message feeds poll every six seconds while the page is visible and show the latest 200 messages; older messages remain stored.

Direct messages are available only between accepted connections. An optional connection-request note is stored atomically with the request and becomes the opening direct message after acceptance. Opening a conversation marks its loaded incoming messages read.

Team creators can filter accepted connections by name, headline, or skill. Invitations selected during creation are sent after the team saves. Existing teams expose the same picker through **Edit / Invite Connections**. Recipients accept or decline in Notifications; acceptance atomically adds membership and consumes an open slot. Repeat acceptance does not duplicate membership.

New authenticated endpoints:
- `GET /api/communities/:id` — populated member/admin details (members only).
- `GET|POST /api/communities/:id/messages` — chronological group feed and text/image posting.
- `POST /api/communities/:id/add-member` — add an existing user as a member.
- `DELETE /api/communities/:id/members/:memberId` — creator-only removal.
- `GET /api/messages/conversations` — accepted connections, message previews, unread counts.
- `GET|POST /api/messages/:otherUserId` — accepted-connection message history and sending.
- `GET /api/teams/:id/invites` and `POST /api/teams/:id/invite` — creator-only invitations.
- `POST /api/team-invitations/:id/respond` — recipient-only acceptance or decline.

Restart the backend after upgrading so startup creates the message and team-notification indexes. Email authentication works even when Google OAuth is not configured.
