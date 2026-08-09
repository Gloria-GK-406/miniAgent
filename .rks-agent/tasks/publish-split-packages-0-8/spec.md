---
kind: rks-spec
contract:
  path: ./TaskContract.md
  revision: 1
state: ready
---

# Specification: Publish split MiniAgent 0.8 packages

## Why and Outcome

MiniAgent's public framework layers must be consumable as three independently installable npm packages rather than as subpaths of the legacy aggregate package. Version 0.8.0 must be released through the repository's trusted CI path, with dependency-safe and retry-safe publication, and must be proven usable both before publication as packed artifacts and after publication from the real npm Registry.

## Task Perspective

- Core outcome: Consumers can install and use the three exact MiniAgent 0.8.0 framework packages from npm, with engine and extensions automatically bringing in core as a normal runtime dependency.
- Necessary support: The packages expose the intended public roots and subpaths, contain complete runtime and type artifacts without CLI or repository-relative cross-package references, preserve a bounded and peer-clean one-way dependency graph, and publish only accepted artifacts from one serialized, frozen release candidate.
- Peripheral assurance: Manifest and archive inspection, clean-consumer runtime and TypeScript checks, repository quality results, independent review, CI run evidence, and authoritative Registry metadata prove the release is complete and usable.

## Scope and Non-Goals

### In Scope

- Three public npm package contracts for MiniAgent core, engine adapters, and optional extensions at version 0.8.0.
- Release artifacts derived from the existing unified source tree without changing the source-layer ownership model.
- Public runtime and type entry points, runtime dependency declarations, package metadata, and distributable file boundaries for each package.
- Prevention of root aggregate and CLI publication.
- CI validation and publication behavior for a first release and any retry after a partial release.
- Pre-publication packed-artifact acceptance, directly related installation/import documentation, and post-publication acceptance against the real npm Registry.

### Non-Goals

- Publishing a CLI package, CLI executable, or version 0.8.0 of `@piaoxianguo/miniagent`.
- Establishing npm workspaces, splitting the repository, or relocating the existing core, engine, extensions, or CLI source layers.
- Publishing any version other than 0.8.0 or changing, deprecating, or deleting the existing `@piaoxianguo/miniagent` 0.7.1 Registry release.
- Adding or changing Agent, model adapter, extension, or CLI product capabilities unrelated to packaging and release.

## Constraints

- All three packages are public ESM npm packages and use the locked version 0.8.0.
- `@piaoxianguo/miniagent-core` has no dependency on another MiniAgent package; engine and extensions each declare core 0.8.0 as a normal runtime dependency; engine and extensions do not depend on one another.
- Publishing is irreversible and may begin only after independent complete-result review, repository quality gates, archive inspection, and clean-consumer acceptance of all three packed artifacts succeed.
- Every Registry mutation targets the exact accepted package candidate, or a candidate that has repeated the full package-contract, archive, and clean-consumer acceptance without changing before publication.
- Registry-mutating runs for version 0.8.0 are serialized, and a partial release may be completed only from the same frozen source revision and accepted artifact set that produced its existing packages.
- Registry mutation uses only the GitHub-hosted CI environment and its already configured npm credential. The credential is not read, printed, copied, or used for local publication.
- A package/version already present on npm is immutable for this workflow and is skipped rather than republished.

## Definitions

| Term | Meaning |
|---|---|
| Package root | The `.` export of one of the three new packages. |
| Declared subpath | A non-root public export explicitly listed in a package contract below. |
| Internal MiniAgent dependency | A dependency from one of the three new packages to another of those packages. |
| Clean consumer | A new project with no repository links, pre-existing MiniAgent installation, or access to unpublished repository files. |
| Partial release | A Registry state in which at least one but not all of the three 0.8.0 packages already exists. |
| Frozen release candidate | One immutable set of three jointly accepted package artifacts associated with one source revision and one content identity per artifact. |

## External Behavior and Data Rules

