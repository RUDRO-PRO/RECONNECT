# Reconnect production scalability audit

Audit date: 8 November 2026 (Asia/Kolkata). Target: 300 registered users, up to 50 simultaneously active users, Vercel Hobby and Atlas Free/M0.

## Result and scope

Applied the request, polling, query, payload, indexing, serverless and build changes below. Reviewed all 31 files in `frontend/src/`, `backend/routes/`, `backend/models/`, plus `backend/server.js`, `api/index.js`, and `vercel.json`. The full file inventory, hashes and dispositions are in `scripts/audit-inventory.json`.

The **local 50-user test passed with 0% errors**. It is a short warm-process burst test against a disposable local MongoDB replica set. It does **not** establish a production uptime guarantee, sustained Atlas M0 capacity, or a monthly Hobby quota guarantee. No production database, deployment, SMTP service or external AI provider was load-tested or modified.

## Bottlenecks and applied fixes

| Bottleneck found | Applied change | Effect / practical limit |
| --- | --- | --- |
| GETs only coalesced while in flight; repeated reads immediately fetched again | Shared session-scoped API client, canonical query keys, 20-second TTL, maximum 100 cache entries | Identical pending calls reuse the Promise; errors are not cached; chat cursors bypass TTL |
| Mutations could race older reads | Invalidate before writes and again after successful writes; generation checks prevent stale cache fills | Conservatively clears all session read entries, including dependent social/profile state |
| Five recurring network timers plus visibility refresh handlers | One adaptive poller | One active direct/team/community conversation every 3 seconds, otherwise one `/social/sync` every 45 seconds; no polling hidden/offline; no overlapping ticks; bounded failure backoff |
| Directory, content, public-profile and health refreshes ran even without user action | Removed periodic public-page/health requests | Refresh through navigation/user actions and the TTL cache; initial health remains available |
| Team chat downloaded full workspace, members and gallery repeatedly | Dedicated `/teams/:teamId/messages` cursor route | Full metadata on open or non-chat workspace refresh; gallery bytes fetched only when gallery/preview is opened |
| Message histories grew without bound in responses | Maximum 30 records per request; page/limit and timestamp plus ObjectId cursors | Empty incremental response is `[]`; earlier messages remain accessible via UI controls; ties do not skip messages |
| Discovery/community lists had no pagination | 30-item cap, validated pages, UI pagination | Also bounded projects/mentors/colleges/teams/conversations/notifications; personal lists are capped at 300 and invitation state at 600 for this 300-user target |
| Per-keystroke/local filtering and overlapping searches | All network searches and skill/college/team filters use 300ms debounce; local DM/invite filters debounced | Explicit form submission can still request immediately |
| Avatars/screenshots accepted hundreds of KB to over 1 MB | Canvas maximum dimension 720px, JPEG quality 0.75, iterative resize to <120,000 encoded characters | Stronger than a 120KB binary JPEG target; server enforces the encoded ceiling and a 256KB JSON body limit; old avatars are recompressed on next owner edit |
| Inline avatars copied into lists/messages and fetched from Mongo repeatedly | Small user thumbnail references, publicly cached avatar endpoint, omit senderAvatar from new team messages | Existing historical image bytes are not destructively rewritten; browser/CDN cache image requests |
| Conversation summary used two queries per contact | Indexed latest-message aggregation and one unread-count aggregation | Query count no longer grows by two per contact; measured latest-message plan uses DISTINCT_SCAN |
| Case-insensitive discovery regexes searched many fields | Materialized normalized prefix tokens, normalized skill keys and college prefix field with indexes | Search now means word-prefix search; skill filter is case-insensitive exact matching. Explicit backfill is required for old records |
| Missing sort/filter compound indexes | Added conversation, recipient/read/time, invitation sender/receiver/status, community, profile and team indexes | Verified discovery and prefix search examine 30 documents to return 30. Not a claim that every possible query has zero scans |
| Unnecessary Mongoose hydration and broad read fields | Lean/native POJO reads and allowlisted identity/contact projections; model credentials remain select:false | Actual sensitive field names include password/resetOtp, not just hypothetical passwordHash/resetOtpHash; aggregate/native reads also project safely |
| Per-request health ping | 20-second bounded process cache with in-flight coalescing | CDN cache-control on successful anonymous health/discovery: public, s-maxage=20, stale-while-revalidate=40; authenticated/private responses remain no-store |
| Incomplete pool timeouts; cold starts ran migrations/index creation | Shared connect promise; maxPoolSize 5, minPoolSize 1, selection timeout 5s, socket timeout 20s, queue timeout 5s, idle timeout 60s, buffering off | Connection pools are reused within a warm instance; schema work moved to explicit deployment initialization |
| Failed database starts could stampede retries | Two-second failure backoff in serverless adapter | Public config and OPTIONS remain before the DB gate |
| `/auth/me` consumed the authentication mutation quota | Exempt GETs; auth mutation quota keyed by IP plus hashed normalized email; coarse read/write IP limits separated | Avoids rejecting a shared-campus cohort merely for checking sessions; per-instance rate limits remain best-effort, not distributed quotas |
| Cold app creation generated a bcrypt cost-12 dummy password | Fixed valid-format dummy hash | Keeps unknown-account password comparison work while removing redundant startup CPU |
| Passive community recommendations could call AI; explicit matching could fan out for many seconds | Local community ranking, 5/min/user matching guard, 60-second result cache/coalescing, max two active provider match jobs per instance, 2.5s/provider timeout and local fallback | Actual external model throughput/cost not measured; caches and concurrency limits are per instance |
| Canvas rendered continuously | Hidden-tab pause, skip offscreen paint, ~30fps render cap | UI-only countdown, Google readiness check, debounce and one-shot session retry timers remain; they do not poll the API |
| Build reinstalled dependencies during the build stage | Vercel uses lockfile-based install separately from `frontend` build; immutable hashed `/assets/` caching | Retained function exclusions and 60s maximum duration; no deployment performed |

