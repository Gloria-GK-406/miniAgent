# Routing Decision

- TaskContract: `.rks-agent/tasks/enforce-schema-first-exported-types/TaskContract.md`
- Contract revision: `2`

## SDD Readiness

- Intent and outcome stability: The requested repository-wide exported-type prohibition, migration, automated rejection, and verification outcome are explicit and observable.
- Requirement stability: Exported project-owned named types, public barrels, detector behavior, lint integration, and regression tests can be constrained and reviewed.
- Execution direction: Convert exported definitions to schema-backed inferred types, preserve internal implementation types where allowed, and enforce the boundary with a source-aware detector.
- Remaining uncertainty: Only local schema construction and compatibility choices remain; they do not change the task meaning.

## Marginal Control Value

- User precision signal: The user explicitly requires the rule across the entire project and requires the checker to reject violations.
- Direct failure mode: A broad mechanical migration can easily miss barrel exports, generic protocol types, enums, or checker edge cases while still compiling.
- Useful control: A durable Spec, dependency-aware Plan, complete-result review, and fresh verification protect the public API and enforcement boundary together.
- Time-for-quality rationale: The cost is justified because an incomplete migration or weak checker would falsely claim repository-wide compliance and allow immediate regression.

## Structural Selection

- Selected workflow: `single-spec-workflow`
- Boundary evidence: Code migration and enforcement form one coherent acceptance boundary; neither is independently acceptable without the other.
- Why Direct is insufficient: Compile and ordinary lint success do not prove exhaustive exported-type coverage or detector rejection behavior.
- Why Multi is unnecessary: The migration and detector share one atomic repository invariant and one rollback boundary.
- Reroute conditions: Reroute only if implementation reveals separately releasable package boundaries with incompatible schema-first contracts or an external compatibility requirement that invalidates the accepted scope.

## Controller Selection

- Controller: `sdd-standard`
- Profile source: `code-refactor`
- Why this is sufficient: A durable implementation plan is valuable because schema definitions, public exports, consumers, detector semantics, and tests have ordered dependencies; complete review and fresh verification cover the resulting invariant.
- Why lighter is insufficient: Lite lacks the explicit dependency and sequencing plan needed to avoid propagating incompatible public-type changes across layers and barrels.
- Why heavier is unnecessary: The work does not affect safety, secrets, regulated data, irreversible external state, or another hard-floor domain, and independent adversarial governance would not materially improve the deterministic acceptance checks.