| Package | Version | Public exports | Required runtime dependencies | Forbidden package content or dependencies |
|---|---|---|---|---|
| `@piaoxianguo/miniagent-core` | `0.8.0` | Package root with ESM runtime and TypeScript declarations for the current core public API | `zod` `^3.25.28`, `eventemitter3` `^5.0.4`; no internal MiniAgent dependency | CLI runtime, CLI executable metadata, engine or extensions artifacts, tests, and repository-only files |
| `@piaoxianguo/miniagent-engine` | `0.8.0` | Package root plus `./anthropic`, `./openai`, `./openai-compatible`, `./glm`, `./glm-codeplan`, and `./nvidia`, each with ESM runtime and TypeScript declarations matching its current public API | `@piaoxianguo/miniagent-core` `0.8.0`, `@anthropic-ai/sdk` `^0.82.0`, `openai` `^6.33.0`, `zod-to-json-schema` `^3.25.2`, `zod` `^3.25.28` | CLI or extensions artifacts, tests, repository-only files, and any dependency on extensions |
| `@piaoxianguo/miniagent-extensions` | `0.8.0` | Package root plus `./mcp`, `./skill`, and `./subagent`, each with ESM runtime and TypeScript declarations matching its current public API | `@piaoxianguo/miniagent-core` `0.8.0`, `zod` `^3.25.28`, `json5` `^2.2.3`, `yaml` `^2.8.3`, `@modelcontextprotocol/sdk` `^1.29.0` | CLI or engine artifacts, tests, repository-only files, and any dependency on engine |

- Every export target must exist in the package archive and must resolve without access to the source repository.
- Published engine and extensions modules must refer to core through `@piaoxianguo/miniagent-core`, never through repository-relative paths that leave their package boundary.
- Runtime dependency declarations must be minimal and complete for all reachable published modules; development-only dependencies are not exposed as consumer runtime requirements.
- Required runtime peers are satisfied by the package that introduces them rather than delegated to the consumer: engine's direct `zod` range satisfies `zod-to-json-schema`'s required `^3.25.28 || ^4` peer and the compatible optional Zod peers of the selected OpenAI and Anthropic SDK ranges; extensions' direct `zod` range satisfies the selected MCP SDK range's required `^3.25 || ^4.0` peer. Optional upstream peers remain optional unless a published MiniAgent entry requires them.
- A clean installation resolves a peer-valid dependency graph with one compatible Zod resolution for core, engine, extensions, and their selected SDK dependencies; it has no unmet, invalid, or incompatible duplicate critical peer.
- Each archive contains only the runtime, declaration, map, license, readme, and package metadata material needed to consume that package's declared exports.
- The repository's directly related installation and import guidance names the three new packages and does not present the legacy aggregate package or CLI as the 0.8.0 installation route.

## Observable Requirements

