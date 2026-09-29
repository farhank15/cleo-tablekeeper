# FACTORY: Cleo Autonomous Software Factory

An autonomous, multi-agent software engineering factory designed for dark-factory execution—operating end-to-end from raw specification to verified, production-grade containerized releases with zero mid-flight human intervention.

---

## 1. Executive Summary & The "Mandor" Doctrine

Cleo Factory is built upon the **Mandor Philosophy** of autonomous industrial engineering: the human operator functions exclusively as a high-level commissioner and auditor. A single kickoff dispatch initiates production; all four stages—from formal requirements ingestion, atomic ledger decomposition, concurrent transaction engines, and responsive Warm Hospitality interfaces, through to independent adversarial verification and container qualification—are executed autonomously by a specialized roster of four AI peers collaborating via Band Desktop.

### Factory Vital Signs & Efficiency Footprint
* **Model Runtime**: OpenCode (`opencode/muse-spark-1.3-contributor-free`)
* **Total Model Expenditure**: **$0.00** (Zero metered spend; 100% Contributor Tier compliant)
* **Human Steering Turns**: **Exactly 1** (The initial commission dispatch)
* **Network Isolation**: 100% offline-ready (`--network none` container contract)
* **Compliance Gates**: 100% Pass across Gate 1 (Roster), Gate 2 (`@handle` bi-directional exchange), Gate 3 (Container limits & healthcheck), and Gate 4 (Generic Mandate discipline)

---

## 2. Factory Roster & Demarcated Topography

In accordance with empirical findings on multi-agent breakdown (UC Berkeley MAST taxonomy, arXiv:2503.13657), adding unconstrained agents increases coordination failure surfaces exponentially. Cleo Factory strictly enforces a minimal, single-responsibility 4-seat topology:

```
                  ┌─────────────────────────────────────────┐
                  │               CLEO-PRIME                │
                  │        Chief Factory Architect          │
                  │   Spec Ledger, Board & Release Gate     │
                  └────────────────────┬────────────────────┘
                                       │
                       Single-Turn U-Shaped Dispatches
                                       │
         ┌─────────────────────────────┴─────────────────────────────┐
         ▼                                                           ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│           CLEO-FORGE            │                 │          CLEO-SENTINEL          │
│       Core Engine Builder       │◄── Shared API ──►│        Studio & UX Builder        │
│  State, Concurrency, Zero-Dep   │    Contract     │  Warm Hospitality, Testids, DOM │
└────────────────┬────────────────┘                 └────────────────┬────────────────┘
                 │                                                   │
                 └─────────────────────────┬─────────────────────────┘
                                           ▼
                  ┌─────────────────────────────────────────┐
                  │              CLEO-RELEASE               │
                  │        Adversarial Quality QA           │
                  │   8-Point Attack Matrix & Harness Run   │
                  └─────────────────────────────────────────┘
```

### Seat Responsibility Matrix

| Seat | Role | Mandate File | Model / Harness | Core Competency & Boundaries |
| :--- | :--- | :--- | :--- | :--- |
| **`@cleo-prime`** | Chief Architect | `mandates/cleo-prime.md` | OpenCode / Muse-Spark-1.3 | Requirements ledger (`ledger/stage-N.md`), task sizing (1 WO = 1 commit), status boards, U-shape dispatches, and ambiguity arbitration. **Never touches product code.** |
| **`@cleo-forge`** | Engine Engineer | `mandates/cleo-forge.md` | OpenCode / Muse-Spark-1.3 | Transactional state machines, microsecond concurrency mutexes, strict calendar date validation, IANA timezone math, zero external npm runtime dependencies. **Never touches HTML/CSS.** |
| **`@cleo-sentinel`** | UX Engineer | `mandates/cleo-sentinel.md` | OpenCode / Muse-Spark-1.3 | Warm Hospitality Design System, semantic HTML5/CSS3, deterministic DOM reactivity, mobile (375px) / desktop responsiveness, contract-exact `data-testid` hooks. **Never alters backend business logic.** |
| **`@cleo-release`** | Adversarial QA | `mandates/cleo-release.md` | OpenCode / Muse-Spark-1.3 | Independent test reference models, 8-point adversarial attack matrix, race fuzzing, container build audits (`--network none`), and gate clearance. **Completely code-isolated.** |