## 50-concurrent-user benchmark

Fixture: **300 users/profiles, 500 accepted connections, 5,000 direct messages, 45 communities, 35 teams**. Fifty distinct valid JWT sessions, five rounds each. Each virtual user fires the four requested endpoints in parallel: up to **200 HTTP requests in flight**, a stronger burst than 50 single outstanding requests. Rate limits and authentication stay enabled. One warm-up request per endpoint is excluded from latency samples.

| Endpoint | Requests | p50 ms | p95 ms | Errors |
| --- | ---: | ---: | ---: | ---: |
| `/api/health` | 250 | 10.04 | 163.27 | 0 |
| `/api/profiles` | 250 | 10.83 | 163.89 | 0 |
| `/api/auth/me` | 250 | 117.46 | 237.70 | 0 |
| `/api/messages/conversations` | 250 | 335.60 | 507.79 | 0 |

Overall: **1,000 measured requests**, **0% errors**, **p50 98.36 ms**, **p95 376.59 ms**. Test duration 1.79s, local throughput 558.66 requests/s. These throughput numbers exceed M0's published throughput ceiling and must not be presented as Atlas capacity.

The separate client-cache probe made 200 logical calls from 50 independent clients: **50 network calls, 100 in-flight reuses, 50 TTL hits** (75% fewer requests). No tokens are saved in the report. The server cache logged 550 hits and only two public-cache loads (one health ping and one discovery load); its warm-run coalescing count was zero. A separate unit test verifies 50 concurrent cache misses coalesce into one backend loader.

Database command counts across warm-up, benchmark and duplicate-call probe: 1 ping; 252 profile finds (251 are contact-profile lookups, one is discovery); 753 user finds; 251 invitation finds; 502 message aggregations. Query-plan checks: discovery and prefix search have no COLLSCAN and each examine 30 documents; conversation latest-message aggregation has no COLLSCAN and uses DISTINCT_SCAN. No additional pool connections were created during measurement; the seed/setup had already warmed the configured pool.

Raw measurements and environment: `scripts/load-test-results.json`. The script exits nonzero on HTTP, response-shape or timeout errors; missing/distinct auth sessions are required rather than treating unauthorized responses as successes.

## Verification

- `npm run build`: passed, zero build errors. Final JS bundle about 96.39 KB raw / 31.30 KB gzip; CSS 34.26 KB raw / 7.76 KB gzip.
- Backend regression suite: 19 tests, including pagination, same-timestamp cursor boundaries, private cache isolation, invalidation, lazy assets, OTP security and real MongoDB workflows.
- Frontend suite: 16 tests, including Promise/TTL behavior, hidden/offline/overlap scheduler behavior, optimistic chat and image compression.
- `npm run check:function`: passed; 974 traced files, approximately 6.57 MiB uncompressed, well inside the repository's 50 MiB budget.
- `git diff --check`: no whitespace errors.