| ID | Requirement |
|---|---|
| RQ-001 | The release produces exactly the three package contracts declared above, all public and all at version 0.8.0. |
| RQ-002 | The core package exposes its package root with working ESM runtime and TypeScript declarations, contains its complete minimal runtime dependencies, and has no internal MiniAgent dependency. |
| RQ-003 | The engine package exposes its package root and all six declared adapter subpaths with working ESM runtime and TypeScript declarations. |
| RQ-004 | Installing the engine package makes core 0.8.0 available automatically through a normal runtime dependency, while engine has no dependency on extensions. |
| RQ-005 | The extensions package exposes its package root and all three declared subpaths with working ESM runtime and TypeScript declarations. |
| RQ-006 | Installing the extensions package makes core 0.8.0 available automatically through a normal runtime dependency, while extensions has no dependency on engine. |
| RQ-007 | Each package archive contains its complete declared public surface and required metadata while excluding CLI artifacts, undeclared layers, tests, and repository-only material; engine and extensions contain no repository-relative reference to core outside their package boundaries. |
| RQ-008 | The repository release state identifies 0.8.0 as the current source release while making the root aggregate package non-publishable and providing no 0.8.0 CLI or aggregate-package publication route. |
| RQ-009 | CI publishes only the three new packages on an eligible master-branch push and only after all repository quality, package-contract, packed-artifact consumer, and independent-review gates have succeeded; pull requests perform validation without publishing. |
| RQ-010 | Publication makes core available before attempting engine or extensions, so every newly published dependent has its declared core version available from npm. |
| RQ-011 | CI evaluates Registry existence independently for each exact package/version, skips every package already present, continues with missing packages when dependencies are satisfied, and succeeds without attempting an overwrite in every valid partial-release state. |
| RQ-012 | Before publication, all three packed artifacts can be installed together in a clean consumer and every declared root and subpath can be imported at runtime and resolved by TypeScript. |
| RQ-013 | Directly related English and Chinese consumer guidance uses the new package names for installation and imports and accurately explains that engine and extensions install core automatically. |
| RQ-014 | After CI publication, authoritative npm Registry metadata reports all three exact 0.8.0 releases, and a clean consumer can install engine and extensions without explicitly requesting core, observe core 0.8.0 as an installed dependency, import every declared root and subpath at runtime, and resolve them with TypeScript. |
| RQ-015 | No local workflow reads, displays, transfers, or uses the npm credential; Registry publication uses only the configured GitHub CI secret. |
| RQ-016 | Every external runtime dependency uses the bounded source-grounded range declared above, every required peer is satisfied by the package that introduces it, and a clean installation is peer-valid with a compatible shared Zod resolution. |
| RQ-017 | Each package publication consumes the exact candidate that passed package acceptance, unless the complete package-contract, archive, and clean-consumer acceptance is repeated against the exact unchanged candidate immediately eligible for publication. |
| RQ-018 | Eligible 0.8.0 Registry mutations cannot interleave, and any partial-release retry may publish missing packages only when their source revision and artifact identities belong to the same frozen release candidate as the already published 0.8.0 packages. |

## Acceptance Scenarios

| ID | Covers | Given | When | Then |
|---|---|---|---|---|
| AC-001 | RQ-001, RQ-002, RQ-003, RQ-005, RQ-007, RQ-016 | A validated 0.8.0 release candidate exists for the unified repository source | The three package manifests, export targets, dependency and peer sets, metadata, and archive inventories are inspected | Exactly the declared core, engine, and extensions contracts are present; every target exists; dependency ranges and peer treatment match the declared bounded policy; file inventories are complete and minimal; and forbidden content or references are absent |
| AC-002 | RQ-004, RQ-006 | A clean consumer has access to all three unpublished packed artifacts and no MiniAgent package is already installed | The consumer installs the three artifacts together and the resulting dependency graph is inspected | Engine and extensions each identify core 0.8.0 as a normal runtime dependency, both resolve against the installed core artifact, and neither dependent introduces a horizontal dependency |
| AC-003 | RQ-008, RQ-013 | The repository is prepared as the 0.8.0 source release | A maintainer reviews publication eligibility and the directly related English and Chinese guidance | The source release version is 0.8.0, the root aggregate is non-publishable, no CLI or aggregate 0.8.0 route exists, and examples use the new packages and explain automatic core installation |
| AC-004 | RQ-009, RQ-010, RQ-015 | All three exact versions are absent from npm and an eligible master-branch CI run has started with the configured secret | The validation and publication lifecycle completes | Publication is attempted only after every gate succeeds, core becomes available before either dependent is attempted, only the three new packages are targeted, and the credential remains confined to the publishing environment |
| AC-005 | RQ-009, RQ-015 | A pull-request CI run or a master-branch run with any required gate failing is in progress | CI reaches the publication decision | No Registry publication is attempted and no npm credential is exposed |
| AC-006 | RQ-011, RQ-018 | Any valid Registry state contains none, one, two, or all three exact 0.8.0 package versions, with every present dependent accompanied by core and attributable to one frozen release candidate | A serialized publication or retry from that same candidate evaluates the state | Every existing version is skipped, every missing version is attempted only after core is available, no overwrite is attempted, and the run can complete with all three versions from the same candidate present |
| AC-007 | RQ-011 | A partial-release retry encounters a failure while determining whether an exact package/version exists | CI cannot establish that the package is absent | CI fails safely without treating the lookup failure as permission to publish that package |
| AC-008 | RQ-012, RQ-016 | A clean consumer has only the three pre-publication archives available | The consumer installs all three archives with strict peer validation, inspects the resulting dependency graph, and exercises every package root and declared subpath through Node and TypeScript | Installation is peer-clean with one compatible Zod resolution, all runtime imports expose their intended public APIs, and all declarations resolve without repository access |
| AC-009 | RQ-004, RQ-006, RQ-014 | CI reports successful publication and the consumer has no MiniAgent package or repository link | The consumer requests engine 0.8.0 and extensions 0.8.0 from the real npm Registry without explicitly requesting core | npm installs core 0.8.0 automatically and the resulting dependency graph contains only the allowed internal direction |
| AC-010 | RQ-014 | All three releases are reported present by authoritative npm Registry metadata | A clean consumer exercises every declared root and subpath through Node and TypeScript | Every runtime import and type resolution succeeds using only Registry-installed packages |
| AC-011 | RQ-009, RQ-012 | The complete 0.8.0 change is ready for the irreversible publication boundary | Repository quality results, package acceptance results, and an independent complete-result review are evaluated | Publication remains disabled unless all evidence is current and successful |
| AC-012 | RQ-017 | A package candidate has passed every required pre-publication acceptance gate | The candidate selected for Registry mutation is compared with the accepted candidate, including after any regeneration, transfer, or perturbation | Publication is allowed only for the identical accepted candidate or after the full acceptance suite has succeeded against that exact unchanged candidate; any unaccepted difference blocks publication |
| AC-013 | RQ-011, RQ-018 | Two eligible 0.8.0 runs from different source revisions overlap, or a later revision encounters a partial release produced by an earlier candidate | Both runs seek Registry-mutation eligibility or the later run evaluates the existing versions | At most one run can mutate the Registry at a time, and the later candidate cannot publish missing siblings into the earlier candidate's partial release |

