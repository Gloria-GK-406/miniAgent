# Routing Decision

- TaskContract: `.rks-agent/tasks/refactor-source-layers-before-package-split/TaskContract.md`
- Contract revision: `1`

## SDD Readiness

- Intent and outcome stability: The user has explicitly accepted the four-layer core/engine/extensions/cli model and authorized the pre-package-split refactor.
- Requirement stability: Layer ownership, dependency direction, composition ownership, strict automated checks, compatibility, and the no-actual-package-split boundary are explicit and reviewable.
- Execution direction: Existing imports and source ownership have been inspected; the central work is contract relocation, implementation relocation, composition relocation, public entry points, and dependency enforcement.
- Remaining uncertainty: Only local file organization and compatible adapter details remain; they do not change the accepted architecture or observable outcome.

## Marginal Control Value

- User precision signal: The user requested a deliberate pre-split refactor and strict ESLint-like dependency enforcement rather than a quick directory rename.
- Direct failure mode: A large mechanical move can easily leave type-only reverse edges, product assembly in core, deep-import bypasses, or compatibility regressions that are hard to notice from ordinary tests.
- Useful control: One complete Spec, an implementation plan, full-result review, and fresh dependency/build/test verification protect the architectural boundary and public behavior.
- Time-for-quality rationale: The work defines future package boundaries; omissions would force another architectural migration during the actual split, so the modest workflow overhead prevents consequential rework.

## Structural Selection

- Selected workflow: `single-spec-workflow`
- Boundary evidence: All changes contribute to one indivisible acceptance result: a single-package source tree whose four layers already obey the future package graph. Partial layer migrations are not independently acceptable.
- Why Direct is insufficient: Direct execution lacks a durable complete-boundary review against all relocation, compatibility, and enforcement requirements.
- Why Multi is unnecessary: Engine, extensions, core contracts, CLI assembly, and lint rules must land together to form one valid dependency graph and rollback boundary.
- Reroute conditions: Reroute only if implementation evidence shows an independently acceptable package or compatibility outcome that must be accepted or rolled back separately, or if preserving a supported API contradicts the approved layer boundary.

## Controller Selection

- Controller: `sdd-standard`
- Profile source: `standard-default`
- Why this is sufficient: A durable dependency-ordered plan plus complete-result review protects contract relocation, implementation moves, composition relocation, compatibility entry points, and enforcement sequencing.
- Why lighter is insufficient: Lite lacks a persisted plan; moving implementation directories before relocating their contracts would create widespread transient reverse dependencies and increase consequential rework.
- Why heavier is unnecessary: The task has no safety, security, data-loss, external-mutation, or compliance hard floor, and ordinary review plus fresh deterministic dependency/build/test verification is sufficient.