The initial sandbox blocked local MongoDB/loopback access; integration tests and the benchmark were rerun successfully with that local access. This was an environment restriction, not a production application failure.

## Deployment and reproduction

Before releasing the indexed-search code against an existing database, run **`npm run db:initialize`** with the intended database environment. This creates indexes, backfills search/thumbnail fields and preserves legacy verification status. Run it once per schema rollout, outside Vercel request handling. It is idempotent, does not delete user records, and was exercised against disposable test data here. Production execution remains outstanding because this task requested local testing, not a live deployment.

Use `npm run test:load:local` to recreate the isolated fixture and run the benchmark. It uses the existing backend mongodb-memory-server dev dependency and deletes its temporary session file afterward; it does not connect to Atlas. The actual `scripts/load-test.mjs` client uses Node built-ins plus this repository's lightweight API helper, with no external package dependency.

To test an already running local backend, set `LOAD_TEST_TOKENS_FILE` to a private JSON array containing 50 distinct valid JWT strings and run `node scripts/load-test.mjs http://127.0.0.1:5000`. Optional settings: LOAD_TEST_USERS, LOAD_TEST_ROUNDS, LOAD_TEST_OUTPUT. Keep the token file outside version control.

Deploy the code only after initialization. Align the Vercel function region with the Atlas region in the deployment settings; no region was guessed from the developer's location. Follow with a real staging/Atlas soak test, including realistic idle/active duty cycles, login/OTP and upload bursts, and observe connection, storage, transfer and operation counters.

## Remaining production limits

