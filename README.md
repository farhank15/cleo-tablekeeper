# Cleo Factory — Autonomous Software Manufacturing

> *"In a true Dark Factory, the human is not a programmer holding the wrench; the human is the **Mandor** (Factory Supervisor & Systems Architect) who designs the factory floor, establishes the quality gates, assigns specialized machine seats, and switches on the power."*

An autonomous multi-agent software factory developed for the **WeAreDevelopers x BAND Hackathon: Dark Factory Challenge** (September 26 – October 5, 2026).

---

## 1. The Mandor Philosophy & Hackathon Thesis

The defining premise of the Dark Factory competition is **Lights-Out Autonomous Engineering**: deploying a collaborative band of autonomous coding agents capable of taking an unedited technical specification, establishing an atomic requirements ledger, implementing a robust full-stack solution, and verifying all invariants **with zero mid-flight human steering, debugging hints, or approval cycles**.

### Empirical Research Grounding (Why 90% of Multi-Agent Systems Fail)

Rather than assembling agents ad-hoc, Cleo Factory is engineered on foundational empirical research analyzing multi-agent trajectory failure modes:

| Research Foundation | Core Empirical Finding | Cleo Factory Architecture Response |
| :--- | :--- | :--- |
| **MAST Taxonomy**<br>*(arXiv:2503.13657, UC Berkeley, 1,600+ traces, $\kappa=0.88$)* | **41.77% of failures are Specification Issues**.<br>**37.60% are Inter-Agent Misalignment**.<br>**20.63% are Task Verification Collapse**.<br>Top individual failures: **Step Repetition (17.14%)**, **Reasoning-Action Mismatch (13.98%)**, **Failure to Clarify (11.65%)**. | **Ledger-First Protocol (`R-N.k`)**: Code cannot be written until every normative statement is cataloged. **Shared Board Synchronization**: Eliminates step repetition. **Mandatory Clarification Channel**: Prevents silent assumptions. |
| **Anthropic Multi-Agent Systems Research** | Orchestrator-worker topologies outperform single agents by **+90.2% on broad engineering tasks**, but require strictly bounded, self-contained task delegation. Vague prompts trigger catastrophic duplicate work. | **Self-Contained Work Orders**: Dispatches carry complete specification text, exact paths, and explicit boundaries. No agent relies on "read the room" pointers. |
| **Context Rot & "Lost in the Middle"**<br>*(Liu et al. / Stanford & Salesforce)* | LLM recall follows a U-shaped attention curve; middle instructions decay rapidly. Multi-turn chat threads suffer up to **-39% degradation** ("Lost in Conversation") due to early false assumptions. | **U-Shaped Attention Structuring**: Critical invariants and boundary rules are placed at the absolute top and bottom of each dispatch, followed by an explicit exit checklist. |
| **Cognition Engineering Principles**<br>*(“Don’t Build Multi-Agents”)* | Actions carry implicit architectural choices. Multiple agents editing the same codebase simultaneously create divergent, irreconcilable states. | **Single-Threaded Writes per Domain**: Absolute territorial isolation. Engine writes to `src/`; Presentation writes to `public/`; Verification writes to `verification/`. Zero file contention. |
| **METR Task Horizon Studies** | LLM agent reliability drops exponentially over extended horizons: ~100% on <4-minute tasks, but <10% on >4-hour sequential tasks. | **Atomic Micro Work Orders**: Complex stages are partitioned into granular, commit-sized units tied directly to ledger entries. |

---

## 2. Architectural Design Choices & Trade-Off Matrix

### Why a 4-Seat Topology? (The Coordination Boundary)
A common failure in multi-agent designs is seat inflation. Adding seats expands inter-agent communication channels quadratically:
$$\text{Channels} = \frac{N(N - 1)}{2}$$
With 7 seats, there are 21 potential points of misalignment. With 4 seats, communication channels are constrained to exactly 6 well-defined interfaces:

```
                       ┌───────────────────────────────┐
                       │          CLEO-PRIME           │
                       │   Coordinator & Architect     │
                       │  Ledger, Board, Gate Arbiter  │
                       └──────────────┬────────────────┘
                                      │
                      Self-Contained Work Orders (U-Shape)
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
     ┌───────────────────┐                         ┌───────────────────┐
     │    CLEO-FORGE     │                         │   CLEO-SENTINEL   │
     │  Core Backend &   │◄─── API Contracts ─────►│  Presentation UI  │
     │  State Machines   │                         │  Warm Hospitality │
     └────────┬──────────┘                         └─────────┬─────────┘
              │                                              │
              │ Single-Threaded Write: src/                  │ Single-Threaded Write: public/
              │                                              │
              └───────────────────────┬──────────────────────┘
                                      ▼
                       ┌───────────────────────────────┐
                       │         CLEO-RELEASE          │
                       │   Adversarial Quality QA      │
                       │ 8-Point Attack & Invariants   │
                       └───────────────────────────────┘
```

1. **`@cleo-prime` (Factory Coordinator)**: Owns planning, requirements ledger (`ledger/stage-N.md`), Band shared task board, and release certification. **Forbidden from writing product code.**
2. **`@cleo-forge` (Engine Builder)**: Owns domain algorithms, transactional mutex locking, calendar validation, and REST API endpoints under `src/`. **Forbidden from editing HTML/CSS.**
3. **`@cleo-sentinel` (Interface Builder)**: Owns Warm Hospitality UI, CSS design tokens, responsive viewports (375px–1280px), and integration test hooks under `public/`. **Forbidden from modifying core state or database logic.**
4. **`@cleo-release` (Adversarial Verifier)**: Owns independent reference models, differential fuzzing, and Docker container qualification under `verification/`. **Forbidden from patching product code.**

