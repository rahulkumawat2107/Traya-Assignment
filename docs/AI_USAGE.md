# AI usage

The brief asks where AI was used, what for, which significant suggestions came from it, and what I changed, rejected or validated myself. This is the full account; the README has the summary.

## Tool

**Claude Code** (Anthropic's coding agent), running in the repository with access to the file system, the shell, the iOS simulator and the Android emulator.

## How the work was split

Nearly all of the code, tests and documentation in this repository was written by the agent. My part was direction and ownership: the constraints, the scope, the product decisions, and deciding which of its proposals to keep. I did not hand-write the implementation, and this document does not claim otherwise.

| | The agent | Me |
|---|---|---|
| Plan | Drafted the implementation plan, folder structure and package list from the brief | Reviewed it before any code was written and changed five things (below) |
| Code and tests | Wrote them, task by task | Chose what to build, in what order, and what to cut or change |
| Verification | Ran type-check, lint and the test suite; built both platforms; drove the Android emulator through `adb` | Ran the app on the Android emulator and used it by hand between iterations |
| Product | Proposed a first version of each screen | Reshaped the dashboard, metrics and navigation after using them |
| Documentation | Drafted the README, this file and the diagrams | Set what they had to cover and how the work should be described |

## Where it was used, in order

1. **Planning.** I gave it the assignment brief and asked for an implementation plan with a production folder structure and the packages needed.
2. **Plan review.** I changed the plan before execution:
   - plain React Native CLI instead of Expo;
   - `FlatList` instead of FlashList — the list will not hold thousands of rows;
   - no charts in the first pass;
   - no `react-hook-form` or `zod` — validate with component state;
   - `uuid` instead of `expo-crypto`.
3. **Task list and execution.** I had it turn the plan into a checklist and work through it: tooling, domain layer, database and repositories, mock backend, sync engine, UI, health integration, debug tools, documentation.
4. **Dashboard rework.** After running the first version I asked for a simpler dashboard: cards showing today's values, everything at zero to start with.
5. **Metric changes.** I had every value, weight included, reset to zero each day; water shown as glasses; calories removed.
6. **Import moved.** I removed the Sources tab and the dashboard's import button, and asked for an *Import dummy data* button on the Debug screen so the app starts clean.
7. **Charts and water logging.** With the sync work done, I asked for the charts that had been deferred, and for a way to add glasses of water by hand.
8. **Navigation.** I removed the History tab.
9. **Documentation.** I asked for the README, this document and the architecture diagrams, against the deliverables list in the brief.

## Significant suggestions from the AI

### Architectural suggestions I kept

- **SQLite as the single source of truth**, with the UI reading only the database and sync treated as a background concern.
- **A transactional outbox**: each change and its queue entry written in one transaction.
- **A hybrid logical clock** for ordering instead of wall-clock time.
- **Two layers of conflict handling**: last-write-wins per record, and a separate "manual beats device" display rule for different records on the same day.
- **Deterministic ids for imported readings**, so importing twice or on two devices converges on one record.
- **Coalescing queued operations**, and not dropping a create + delete pair when the create may already have reached the server.
- **Interfaces at every external boundary** (`ApiClient`, `HealthProvider`, `SqlDriver`, `Clock`, `IdGenerator`, `NetworkMonitor`), wired in one composition root.
- **An in-app mock server** with switchable latency, failures, duplicates and reordering, instead of a network-level mock.
- **Aggregating chart data in SQL** and keyset pagination for the history list.
- **A hand-rolled SVG chart** with its layout maths in a separately tested module, rather than a charting library.

### Suggestions I changed or rejected

| The AI proposed | I chose | Why |
|---|---|---|
| Expo | React Native CLI | Direct control of the native projects |
| FlashList | `FlatList` | The list is paginated and stays small |
| react-hook-form + zod | `useState` + a plain validator | One small form does not justify two libraries |
| `expo-crypto` | `uuid` | No Expo modules |
| Charts in the first pass, with victory-native + Skia + Reanimated | Deferred until the sync work was done | Correctness first within the time-box |
| A dashboard with an empty state and three detailed cards | A "Today" grid, every card at zero until there is data | Simpler; same shape on first launch as later |
| Carrying the last weight forward on the dashboard | Weight resets to zero each day like the others | Consistency across the cards |
| Calories as a sixth metric | Removed | Not needed |
| Water in litres | Water in glasses, with add / remove | Closer to how it would be used |
| A Sources tab and a dashboard import button | *Import dummy data* on the Debug screen only | The app should start clean |
| A History tab | Weight history opened from the Weight screen | Fewer tabs |

### Judgement calls the agent made that I let stand

- When I removed the Sources tab, it kept the health-integration layer (provider interface, normalisers, import service and their tests) and pointed the Debug button at it, because the brief asks for that layer.
- When I removed the History tab, it kept the weight list as a screen reached from the Weight card, because the brief asks for viewing, editing and deleting measurements.
- For "add water glasses" it chose one manual record per day with the manual total taking precedence over a provider's.

## Where the AI got things wrong

Worth recording, because it is the reason its output cannot be taken on trust.

- **Its plan relied on Drizzle ORM.** Its own spike found that Drizzle's op-sqlite driver commits before an async transaction callback finishes, which would have broken the "row + outbox in one transaction" guarantee. It replaced Drizzle with a small driver and tests for commit, rollback and isolation.
- **Its second choice of test database (libsql) also failed** the same spike; it moved to `better-sqlite3`.
- **Its path-alias setup did not work under Metro.** It first blamed a stale Metro process, found that was incomplete after reproducing the failure against a clean one, and moved the alias into Metro's resolver.
- **It over-interpreted "every metric"** and added calories, which I then removed.
- **During device verification it cleared the emulator app's data** to check the first-launch state, which deleted test data I had entered. It reported this itself.
- **One dashboard test still intermittently logs a React `act()` warning** when the whole suite runs in parallel. It tried two fixes; neither removed it. The test passes.

## What was validated, and by whom

### By the agent

- **Automated:** 233 tests in 23 suites, strict TypeScript, ESLint — run after every change.
- **Android emulator, driven through `adb`:**
  - importing from the mock providers, including the permission-denied and unavailable states;
  - adding and editing a weight while offline; with the app force-stopped, it copied the device database off and found both queued operations and the pending row; after relaunch the two operations went out as one request and the mock server held the edited value;
  - a 100% failure rate producing backoff retries, then recovering;
  - an edit injected "from another device" winning on the next sync;
  - a delete producing a tombstone on the server;
  - the 3-year seed, history paging and the 3-month range;
  - upgrading an install that still held calories data (the clean-up migration);
  - the line and column charts, touch selection, and adding / removing glasses of water.
- **iOS simulator:** builds, launches, opens the database and renders the dashboard. The flows above were not driven on iOS.

### By me

- I reviewed the plan and changed it before any code was written.
- I ran the app on the Android emulator throughout and entered data by hand. Every product change in the table above came from using it.

### Not validated by anyone

- No end-to-end test suite on a device.
- Performance with seeded data was tried by hand, not profiled.
- The last navigation change (removing the History tab) is covered by type-check and tests but was not re-checked on a device by the agent.