1. **Activity duration matters more than registered users.** Fifty continuously active chats at one poll per 3 seconds generate about 60,000 function invocations/hour, before sends, navigation and uploads. Vercel Hobby currently includes 1,000,000 function invocations/month, so that chat-only pattern exhausts that allowance in roughly 16.7 hours/month. Fifty visible background sessions at 45s generate about 4,000 invocations/hour. A 300-account app is plausible with intermittent use; uninterrupted 50-user chat is not a free-tier promise. [Vercel Hobby limits](https://vercel.com/docs/plans/hobby)
2. **M0 is shared and throttled.** Atlas lists 500 connections, 0.5GB storage including indexes, 100 operations/second and 10GB in plus 10GB out per rolling seven days. The local test does not emulate those limits. Active empty chat polling is approximately three indexed DB operations per poll, around 50 operations/second at 50 users on average; simultaneous bursts, writes and uploads add to that. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
3. **maxPoolSize is not a fleet-wide cap.** Driver pools exist per server and add monitoring sockets. Reusing five pooled connections per process does not prove 50+ independently scaled instances can never hit Atlas's limit. The requested minPoolSize=1 also retains idle connections. Measure actual Atlas connection counts and avoid unnecessary regions/process fan-out. [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
4. **No indefinite image storage guarantee.** Compression bounds new writes, not total lifetime storage. Existing larger images are retained. Around 4,000 maximum-size encoded images alone approach 480MB. Long-lived/high-upload use requires object storage or a user-approved retention policy; no destructive message/photo TTL was added.
5. **Local caches/limiters are not distributed.** A different Vercel instance has a different memory cache/quota. Public CDN responses can remain stale for the configured window after writes; browser caches invalidate immediately. For stronger cross-instance revocation, quotas or cache consistency, use shared infrastructure.
6. **Some traversal is inherent.** Campus-count/project aggregates and explicit schema backfills traverse matching data/indexes; arbitrary filter combinations and future data distributions can select different query plans. The hot paths measured here avoid collection scans; an absolute claim of zero full scans across all queries would be inaccurate.
7. **Scope of verification.** No live Vercel/Atlas soak, cold-fleet burst, SMTP-delivery throughput, external AI quota or full browser visual test was run. Keep these as release checks rather than extrapolating from a 1.79-second local read burst.

## Every requested source file reviewed

| File | Disposition | Audit / fix |
| --- | --- | --- |
| `api/index.js` | Fixed | Inspected existing warm connection reuse; added brief connection-failure backoff to avoid reconnect storms. |
| `backend/models/Community.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/CommunityMessage.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/DirectMessage.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/Invitation.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/Notification.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/Profile.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/Team.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/models/TeamMessage.js` | Reviewed | Inspected: existing teamId/createdAt/_id compound index already supports cursor queries; unchanged. |
| `backend/models/User.js` | Fixed | Added query-aligned compound indexes; existing schema security/default constraints preserved. |
| `backend/routes/auth.js` | Fixed | Lean allowlisted identity reads; GETs exempt from mutation quota; per-IP/email keys; removed cold-start bcrypt generation. |
| `backend/routes/communities.js` | Fixed | Paged community list; indexed matching terms; local recommendations instead of passive paid/provider calls. |
| `backend/routes/profiles.js` | Fixed | Paged/projected discovery, indexed search, public cache, separate cached avatars, bounded secondary lists. |
| `backend/routes/social.js` | Fixed | Batched conversation aggregates; one social sync route; lean projections; bounded incremental chat and metadata. |
| `backend/routes/teamWorkspace.js` | Fixed | Lean membership projections; dedicated incremental messages; asset metadata only until authorized detail fetch. |
| `backend/server.js` | Fixed | Strict cached pool, cached health, explicit migrations, private defaults, bounded bodies and lists, AI concurrency/cache/timeout guards. |
| `frontend/src/apiClient.js` | Fixed | Session-scoped in-flight coalescing, 20s TTL, bounded entries and mutation invalidation. |
| `frontend/src/canvas.js` | Fixed | Pause hidden animation; skip offscreen painting; cap rendering near 30fps. |
| `frontend/src/communities.js` | Reviewed | Inspected: pure card/share rendering, no polling or network calls; unchanged. |
| `frontend/src/content.js` | Fixed | Updated session/pagination API documentation; dynamic content consumes paged API through main. |
| `frontend/src/main.js` | Fixed | Shared client and social sync; removed background directory/health refresh storms; paged UI; debounced filters. |
| `frontend/src/messages.js` | Fixed | Stable timestamp plus ID cursors; message reconciliation retained. |
| `frontend/src/photo.js` | Fixed | Canvas JPEG quality .75, max 720px; iterative resize to <120,000 encoded characters; legacy avatar recompression. |
| `frontend/src/poller.js` | Fixed | Single network scheduler: active chat 3s; background 45s; hidden/offline pause; failure backoff. |
| `frontend/src/readiness.js` | Reviewed | Inspected: explicit user-triggered profile/roster reads use shared API client; no network timer; unchanged. |
| `frontend/src/session.js` | Reviewed | Inspected: one bounded session retry; no recurring timer; shared API client handles deduplication; unchanged. |
| `frontend/src/social.js` | Fixed | Incremental direct/community chat; delegated scheduler; on-demand older history and conversation pages. |
| `frontend/src/style.css` | Fixed | Pagination control layout; existing responsive/dark-mode rules retained. |
| `frontend/src/teamWorkspace.js` | Fixed | Incremental team chat; no local polling timer; lazy private assets; history pagination. |
| `frontend/src/ui.js` | Fixed | Allow only validated same-origin avatar references alongside existing safe raster/HTTP URLs. |
| `vercel.json` | Fixed | Deterministic install/build steps and immutable hashed assets; narrow single-function routing/exclusions retained. |

## Supporting files added or updated

- `backend/tests/extended.test.js`
- `backend/tests/readCache.test.js`
- `backend/tests/scalability.test.js`
- `backend/utils/avatarRef.js`
- `backend/utils/pagination.js`
- `backend/utils/readCache.js`
- `backend/utils/searchFields.js`
- `backend/validation.js`
- `frontend/tests/messages.test.js`
- `frontend/tests/photo.test.js`
- `frontend/tests/poller.test.js`
- `frontend/tests/requests.test.js`
- `frontend/tests/teamWorkspace.test.js`
- `package.json`
- `scripts/initialize-database.cjs`
- `scripts/load-test-local.cjs`
- `scripts/load-test-results.json`
- `scripts/load-test.mjs`
- `scripts/audit-inventory.json` — machine-readable scope and hashes.
- `AUDIT_REPORT.md` — this report.