## Success Evidence

| ID | Requirements | Scenarios | Evidence class |
|---|---|---|---|
| EV-001 | RQ-001, RQ-002, RQ-003, RQ-005, RQ-007, RQ-016 | AC-001 | Validated manifests, resolvable export inventory, bounded runtime dependency and peer-policy inventory, and packed-archive content reports for all three packages |
| EV-002 | RQ-004, RQ-006 | AC-002 | Clean-consumer dependency tree and successful runtime/type results showing normal core dependency resolution and no horizontal MiniAgent dependency |
| EV-003 | RQ-008, RQ-013 | AC-003 | Release metadata, aggregate publication protection, and bilingual installation/import documentation review |
| EV-004 | RQ-009, RQ-010, RQ-015 | AC-004, AC-005 | CI policy tests and inspected workflow behavior covering event eligibility, gate enforcement, target allowlist, core-first ordering, and secret confinement |
| EV-005 | RQ-011 | AC-006, AC-007 | Automated publication-state coverage for fresh, partially complete, fully complete, and indeterminate Registry lookup outcomes |
| EV-006 | RQ-012, RQ-016 | AC-008 | Fresh strict-peer clean-consumer installation and dependency-tree record plus Node runtime import and TypeScript resolution results for every packed root and declared subpath |
| EV-007 | RQ-009, RQ-012 | AC-011 | Fresh repository lint, build, complete-test, package-acceptance results and an approved independent complete-result review |
| EV-008 | RQ-004, RQ-006, RQ-014 | AC-009, AC-010 | Successful GitHub publication run, authoritative npm Registry metadata for all three 0.8.0 versions, clean Registry-consumer dependency tree, runtime import results, and TypeScript resolution results |
| EV-009 | RQ-015 | AC-004, AC-005 | Review evidence that credential access is confined to GitHub's publishing environment and absent from local outputs and artifacts |
| EV-010 | RQ-017 | AC-012 | Candidate identity trace from package acceptance to Registry mutation, plus mutation-resistance evidence showing that a changed or independently regenerated unaccepted candidate is blocked |
| EV-011 | RQ-011, RQ-018 | AC-006, AC-013 | Concurrency and partial-retry state coverage proving serialized mutation and common source/artifact identity across all published 0.8.0 packages |