---

## 3. Communication Protocol & Handoff Mechanics

1. **Explicit `@handle` Targeting**: Every broadcast and task order targets the recipient by handle (e.g. `@cleo-forge`, `@cleo-sentinel`, `@cleo-release`), satisfying Gate 2 bi-directional communication requirements and preventing diffusion of responsibility.
2. **U-Shaped, Self-Contained Packets**: Handoffs carry full context (exact file paths, clause excerpts, input JSON payloads, and reproduction commands) positioned at the start and end of dispatches to neutralize multi-turn LLM attention loss.
3. **Spec-Clause Traceability Ledger**: Before writing any implementation code, `@cleo-prime` commits `ledger/stage-N.md`. Every requirement sentence becomes an immutable atomic clause (`R-N.k`). Product commits must explicitly cite the clause implemented (e.g. `feat(engine): implement R-1.4 atomic reservation locking`).
4. **Adversarial Verification Gate**: No stage is tagged or advanced until `@cleo-release` executes independent probes against the live container, confirming 100% pass on both visible harness checks and unannounced edge cases.

---

## 4. Empirical MAST Failure Mitigation Matrix

Cleo Factory is deliberately engineered to neutralize the empirical failure modes documented in the MAST taxonomy (1,600+ traces, κ=0.88):

| MAST Failure Mode | Empirical Rate | Cleo Factory Architectural Countermeasure |
| :--- | :---: | :--- |
| **FM-1.1: Step Repetition** | **17.1%** (#1 Failure) | **Factory Work Board & Immutable Ledger**: `@cleo-prime` maintains an explicit state board (`QUEUED -> DISPATCHED -> IN-PROGRESS -> IN-REVIEW -> ACCEPTED`). Before issuing orders, an anti-repetition sweep validates that prior accepted commits already cover the scope. |
| **FM-1.3: Reasoning-Action Mismatch** | **14.0%** (#2 Failure) | **Independent Verification Separation**: Builders cannot sign off on their own work. `@cleo-release` writes probes derived directly from spec text, never inspecting builder code or visible test harnesses. |
| **FM-3.1: Failure to Clarify** | **11.7%** (#3 Failure) | **Ambiguity Arbitration Protocol**: When specifications contain ambiguities or edge gaps, seats escalate immediately to `@cleo-prime`. Prime records the formal ruling in `ledger/stage-N.md` before execution proceeds. |
| **FM-1.2: Role Disobedience** | 4.9% | **Negative Boundary Mandates (Block 1)**: Each seat's mandate begins with an explicit negative scope (Forge cannot touch UI; Sentinel cannot modify backend storage; Release cannot modify source). |
| **FM-2.1: Inter-Agent Misalignment** | 3.8% | **Cognition Single-Threaded Write Discipline**: Stage directories are owned by specific seats during distinct phases. Forge creates the API contract; Sentinel consumes it; Release audits the artifact. |

---

## 5. Architectural Decisions & Engineering Trade-offs

### Decision 1: Pure Node.js Standard Library (Zero External Dependencies)
* **Implementation**: Native `http`, `crypto`, and `Intl` modules; zero runtime npm dependencies.
* **Engineering Rationale**: Eliminates dependency graph vulnerabilities, lockfile desynchronizations, and registry download failures in strictly offline `--network none` Docker builds.
* **Trade-off**: Required hand-crafting a clean, modular router and query/body parser (< 90 lines of readable code).

### Decision 2: Warm Hospitality Design System
* **Implementation**: Curated palette (Warm Parchment `#FDFBF7`, Deep Terracotta `#8C2D19`, Forest Slate `#1F302B`, Muted Sage `#E3E8E1`), fluid typography, and mobile-first responsive layout embedded in `style.css`.
* **Engineering Rationale**: Hackathon grading explicitly penalizes crude unstyled HTML or "test harnesses with buttons". A bespoke design system delivers authentic restaurant ambiance while executing completely offline.
* **Trade-off**: Required strict viewport testing across standard desktop (1280px) and compact mobile (375px).

### Decision 3: Mutually Exclusive Empty-State UI Rendering
* **Implementation**: When search queries yield zero available tables, the UI renders `[data-testid="no-slots"]` while strictly omitting `[data-testid="availability-grid"]` from the DOM.
* **Engineering Rationale**: Automated browser runners (Playwright) intermittently fail when empty containers coexist with hidden grids. Deterministic mutual exclusivity guarantees zero-latency, flakiness-free DOM assertions.

### Decision 4: In-Memory Mutex & Atomic Reservation Serialization
* **Implementation**: Serialized event-queue mutex locking keyed by table or restaurant entity.
* **Engineering Rationale**: Prevents race conditions during microsecond-level concurrent booking requests without the overhead and startup latency of external databases (PostgreSQL/Redis).

---

## 6. Closing the 89% "Green Illusion" Gap

In Stages 3 and 4 of the competition, the organizers ship only **11% to 21% of the grading tests**, withholding the remaining test suite to detect overfitting. 

Cleo Factory addresses this with an adversarial verifier (`@cleo-release`) that executes an **8-Point Adversarial Attack Matrix**:
1. **Double-Commit Concurrency Bursts**: High-frequency concurrent requests targeting identical table-slots to trigger and catch race windows.
2. **Replay & Idempotency Probes**: Testing duplicate payloads against idempotency keys to ensure exact 200/201 responses with zero duplicate state generation.
3. **Check-and-Act Time Windows**: Fuzzing state changes between initial availability queries and final booking confirmations.
4. **Calendar & Input Boundary Stressors**: Injecting invalid dates (e.g. February 30th, leap year anomalies), past dates, and malformed JSON payloads.
5. **Domain Conservation Invariants**: Verifying mathematical domain laws (total table hours booked + available = capacity).
6. **Numerical Representation & Precision**: Validating currency, time offsets, and integer calculations against floating-point drift.
7. **Degraded Network Handling**: Ensuring graceful client error handling when requests encounter intentional timeout or 4xx/5xx responses.
8. **Isolated Container Compliance**: Building and testing Docker containers under `--network none`, validating sub-second startup and `GET /health` responding `200 {"status": "ok"}`.

---

## 7. Replication Guide: Running Cleo Factory

Any engineering team can replicate Cleo Factory by following this operational procedure:

### Step 1: Clone Scaffold
Ensure `mandates/`, `README.md`, and `FACTORY.md` are present at the root of the workspace.

### Step 2: Register Factory Seats in Band
```bash
jam agent create cleo-prime opencode/muse-spark-1.3-contributor-free --harness opencode
jam agent create cleo-forge opencode/muse-spark-1.3-contributor-free --harness opencode
jam agent create cleo-sentinel opencode/muse-spark-1.3-contributor-free --harness opencode
jam agent create cleo-release opencode/muse-spark-1.3-contributor-free --harness opencode
```

### Step 3: Configure Live Mandates
Load each seat's instructions from its corresponding file in `mandates/`:
```bash
jam agent instructions set cleo-prime "$(cat mandates/cleo-prime.md)"
jam agent instructions set cleo-forge "$(cat mandates/cleo-forge.md)"
jam agent instructions set cleo-sentinel "$(cat mandates/cleo-sentinel.md)"
jam agent instructions set cleo-release "$(cat mandates/cleo-release.md)"
```

### Step 4: Dispatch Kickoff Prompt
Create a fresh room in Band Desktop, invite all four seats, and post the single kickoff prompt to `@cleo-prime`.

### Step 5: Mandor Walkaway
Step away while the factory plans, implements, adversarially verifies, and containerizes Stages 1 through 4. Download `room.json` upon completion.
