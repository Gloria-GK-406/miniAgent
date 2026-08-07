# Routing Decision

- TaskContract: `.rks-agent/tasks/componentize-token-usage-and-oneshot-llm/TaskContract.md`
- Contract revision: `1`

## SDD Readiness

- Intent and outcome stability: The conversation converged on one bounded refactor: replace runtime/config injection with a tool-free one-shot LLM abstraction and move token accounting behind capability interfaces with one aggregate interface for `MiniAgent`.
- Requirement stability: Credential hiding, current-runtime capture, single use, no tools or Agent session, separated token capabilities, aggregate ownership, shared accounting, and compatibility are explicit and observable.
- Execution direction: The existing `LLMRequest`/engine-manager routing remains in place; usage must travel through the stream before either main-loop or one-shot reporting can be correct.
- Remaining uncertainty: Only local naming, file placement, and exact Zod composition choices remain; none changes task meaning.

## Marginal Control Value

- User precision signal: The user explicitly asked to open a task contract and complete the agreed modification after iteratively refining its interface boundaries.
- Direct failure mode: A direct cross-cutting edit could add the new interfaces while overlooking that the current delta-only stream drops provider usage, leaving apparently componentized accounting permanently at zero or double-reporting one path.
- Useful control: One durable Spec plus an explicit dependency-ordered Plan and complete-result code review protect the stream-to-response-to-reporter chain and the public injection boundary.
- Time-for-quality rationale: The small artifact cost is justified because several compile-compatible implementations would violate credential isolation, current-setting capture, exact-once accounting, or public compatibility without obvious local failures.

## Structural Selection

- Selected workflow: `single-spec-workflow`
- Boundary evidence: The one-shot caller, usage transport, usage service, compressor migration, and exports form one integrated acceptance boundary; none is independently useful or safely acceptable without the others.
- Why Direct is insufficient: Direct checks do not preserve the dependency ordering and complete cross-boundary acceptance mapping the user explicitly requested through a task contract.
- Why Multi is unnecessary: There is one shared implementation and rollback boundary with one integrated token-accounting outcome.
- Reroute conditions: Reroute only if implementation reveals a separately deployable engine protocol change, a breaking public API decision requiring independent acceptance, or a security impact beyond hiding already-internal credentials.

## Controller Selection

- Controller: `sdd-standard`
- Profile source: `code-feature`
- Why this is sufficient: A durable Spec, dependency-ordered Plan, test-driven implementation, complete code review, and fresh verification cover the credible omission and sequencing risks.
- Why lighter is insufficient: Lite omits the Plan needed to order stream usage transport before response collection and shared reporting across two execution paths.
- Why heavier is unnecessary: The work does not change authentication authority, persist secrets, perform external mutations, or create safety/data-loss exposure requiring independent challenge or drift governance.