---

### Why a Native Monolith instead of SPA Frameworks (React Router 7 / Next.js)?

While modern frameworks like React Router 7 or TanStack are permitted, deploying them inside an autonomous dark-factory environment introduces fatal risk vectors:

| Constraint Factor | Heavy SPA Frameworks (React 19 / Vite / Remix) | Cleo Native Monolith (Node.js + Semantic DOM + CSS) |
| :--- | :--- | :--- |
| **Offline Container (`--network none`)** | High failure risk: thousands of npm sub-dependencies; post-install scripts or cache misses trigger build abortion. | **Zero Runtime Dependencies**: Uses Node.js standard library (`http`, `crypto`, `Intl`). 100% offline-ready. |
| **Resource Limits (2 vCPU, 2 GiB RAM)** | Dev servers and SSR runtimes consume 400–800 MB, risking Out-Of-Memory (OOM) crashes under concurrent test bursts. | **Tiny Footprint**: Memory usage remains <35 MB; instant cold boot (<20ms). Easily sustains concurrent request floods. |
| **Single-Port Contract** | Requires multiple processes (backend API + frontend server) bridged by internal reverse proxies (nginx). | **Unified HTTP Dispatcher**: A single native server serves JSON API routes and static client assets on port 8080. |
| **Automated Playwright Grading** | Client-side hydration delays frequently cause transient selector timeouts in headless browser runners. | **Deterministic DOM**: Pure semantic HTML5 elements are ready for immediate assertion with zero hydration lag. |

---

## 3. The 5-Block Standard Mandate Architecture

Every seat mandate in `mandates/` is structured into five standardized operational blocks designed to neutralize the leading failure modes identified by the MAST taxonomy:

1. **Identity & Hard Prohibitions (Block 1)**: Defines seat handle, model runtime, and strict negative boundaries (neutralizing **Role Disobedience FM-1.2**).
2. **Deliverables & Artifact Surface (Block 2)**: Dictates exact filesystem paths, format standards, and directory inheritance rules.
3. **Definition of Done (Block 3)**: Mandates that an item is finished only when backed by verifiable test execution citing specific ledger clauses (neutralizing **Reasoning-Action Mismatch FM-1.3**).
4. **Handoff Protocol & Git Identity (Block 4)**: Requires self-contained dispatches, U-shaped attention structuring, and unique git commit author credentials (`git -c user.name=...`).
5. **Autonomy & Escalation (Block 5)**: Enforces dark-factory silence toward humans while establishing a mandatory escalation protocol to `@cleo-prime` for specification ambiguities (neutralizing **Failure to Clarify FM-3.1**).

---

## 4. Closing the 89% "Green Illusion" Gap

In the Dark Factory competition, the organizers ship only a fraction of the test suite (**only 11% of checks are shipped in Stage 3, and 21% in Stage 4**). Teams that "code to the visible tests" suffer total disqualification or failure on hidden grading suites.

Cleo Factory overcomes this with the **8-Point Adversarial Attack Matrix** executed by `@cleo-release`:
1. **Double-Commit Concurrency Bursts**: Firing parallel simultaneous requests at identical microsecond intervals to verify atomic serialization.
2. **Replay & Idempotency Probes**: Validating identical replay outcomes and zero side-effect duplication for retried keys.
3. **Check-and-Act Race Windows**: Attacking the time gap between resource availability check and state mutation.
4. **Boundary & Malformed Inputs**: Fuzzing nonexistent calendar dates (e.g. February 30), negative values, and oversized bodies.
5. **Domain Conservation Invariants**: Asserting domain balance laws (e.g. zero overlapping bookings per table, immutable history) after every test run.
6. **Numerical Representation**: Auditing integer arithmetic to ensure zero floating-point precision loss.
7. **Degraded Connection Modes**: Testing client recovery during aborted and uncertain network transmissions.
8. **Isolated Container Compliance**: Verifying container builds under `--network none` with `GET /health` responding within 60 seconds.

---

## 5. Repository Topology & Pre-Flight Verification

```text
cleo-tablekeeper/
  README.md            # Architectural blueprint, research grounding, and design matrix
  FACTORY.md           # Operational accounting, costs, failure recovery, and trade-offs
  mandates/            # Standardized 5-block generic mandates (0 Gate 4 violations)
    cleo-prime.md      # Production coordinator & ledger architect
    cleo-forge.md      # Core backend engine & transactional state builder
    cleo-sentinel.md   # Presentation layer & Warm Hospitality design builder
    cleo-release.md    # Adversarial quality auditor & release gatekeeper
  stage-1/             # Complete buildable service: Concurrency, IANA time, idempotent API
  stage-2/             # Stage 1 + Warm Hospitality browser UI, competing search, combinations
  stage-3/             # Stage 2 + Dynamic effective-dated policies & recurring agreements
  stage-4/             # Stage 3 + 3-tier deterministic closure replanning & atomic apply
  room.json            # Unedited session log exported directly from Band Desktop
```

### Pre-Flight Compliance Verification
Verify Gate 1, Gate 2, and Gate 4 vocabulary compliance:
```bash
python3 -m harness check . --track tablekeeper
```

### Running Isolated Verification Harness
```bash
# Verify individual stage in isolated grading mode
python3 -m harness run --track tablekeeper --repo . --stage 1 --mode isolated

# Full 4-stage pipeline execution
python3 -m harness run --track tablekeeper --repo . --all --mode isolated
```
