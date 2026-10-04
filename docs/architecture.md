# Architecture

## Components and data flow

```mermaid
flowchart TB
  subgraph UI["UI — src/features, src/shared/components"]
    Screens["Today · Metric detail · Weight history · Form · Debug"]
    Banner["SyncBanner"]
  end

  subgraph State["State"]
    RQ["TanStack Query<br/>(cache of local DB reads)"]
    Zustand["Zustand<br/>(sync status, selected range)"]
  end

  subgraph Domain["Domain — src/domain (pure TypeScript)"]
    HLC["Hybrid logical clock"]
    Resolver["Conflict resolver"]
    Coalesce["Outbox coalescing"]
    Rules["Effective value · stats · goals"]
  end

  subgraph Data["Data — src/data"]
    Repo["MeasurementRepository"]
    Outbox["OutboxRepository"]
    DB[("SQLite<br/>measurements · outbox<br/>sync_state · goals")]
  end

  subgraph Sync["Sync — src/sync"]
    Engine["SyncEngine<br/>push → pull, single-flight"]
    Triggers["Triggers<br/>foreground · reconnect · write"]
  end

  subgraph Health["Health integration — src/integrations/health"]
    Import["HealthImportService"]
    Norm["Normalizers A / B / C"]
    Providers["HealthProvider<br/>(mock FitBand, Pulse, ScaleCo)"]
  end

  subgraph Backend["Backend — src/api"]
    Api["ApiClient interface"]
    MockApi["MockApiClient<br/>latency · drops · duplicates · reorder"]
    Server[("MockServer<br/>idempotency · HLC ordering · change feed")]
  end

  Screens -- "read" --> RQ --> Repo
  Screens -- "write" --> Repo
  Banner --> Zustand
  Repo -- "row + outbox op<br/>in ONE transaction" --> DB
  Outbox --> DB
  Repo --> HLC
  Repo --> Resolver

  Triggers --> Engine
  Engine --> Outbox
  Engine --> Coalesce
  Engine -- "apply remote" --> Repo
  Engine -- "status" --> Zustand
  Engine -- "invalidate" --> RQ
  Engine --> Api --> MockApi --> Server

  Providers --> Norm --> Import -- "same write path<br/>as manual entries" --> Repo
```

Rules the diagram encodes:

- The UI never talks to the network. It reads and writes the local database;
  the sync engine is the only thing that calls the API.
- A local write and its outbox entry are one transaction.
- Arrows into `Domain` are function calls into pure code with no I/O.
- `ApiClient` and `HealthProvider` are the two external boundaries. The mock
  implementations sit behind them and are chosen in one place each
  (`src/app/bootstrap.ts`, `src/integrations/health/registry.ts`).

## A write made offline, then synced

```mermaid
sequenceDiagram
  actor User
  participant UI
  participant Repo as MeasurementRepository
  participant DB as SQLite
  participant Engine as SyncEngine
  participant API as ApiClient
  participant Server

  User->>UI: Save 72.8 kg
  UI->>Repo: create()
  Repo->>DB: BEGIN
  Repo->>DB: INSERT measurement (hlc=h1, pending)
  Repo->>DB: INSERT outbox op1 (create)
  Repo->>DB: COMMIT
  UI-->>User: Shown immediately, "Waiting to sync"

  User->>UI: Edit to 72.6 kg
  UI->>Repo: update()
  Repo->>DB: UPDATE measurement (hlc=h2) + INSERT outbox op2 (update)

  Note over Engine: Network restored → trigger
  Engine->>DB: read pending ops
  Engine->>Engine: coalesce op1+op2 → one create (72.6, key=op2)
  Engine->>DB: mark in_flight, attempts+1
  Engine->>API: pushOps([op2])
  API->>Server: push
  Server->>Server: op2 seen before? no → store if hlc newer
  Server-->>Engine: applied
  Engine->>DB: BEGIN · delete op1, op2 · mark row synced · COMMIT
  Engine->>API: pullChanges(cursor)
  Server-->>Engine: changes + new cursor
  Engine->>DB: BEGIN · apply newer changes · save cursor · COMMIT
```

## Response lost, or app killed mid-request

```mermaid
sequenceDiagram
  participant Engine as SyncEngine
  participant DB as SQLite
  participant Server

  Engine->>DB: mark op in_flight, attempts=1
  Engine->>Server: push(op)
  Server->>Server: applied, remembers op id
  Note over Engine,Server: Response lost — or the app is killed here

  alt App still running
    Engine->>DB: back to pending, next_attempt_at = now + backoff
  else App restarted
    Engine->>DB: bootstrap: in_flight → pending
  end

  Engine->>Server: push(op) again, same op id
  Server-->>Engine: original result (no second write)
  Engine->>DB: delete op, mark row synced
```
