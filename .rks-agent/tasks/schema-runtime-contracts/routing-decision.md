# Routing Decision

- TaskContract: `.rks-agent/tasks/schema-runtime-contracts/TaskContract.md`
- Contract revision: `1`

## SDD Readiness

- Intent and outcome stability: The user explicitly authorized a second refactor and narrowed it to Schema-related behavior only; T8 lifecycle and T9 capability registration are excluded.
- Requirement stability: The agreed requirements cover Schema classification, identity-preserving protocols, removal of asserted and predicate-free fake Schemas, detector and runtime protection, tool parameter validation, and Schema-specific documentation/release checks.
- Execution direction: The central direction is known: establish the Schema primitives and categories first, migrate consumers, then harden detection and verify public-package behavior.
- Remaining uncertainty: Only local implementation choices such as exact factory typing, file placement, and test organization remain.

## Marginal Control Value

- User precision signal: The user requested another deliberate refactoring pass after reviewing a detailed T1-T10 diagnosis and explicitly constrained its scope.
- Direct failure mode: A direct edit can repeat the 0.9.1 failure by satisfying export syntax while missing runtime identity, invalid-input rejection, CLI variants, generic factories, or package-consumer behavior.
- Useful control: One durable Spec, an explicit dependency-ordered Plan, complete-result code review, and fresh verification keep the runtime and static definitions aligned across core, CLI, scripts, tests, docs, and packaging.
- Time-for-quality rationale: An early protocol or generic-Schema mistake would propagate through many exported contracts and create large rework; resolving and reviewing the shared rules before broad migration is cheaper than correcting the full tree afterward.

## Structural Selection

- Selected workflow: `single-spec-workflow`
- Boundary evidence: All changes contribute to one externally observable outcome: public Schemas must be authoritative executable contracts. Partial delivery would leave the same false schema-first guarantee.
- Why Direct is insufficient: Direct work lacks the durable mapping needed to prove every Schema category, migration class, enforcement path, and consumer check was covered together.
- Why Multi is unnecessary: The detector, runtime migrations, tool validation, tests, and docs are mutually dependent parts of one release-level acceptance boundary rather than independently acceptable outcomes.
- Reroute conditions: Reroute only if implementation reveals an independently releasable outcome with separate acceptance/rollback needs, or if repository reality invalidates the agreed Schema taxonomy.

## Controller Selection

- Controller: `sdd-standard`
- Profile source: `code-bugfix`
- Why this is sufficient: Standard adds the dependency-ordered Plan needed to settle shared Schema primitives before widespread migrations, followed by ordinary complete-result review and fresh verification.
- Why lighter is insufficient: Lite would defer coupled choices about protocol identity, generic factories, tool parameter output typing, and detector exceptions into implementation, allowing a wrong early choice to spread widely before review.
- Why heavier is unnecessary: The task does not touch credentials, authorization policy, protected data, irreversible external mutations, or another high-consequence boundary requiring independent adversarial approval or drift governance.
