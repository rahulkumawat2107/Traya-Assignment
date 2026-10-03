# Health Progress Tracker

A React Native app for tracking weight, steps, sleep, water and workouts. It is built offline-first: every change is saved to a local database first and synchronised with a (mocked) backend whenever a connection is available.

The assignment asks for engineering decisions over feature count, so the work goes deep on one vertical slice — **weight: manual add/edit/delete → local database → outbox → sync → conflict resolution → dashboard** — and keeps the other four metrics thin (imported, read-only).

## Contents

1. [Setup](#setup)
2. [What is implemented](#what-is-implemented)
3. [Architecture overview](#architecture-overview)
4. [Key technical decisions](#key-technical-decisions)
5. [State management](#state-management)
6. [Local persistence](#local-persistence)
7. [Health / device integration](#health--device-integration)
8. [Offline and synchronisation strategy](#offline-and-synchronisation-strategy)
9. [Conflict resolution](#conflict-resolution)
10. [Application lifecycle](#application-lifecycle)
11. [Performance](#performance)
12. [Loading, error and empty states](#loading-error-and-empty-states)
13. [Testing strategy](#testing-strategy)
14. [Trade-offs](#trade-offs)
15. [Known limitations](#known-limitations)
16. [What I would improve with more time](#what-i-would-improve-with-more-time)
17. [Assumptions](#assumptions)
18. [AI usage](#ai-usage)

---

## Setup

Requirements: Node ≥ 22.11 (`.nvmrc` pins 22.20), Xcode + CocoaPods for iOS, Android SDK + JDK 17 for Android. See the React Native [environment setup](https://reactnative.dev/docs/set-up-your-environment).

```bash
nvm use                       # Node 22
npm install

# iOS
bundle install
cd ios && bundle exec pod install && cd ..
npm run ios

# Android (emulator running or device attached)
npm run android

# Metro, if it is not started for you
npm start -- --reset-cache
```

If a Metro bundler from an earlier checkout is already running, restart it with `--reset-cache`; otherwise the `@/` import alias will not resolve.

Checks:

```bash
npm test            # Jest, 203 tests
npm run typecheck   # tsc --noEmit, strict
npm run lint        # ESLint
```

There is no backend to run. The mock server lives inside the app.

### A two-minute tour

1. **Today** tab: the app starts clean, every card at zero. Go to **Debug** → *Import dummy data*; back on Today the cards show today's values. Tap a card to see its 7-day / 30-day / 3-month summary.
2. **History** tab → *Add weight*. The row appears at once with a *Waiting to sync* badge, then turns *Synced*.
3. **Debug** tab → turn on *Simulate offline*. Add, edit and delete weights. The banner says the changes are saved on the device. Kill and reopen the app: they are still there, still pending. Turn offline off: they sync.
4. **Debug** → set *Failure rate* to 100%, add a weight, watch the outbox show attempts and the next retry time; set it back to 0% and tap *Sync now*.
5. **Debug** → *Edit from another device* changes your newest weight on the server with a newer timestamp; after the sync your device shows the other device's value.
6. **Debug** → *Seed 3 years of data*, then scroll History and switch ranges on the dashboard.

---

## What is implemented

| Area | Status |
|---|---|
| Weight: add, edit, delete, history | Implemented |
| Dashboard: a card per metric with today's value and goal progress, zero until there is data | Implemented |
| Dummy data: *Import dummy data* on the Debug screen runs the mock health providers through the integration layer | Implemented |
| User-facing screen for connecting health sources | Not implemented. Import is triggered from the Debug screen only; there is no Sources tab. |
| Metric detail: latest value, goal, 7 d / 30 d / 3 m summary | Implemented |
| Five metrics: weight (manual + imported); steps, sleep, water (shown as glasses), workout (imported) | Implemented |
| Calories | Not implemented (removed from scope). |
| Import from a health source (three mocked providers, different shapes and units) | Implemented |
| Local persistence, durable outbox, retry with backoff | Implemented |
| Sync: push + pull, idempotency keys, ordering by logical clock, tombstones | Implemented |
| Lifecycle: crash recovery, sync on foreground and on reconnect | Implemented |
| Mock API: latency, failures before/after the server acted, duplicates, reordering | Implemented |
| Loading / error / empty / partial / offline / provider-unavailable states | Implemented |
| Tests for the areas above | Implemented (203 tests) |
| Historical **charts** | Designed, not implemented (phase 2). The series query and hook exist and feed the range summary; only the chart component is missing. |
| Goal editing UI | Not implemented. Goals are seeded defaults; the repository supports setting them. |
| Discarding a change the server rejected | Partially implemented. Rejected changes are surfaced and can be retried; there is no "discard and revert" action. |
| OS-level background sync | Designed, not implemented |
| Authentication, multiple users, login from another device | Designed, not implemented. The sync protocol already supports several devices and is tested for it. |
| Real HealthKit / Health Connect adapter | Designed, not implemented. One interface to implement, one file to register it in. |
| Manual entry for metrics other than weight | Not implemented. The repository and form are metric-agnostic underneath; only weight has a form. |

**Next, in order:** charts; "discard" for rejected changes; a real Health Connect adapter; background sync; authentication with a per-user database.

---

## Architecture overview

Diagrams (component diagram and two sync sequence diagrams) are in [docs/architecture.md](docs/architecture.md).

```
UI (screens, components)
   │ read: TanStack Query            │ write: repositories
   ▼                                 ▼
Domain (pure TypeScript: HLC, conflict resolver, coalescing, stats, goals)
   ▼
Data (repositories → SQLite: measurements, outbox, sync_state, goals)
   ▲                    ▲                         ▲
Health import      Sync engine               Platform services
(providers →       (outbox drain, pull,      (NetInfo, AppState,
 normalizers)       backoff, single-flight)   Clock, UUID)
                        │ ApiClient interface
                        ▼
                   Mock server (idempotency, HLC ordering, change feed)
```

```
src/
  app/            composition root (bootstrap.ts), navigation, providers
  domain/         pure TypeScript, no React / React Native / SQLite imports
  data/           SqlDriver, schema + migrations, repositories, mappers
  sync/           SyncEngine, triggers
  api/            ApiClient interface, wire types + guards, mock server/client
  integrations/   health provider interface, normalizers, mock providers
  features/       dashboard, measurements, settings (debug)
  shared/         components, services (Clock, IdGenerator, NetworkMonitor), state, theme
  test/           in-memory database, fakes
```

Four rules hold the design together:

1. **SQLite is the single source of truth.** Screens read the database, never the network. Sync is a background concern that changes the database and invalidates queries.
2. **A local write is one transaction** containing the row *and* its outbox entry. If the app dies at any instant, either both exist or neither does.
3. **The domain layer is pure.** Ordering, conflict resolution, coalescing, backoff, goal and summary maths have no I/O, which is why most of the tests are fast unit tests.
4. **Everything external is behind an interface** — `ApiClient`, `HealthProvider`, `SqlDriver`, `Clock`, `IdGenerator`, `NetworkMonitor` — and wired in one file, [src/app/bootstrap.ts](src/app/bootstrap.ts). Replacing the mock backend or a mock provider with a real one touches that file (or [registry.ts](src/integrations/health/registry.ts)) and nothing else.

---

## Key technical decisions

| Concern | Choice | Why | Considered and rejected |
|---|---|---|---|
| Framework | React Native CLI 0.87, New Architecture, TypeScript strict | Direct control of the native projects | Expo — quicker to start, not wanted for this project |
| Local database | SQLite via `@op-engineering/op-sqlite`, hand-written SQL behind a small `SqlDriver` interface | Real transactions (row + outbox atomically), indexes, aggregation in SQL | AsyncStorage / MMKV — no transactions or queries. WatermelonDB / Realm — bring their own sync model, which would hide the logic this assignment is about. Drizzle — see below |
| Reading data | TanStack Query over repositories | Loading / error states, caching, explicit invalidation, infinite queries | Redux — boilerplate for what is a cache of local reads |
| UI state | Zustand | Selector subscriptions, tiny | Context — re-renders every consumer |
| Lists | `FlatList`, tuned | History is paginated; loaded rows stay in the hundreds | FlashList — worth it for much longer lists |
| Forms | `useState` + a pure validator | One small form; the validator is unit-tested on its own | react-hook-form + zod — more than this needs |
| Input validation at boundaries | Hand-written type guards | Provider payloads and API responses are untrusted and checked before they reach the database | zod |
| IDs | `uuid` v4 (+ `react-native-get-random-values`) | Client-generated ids are what make offline creates and idempotent retries possible | Server-assigned ids |
| Ordering | Hybrid logical clock | Device clocks are wrong or get changed; arrival order is meaningless offline | Wall-clock timestamps, server arrival order |
| Mock backend | In-app `MockServer` behind `ApiClient` | Deterministic in tests, controllable from the debug screen | MSW — needs polyfills in React Native for little gain |
| Navigation | React Navigation (native stack + bottom tabs) | Native transitions, typed params | — |
| Charts | Deferred | Out of scope for phase 1 | — |

### Things that changed during implementation

- **Drizzle was dropped after a spike.** The plan was Drizzle over op-sqlite. Reading its op-sqlite driver showed that `transaction()` issues `BEGIN`, calls the callback, and issues `COMMIT` without awaiting the callback's promise — so an async transaction is not atomic, which breaks rule 2 above. It was replaced by a ~60-line [`SqlDriver`](src/data/db/SqlDriver.ts) with explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`, a queue so unrelated queries cannot slip inside an open transaction, and tests for exactly those properties. Migrations are an ordered list tracked with `PRAGMA user_version`.
- **The test database is `better-sqlite3`**, not libsql: libsql's in-memory client does not keep a manual transaction on one connection. Repository and sync tests therefore run real SQL (window functions, upserts, partial unique indexes) in Node.
- **The `@/` import alias is resolved by Metro** (`resolveRequest` in `metro.config.js`), mirrored in `tsconfig.json` and `jest.config.js`. The Babel plugin approach did not resolve under Metro in this setup.

---

## State management

Three kinds of state, each with one owner:

| State | Owner | Notes |
|---|---|---|
| Health data, goals, outbox | SQLite | The only durable copy |
| What the screens show | TanStack Query | A cache of database reads. `staleTime: Infinity`, `networkMode: 'always'`; it is invalidated explicitly after a local write and after a sync run that changed something |
| Sync status, selected range | Zustand | Sync status is pushed by the engine; components select the fields they use |
| Form input | `useState` in the form | Typing re-renders the form only |

There is no global store of measurements. Keeping a second copy in memory is where offline apps usually drift out of step with their database.

---

## Local persistence

Schema ([src/data/db/schema.ts](src/data/db/schema.ts)):

- `measurements` — `id`, `user_id`, `metric`, `value` (canonical unit), `measured_at`, `source` (`manual` or `provider:<id>`), `external_id`, `hlc`, `deleted_at` (tombstone), `sync_status`.
- `outbox` — `op_id` (also the idempotency key), `entity_id`, `op_type`, `payload` (full record snapshot), `hlc`, `status` (`pending` / `in_flight` / `failed`), `attempts`, `next_attempt_at`, `last_error`.
- `sync_state` — pull cursor, device id, last sync time, last import per provider.
- `goals`.

Indexes: `(user_id, metric, measured_at DESC, id DESC)` serves both history paging and range scans; a partial unique index on `(source, external_id)` makes a provider record importable only once.

Deletes are soft: a tombstone has to travel to the server and to other devices like any other change.

---

## Health / device integration

```
HealthProvider (FitBand / Pulse Health / ScaleCo — mocked)
        ↓  raw records, provider-specific
Normalizer (one per provider, hand-written guards)
        ↓  NormalizedReading { metric, value, measuredAt, externalId }
HealthImportService
        ↓  MeasurementRepository.upsertImported()  ← same write path as manual entries
Application
```

The three mock providers describe the same underlying readings differently, as the brief suggests:

| Provider | Weight | Sleep | Timestamp |
|---|---|---|---|
| FitBand (all five metrics) | `{ type: "weight_kg", value: 72.57 }` | minutes | ISO-8601 string |
| Pulse Health (also water in fl oz) | `{ dataType: "weight", quantity: 160, unit: "lb" }` | hours | epoch seconds |
| ScaleCo | `{ body_weight: 72570 }` (grams) | seconds | epoch milliseconds |

A test asserts all three normalise to the identical canonical reading.

- **The app cannot tell mock from real.** Only [registry.ts](src/integrations/health/registry.ts) constructs providers. A real adapter implements the same five-member [`HealthProvider`](src/integrations/health/HealthProvider.ts) interface.
- **Imports are idempotent.** The record id is derived from `source` + the provider's own id, so importing twice — or on two devices — converges on one record.
- **Bad data is contained.** A malformed record is counted and skipped, not fatal. A unit the app cannot convert (the mock sends one weight in stone) is rejected rather than guessed.
- **A deleted import stays deleted.** Re-importing does not resurrect a reading the user removed.
- **Imported readings sync** like manual ones, because they use the same repository.
- **Failure states are simulated:** ScaleCo is "not installed" until switched on in the debug screen (provider unavailable); Pulse Health declines permission on the first attempt and grants it on the second.

---

## Offline and synchronisation strategy

**Write path.** `repository.create/update/remove` → one transaction: write the row with a new HLC and `sync_status = 'pending'`, append an outbox op → invalidate queries → nudge the sync engine (debounced). The UI never waits for the network.

**Sync engine** ([src/sync/SyncEngine.ts](src/sync/SyncEngine.ts)): push, then pull, never concurrently with itself.

*Push*
1. Read pending ops, oldest first, and **coalesce** per record: create + update → one create; update + delete → one delete; create + delete → nothing is sent.
2. Mark the ops `in_flight` and increment `attempts` **before** the request leaves.
3. Send a batch (50 records). Each op carries its own idempotency key and gets its own result:
   - `applied` → remove the ops, mark the row synced (only if it still has the version that was sent);
   - `stale` → the server holds a newer version; remove the ops and apply the server's version;
   - `rejected` → park the op as `failed`, mark the row, show it to the user.
4. A retryable failure (timeout, dropped connection) returns the ops to `pending` with `next_attempt_at = now + backoff`. Backoff is exponential (2 s base, 5 min cap) with jitter. A timer runs the next attempt.
5. Loop until nothing is due, so edits made while a batch was in flight go out in the same run.

*Pull*
- Fetch changes after the stored cursor, page by page. Each page **and its cursor** are committed in one transaction, so an interrupted pull resumes exactly where it stopped.

**Triggers:** app start, return to foreground, connectivity restored, after a local write (debounced), pull-to-refresh, the backoff timer. Foreground and reconnect ignore backoff — the conditions that caused the failure have probably changed.

How each concern from the brief is handled:

| Concern | Mechanism |
|---|---|
| Local persistence | SQLite; the UI reads only from it |
| Pending changes | Durable `outbox` table, written in the same transaction as the change |
| Retry | Exponential backoff with jitter per op; forced on reconnect / foreground / manual |
| Failed synchronisation | Retryable → backoff and banner; terminal → parked as `failed` with the server's reason and a *Retry* action |
| Duplicate requests | `op_id` idempotency key; the server returns the original result for a replay |
| Requests out of order | The server and the client compare logical clocks, never arrival order; an older write is a no-op |
| App terminated before sync completes | The outbox survives. On launch `in_flight` → `pending`, then replay; replays are safe because of the idempotency key |

One detail worth calling out: *create + delete → send nothing* is only correct if the create never left the device. If its `attempts` is above zero it may have reached the server before a crash, so the delete **is** sent in that case. There is a test for it.

---

## Conflict resolution

Two separate questions, deliberately handled by two separate mechanisms.

### 1. Two versions of the same record — last write wins, by hybrid logical clock

Every write stamps the record with an HLC: `(physical ms, counter, device id)`, serialised so that plain string comparison orders it ([hlc.ts](src/domain/sync/hlc.ts)). When two versions of one record meet — on the server during a push, or on the device during a pull — the higher HLC wins and the other is discarded ([conflictResolver.ts](src/domain/sync/conflictResolver.ts)). The same function runs on both sides, so they converge.

- **Ordering** does not depend on arrival order or on the wall clock alone. If the device clock jumps backwards the counter keeps timestamps increasing; seeing a remote timestamp from the future advances the local clock past it.
- **Concurrent updates** from two devices in the same millisecond are ordered by device id, so every device picks the same winner.
- **Duplicates** have equal HLCs and are ignored.
- **Deletes** are tombstones with an HLC. A later delete beats an earlier edit; an earlier edit can never resurrect a later delete.
- **Idempotency** follows: applying the same change twice, or an old change late, changes nothing.

### 2. Two *different* records for the same day — a display rule

A manual entry and a device reading are different records with different ids. They do not conflict and both are kept. Which one the dashboard shows for a day is a domain rule ([effectiveValue.ts](src/domain/measurement/effectiveValue.ts)):

> A manual reading beats a device reading; among the same kind the most recently measured wins; an exact tie is broken by HLC.

The reasoning: typing a number is a deliberate statement by the user, a sensor reading is passive.

### The scenario from the brief

```
10:01  User records 72.8 kg      → record A (manual),  hlc h1
10:02  Device reports 72.5 kg    → record B (device),  hlc h2   different record, no conflict
10:03  User edits to 72.6 kg     → record A,           hlc h3   same record, h3 > h1 → 72.6
10:04  Offline changes sync      → A's create+update coalesce into one request carrying 72.6
```

**Displayed: 72.6 kg.** 72.5 kg stays in the history, labelled with its source. This scenario is a named test in [effectiveValue.test.ts](src/domain/measurement/effectiveValue.test.ts), and the same rule is implemented in SQL for the dashboard series and tested there too.

Because the two layers are separate, changing the display rule (say, "most recent wins regardless of source") is a one-function change that does not touch sync.

### In a production system

- The server would assign the authoritative order (a per-user sequence) and reject on a version check; the HLC would remain for client-side ordering and tie-breaking.
- Last-write-wins is right for a single scalar like a weight. For records with several independently edited fields I would merge per field, and for anything where silent loss is unacceptable I would surface the conflict to the user instead.
- Idempotency keys would expire server-side after a retention window; tombstones would be compacted once every device has passed them.
- A user-visible audit trail ("changed on your other phone") is cheap once every version carries a device id.

---

## Application lifecycle

| Scenario | Handling | Status |
|---|---|---|
| App goes to the background during a sync | The in-flight request is allowed to finish. If the OS suspends the app first, the op stays `in_flight` and is recovered on the next launch or foreground | Implemented |
| App terminated with operations pending | The outbox is on disk. `bootstrap` resets `in_flight` → `pending` and syncs. The logical clock is restored from the highest stored HLC | Implemented, tested |
| Network lost during an operation | A retryable error; backoff, and an immediate attempt when NetInfo reports the connection is back | Implemented, tested |
| App reopened after several hours | Returning to the foreground triggers a forced sync; timers do not fire while suspended, so this is the trigger that matters | Implemented, tested |
| User logs in from another device | The other device pulls from cursor zero and receives every record and tombstone; concurrent edits resolve by HLC. Needs authentication and a per-user database file, which are not built. The debug screen's *Edit from another device* demonstrates the merge | Protocol implemented and tested; login not implemented |
| Sync while the app is closed | `react-native-background-fetch` (BGTaskScheduler / WorkManager) calling `SyncEngine.run()`. The engine needs no changes: it holds no in-memory state that matters | Designed |

---

## Performance

Designed for several years of data per user.

- **Aggregation happens in SQL.** A dashboard range is one query that reduces each day to a single value and groups days into buckets (daily for 7 d / 30 d, weekly for 3 m). JS receives at most ~30 rows whether the table holds a hundred readings or a hundred thousand. No arrays of raw readings are mapped or reduced on the JS thread.
- **Keyset pagination** for history (`WHERE (measured_at, id) < cursor ORDER BY … LIMIT 30`), not `OFFSET`: the cost of a page does not grow with scroll depth, and rows inserted mid-scroll cannot shift or duplicate items. Only loaded pages are in memory.
- **One composite index** matches both hot queries.
- **FlatList tuning:** fixed row height with `getItemLayout`, memoised rows, stable `keyExtractor` / `renderItem` / `onPress`, explicit `windowSize` and batch sizes, `removeClippedSubviews`.
- **Re-renders:** Zustand selectors; memoised dashboard cards; form state is local.
- **Sync** sends 50 records per request and reads the outbox in bounded pages, so a large backlog does not block a frame or balloon memory.
- **The dashboard is one indexed query** for today's rows across all metrics. "Latest value" on the detail screen is two indexed lookups, not a scan.

The debug screen's *Seed 3 years of data* inserts 3,285 readings to check this on a device. On an Android emulator the insert took about 0.7 s, after which history scrolling (paging back through several months) and range switching stayed responsive. This was checked by hand, not profiled.

**Scaling further:** a materialised `daily_aggregates` table maintained on write, so range queries stop touching raw rows; LTTB down-sampling for multi-year charts; FlashList if a list must hold thousands of loaded rows; moving any remaining heavy computation to a worklet or native module.

---

## Loading, error and empty states

| State | Where | What the user sees |
|---|---|---|
| Initial loading | App start; metric detail; history | "Opening your data…", then skeleton cards / a labelled spinner. The dashboard shows its zero cards immediately rather than a spinner |
| Database could not open | App start | Error with the reason and *Try again* |
| No health data | Dashboard | Every card reads zero, with "Nothing recorded today. Add your weight to get started." and an *Add weight* button |
| No historical data in the range | Metric detail | "No data in the last 7 days. The reading above is the most recent one." |
| Partial data | Dashboard | Metrics with data show their value; the rest stay at zero. An import where some providers fail still stores the rest and names the ones that failed |
| Offline | Banner on every screen | "Offline. 2 changes saved on this device will sync when you reconnect." |
| Changes pending | Banner + per-row badge | "2 changes waiting to sync." · *Sync now* |
| API failure / failed sync | Banner | "Sync failed: Request timed out. 2 changes waiting. Retrying at 10:04:32." · *Sync now* |
| Change rejected by the server | Banner + row badge | "1 change could not be synced." · *Retry*; the reason is in the debug outbox |
| Provider unavailable | Debug → *Import dummy data* | The result names each provider: "ScaleCo: not available" until *ScaleCo app installed* is switched on |
| Permission denied | Debug → *Import dummy data* | "Pulse Health: access not granted" on the first attempt; a second attempt is granted |
| Invalid form input | Form | A message under the field that is wrong |
| Record deleted elsewhere | Edit form | "This measurement no longer exists" |
| Unexpected crash | Any screen | Error boundary with *Try again*; "Your saved data is safe on this device." |

The banner's wording is decided by a pure function with a test per state ([SyncBanner.tsx](src/shared/components/SyncBanner.tsx)).

---

## Testing strategy

203 tests in 21 suites, run with `npm test` in about two seconds. Effort went where a bug would silently lose or corrupt data.

| Area | What is covered |
|---|---|
| Conflict resolution | Newer wins, stale ignored, duplicates ignored, deterministic tie-break, delete vs. edit in both orders |
| Hybrid logical clock | Monotonic when the wall clock goes backwards, distinct within a millisecond, advances past remote timestamps |
| Outbox coalescing | Every combination, including "the create may already have landed" |
| Backoff | Growth, cap, jitter bounds |
| SQL driver | Commit, rollback, isolation of unrelated queries from an open transaction, migrations |
| Repositories (real SQLite) | Row + outbox atomicity (and neither on failure), keyset pagination stability, series bucketing and time zones, import idempotency |
| Mock server | Idempotent replay, stale write rejected, change feed and cursor, persistence |
| **Sync engine** | Happy path, coalescing, batching, offline, retry and backoff, timer-driven retry, server rejection, lost response replay, crash recovery, stale push, edit during an in-flight push, pull paging, concurrent triggers |
| Normalisers | Three providers → identical output; malformed and unknown-unit records rejected |
| Import service | Idempotency, unavailable, permission denied, partial failure |
| Calculations | Effective value (including the 10:01–10:04 scenario), goals, summaries, formatting, form validation |
| Components | Form shows field errors and saves locally without calling the network; dashboard clean zero state, values after a dummy import, manual-over-device, daily reset of weight, offline banner |

Tests use the real implementations wherever possible: an in-memory SQLite database behind the same `SqlDriver`, and a fake API client backed by the real `MockServer`. Only time, ids and connectivity are faked.

Not covered: end-to-end tests on a device (Detox / Maestro), and the native module boundary (op-sqlite itself).

---

## Trade-offs

- **Hand-written SQL instead of an ORM.** More verbose and not type-checked against the schema; in exchange the transaction behaviour is explicit and tested, and there is one less dependency.
- **`sync_status` is stored on the row** rather than derived from the outbox. Cheaper to read in a list, at the cost of keeping two things consistent; they are always written in the same transaction.
- **Whole-record last-write-wins.** Simple and predictable; it discards the losing edit without telling the user.
- **Daily totals (steps, sleep, water, workout) take the largest daily value across sources** instead of summing, to avoid double-counting when two providers track the same activity. Correct for daily totals, wrong for providers that report increments.
- **Day boundaries use the device's current UTC offset** for the whole window, so a day containing a daylight-saving change is cut an hour off.
- **The mock server runs in-process.** It shares the client's clock and cannot be reached by a second real device; multi-device behaviour is exercised through tests and the debug screen rather than two phones.
- **Imported weights are not editable**, only deletable; the provider owns them.

---

## Known limitations

- No charts yet (phase 2).
- No authentication; a single hard-coded user.
- Light theme only; no localisation; weight in kilograms only.
- Seeded data is inserted as already synced and is not sent to the mock server. It exists to test performance.
- The mock server's idempotency table grows without bound.
- A change the server rejected can be retried but not discarded from the UI.
- No background sync while the app is closed.
- Goals cannot be edited in the UI.
- The tab bar uses text glyphs instead of an icon set.
- `npm audit` reports advisories in transitive development dependencies of the React Native toolchain; they were not triaged.

---

## What I would improve with more time

1. Charts (the data path is ready).
2. Discard-and-revert for rejected changes, with the server's reason shown inline on the row.
3. A real Health Connect / HealthKit adapter, with incremental import using the provider's change token instead of a fixed 30-day window.
4. Background sync.
5. Authentication, a database file per user, and wiping on sign-out.
6. End-to-end tests for the offline → kill → relaunch → sync path on both platforms.
7. A `daily_aggregates` table and down-sampling for multi-year ranges.
8. Database encryption (SQLCipher) — health data is sensitive.
9. Error reporting and sync metrics (queue depth, retry counts, time-to-sync).
10. Dark mode, accessibility audit, unit preferences.

---

## Assumptions

- One user, no login.
- Canonical units: kilograms, step count, minutes (sleep, workout), millilitres.
- Water is stored in millilitres and shown as whole glasses of 250 ml, so providers can keep reporting volumes.
- The dashboard shows today only: every card, weight included, is zero until something is recorded today. Earlier readings are on the card's detail screen and in History.
- Several readings per day are allowed; one is chosen for display.
- Providers report steps, sleep, water and workout as daily totals.
- Device clocks may be wrong; correctness must not depend on them.
- The server is the meeting point for devices, not the authority on the truth: it applies the same last-write-wins rule as the client.

---

## AI usage

This project was built with **Claude Code** (Anthropic) as a pair-programming agent working in the repository.

**Where and for what**

- *Planning.* From the assignment PDF it produced the implementation plan (scope, architecture, folder structure, packages) and the task list.
- *Implementation.* It wrote the source code, the tests, this README and the architecture diagrams, task by task, running type-check, lint and tests as it went.
- *Verification.* It built the app for both platforms, launched it on the iOS simulator, and drove the flows on the Android emulator through `adb` (see below).

**Decisions I made that overrode its proposals**

| AI proposed | I chose | Why |
|---|---|---|
| Expo | React Native CLI | Direct control of the native projects |
| FlashList | `FlatList` | Lists are paginated and stay small; no need for the dependency |
| Charts in the first phase (victory-native + Skia + Reanimated) | Charts deferred to phase 2 | Spend the time-box on sync and correctness |
| react-hook-form + zod | `useState` + a plain validator | One small form does not justify two libraries |
| `expo-crypto` for ids | `uuid` | No Expo modules |
| Dashboard with an empty state and three detailed cards | A "Today" grid: one card per metric, zero until there is data. Importing is a *Import dummy data* button on the Debug screen, with no Sources tab | Simpler, and the same shape on first launch as later |

**Significant suggestions from the AI that were kept**

- SQLite as the single source of truth with a transactional outbox.
- A hybrid logical clock for ordering, instead of wall-clock timestamps.
- Separating record-level conflict resolution (HLC) from the cross-source display rule (manual beats device).
- Deterministic ids for imported readings so re-imports and multi-device imports converge.
- Not dropping a coalesced create + delete if the create may already have been sent.

**What was changed or rejected during implementation**

- Drizzle ORM was in the plan and was removed after reading its op-sqlite driver showed its transactions are not atomic for async callbacks. Replaced by a small tested driver.
- libsql as the test database was replaced by `better-sqlite3` after a spike showed it does not hold a manual transaction in memory.
- The Babel path-alias plugin did not resolve under Metro; the alias was moved into `metro.config.js`.
- An initial diagnosis of that failure (a stale Metro process) was incomplete and was corrected by reproducing it against a clean Metro.

**How it was validated**

- 203 automated tests, concentrated on sync, conflict resolution and persistence, running real SQL.
- Strict TypeScript and ESLint clean.
- **Android emulator, driven through `adb`:** import from each provider (including the permission-denied and unavailable states); add and edit a weight offline; with the app force-stopped, the device database was copied off and showed both queued operations and the pending row; after relaunch the two operations were sent as one request and the mock server held the edited value; 100% failure rate produced backoff retries and recovered; an edit injected from "another device" won on the next sync; delete produced a tombstone on the server; the 3-year seed, history paging and 3-month range.
- **iOS simulator:** the app builds, launches, opens the database and renders the dashboard. The flows above were not driven on iOS.
