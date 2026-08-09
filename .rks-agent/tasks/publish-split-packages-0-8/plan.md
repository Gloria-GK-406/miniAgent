---
kind: rks-plan
spec:
  path: ./spec.md
state: ready
---

# Implementation Plan: Publish split MiniAgent 0.8 packages

## Implementation Approach

Keep the unified `src/` ownership model and make packaging a deterministic projection of the normal TypeScript build under exactly Node 22.22.0 and npm 10.9.4. The earliest core-outcome task creates one frozen candidate containing exactly three package directories and their packed tarballs: core is projected from `dist/core`, engine from `dist/engine`, and extensions from `dist/extensions`; engine and extensions emitted runtime/declaration imports are rewritten to the public core package, and source maps are normalized so no repository-relative cross-package path survives. One canonical contract drives generated manifests, exports, dependency ranges, inventories, acceptance, and publication allowlists so those representations cannot drift. A joint candidate ID, derived from the source revision, contract, and all three normalized pre-pack trees, is embedded as Registry-visible metadata in every package manifest before final tarball identities are calculated.

Automated acceptance then inspects the candidate and installs its exact tarballs in a fresh strict-peer consumer, exercising every runtime and type entry. Repository metadata and bilingual guidance are updated only after that first usable slice. CI obtains or generates and fully accepts one candidate in the publication job, records source revision, joint candidate ID, and SHA-512 identities, uploads the exact manifest/tarballs as a non-secret run artifact before mutation, serializes all 0.8.0 mutations, recognizes absence only from an authoritative 404, compares every present Registry package's integrity and joint candidate ID, publishes core before missing dependents, and always publishes the retained accepted `.tgz` with provenance. Implementation and local gates remain uncommitted through drift alignment, configured change-adversarial/final-review, and fresh pre-mutation verification; the workspace controller then creates the one accepted-result commit. Only afterward does the authorized root/closeout controller select the configured ADMIN GitHub identity, fast-forward local `master`, push, monitor CI, download the retained candidate, and complete Registry smoke/evidence. No Registry mutation occurs before the accepted commit, and external closeout only verifies the published candidate rather than altering it.

## Owned Boundaries

| ID | Owned path or interface | Change intent | Inputs | Outputs |
|---|---|---|---|---|
| BD-001 | `scripts/release/package-contract.mjs`, `scripts/release/toolchain.json`, `scripts/build-release-packages.mjs`, generated `.release/candidate/` | Bind Node 22.22.0/npm 10.9.4, define the single three-package contract, and deterministically project built artifacts, manifests, normalized imports/maps, a joint candidate ID, inventories, tarballs, source revision, and SHA-512 identities without changing `src/` ownership. | Existing `dist/core`, `dist/engine`, `dist/extensions`, root metadata, `LICENSE`, readmes, and Git revision. | Exactly three public 0.8.0 candidate directories/tarballs plus a machine-readable frozen-candidate manifest and common Registry-visible candidate identity. |
| BD-002 | `scripts/verify-release-packages.mjs`, `scripts/registry-smoke.mjs`, `scripts/release-packages.test.mjs` | Automate contract, forbidden-content/reference, deterministic identity, clean-tarball consumer, peer graph, runtime import, type resolution, publication-state, and Registry-consumer checks. | Canonical contract, candidate manifest/tarballs, injectable Registry responses, and real Registry metadata for post-release mode. | Fail-closed local/CI acceptance and post-publication evidence for every public root/subpath. |
| BD-003 | `package.json`, `package-lock.json` | Mark the unified root as the private 0.8.0 source release, align source-grounded dependency ranges, and expose build/verify/state-test/Registry-smoke commands without an aggregate or CLI publish route. | Approved versions and repository command conventions. | Locked 0.8.0 release metadata and reproducible npm scripts/dependency graph. |
| BD-004 | `scripts/publish-release-packages.mjs` | Enforce exact archive plus joint-candidate identity, safe per-package Registry lookup, core-first provenance publication, skip/retry semantics, and same-candidate partial-release continuity. | Retained frozen-candidate manifest/tarballs, public npm metadata, and a publish-only step credential. | A fail-closed release decision and ordered provenance publication of only missing, identity-compatible tarballs. |
| BD-005 | `README.md`, `README_CN.md` | Replace directly related installation/import guidance with the split packages and explain automatic core installation and the absence of a 0.8 CLI/aggregate release route. | Final package names and exports. | Accurate English and Chinese 0.8 consumer guidance. |
| BD-006 | `.github/workflows/ci.yml` | Separate validation from mutation, gate mutation on accepted checks, bind the packing toolchain, serialize version mutations, persist/recover/reaccept one non-secret candidate artifact, retain trusted provenance permissions, and confine `NPM_TOKEN` to the exact publish step. | Repository scripts, master push/PR context, GitHub artifact storage, and existing npm secret. | PR validation-only behavior and master-only, retained-candidate, retry-safe three-package provenance publication. |
| BD-007 | `.rks-agent/tasks/publish-split-packages-0-8/reviews/drift-review.md`, `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-challenges.md`, `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-review.md`, and the accepted-result Git commit | Keep implementation uncommitted through configured drift/challenge/review, bind fresh pre-mutation verification to the approved result, and assign the sole accepted commit to the workspace controller. | Complete uncommitted diff, Spec, Plan, fresh checks, and adversarial cases. | Aligned drift evidence, configured approved/rejected complete-result evidence, and one controller-created accepted commit eligible for authorized integration. |
| BD-008 | GitHub Actions candidate artifact/run record, npm package-version/provenance metadata, `.rks-agent/tasks/publish-split-packages-0-8/verification/completion-evidence.md`, and `.rks-agent/tasks/publish-split-packages-0-8/spec-result.md` | Preserve the exact accepted candidate before mutation, record fresh pre-mutation verification, and let the authorized root/closeout controller prove and close the irreversible release without changing its candidate. | Accepted commit/master SHA, serialized workflow, retained non-secret candidate, and authoritative Registry. | Downloadable manifest/tarballs keyed by run/SHA, traceable CI result, three exact 0.8.0 Registry identities/provenance attestations, runtime/type/dependency smoke, completion evidence, and final task result. |

## Ordered Tasks

### T-001: Generate one deterministic three-package release candidate

- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006, RQ-007, RQ-016, RQ-017
- Boundaries: BD-001, BD-003
- Inputs: Approved package/export/dependency table, current public barrel files, compiled `dist/`, root metadata, license/readmes, and current Git SHA.
- Outputs: One `.release/candidate/manifest.json`, three minimal package trees carrying one common candidate ID, and three exact `.tgz` files with recorded SHA-512 SRI identities.

#### Steps

1. Add a frozen canonical contract containing exactly `@piaoxianguo/miniagent-core`, `@piaoxianguo/miniagent-engine`, and `@piaoxianguo/miniagent-extensions`, version `0.8.0`, their declared exports, exact internal dependency direction, bounded external runtime ranges, public access, allowed file classes, and forbidden layers. Add a checked-in toolchain contract requiring exactly Node 22.22.0 and npm 10.9.4 for packing, and make generation fail on another version.
2. Implement an idempotent generator that removes only `.release/candidate`, projects core/engine/extensions build outputs into package-local `dist/` roots, copies required license/readme metadata, synthesizes manifests from the contract, and never includes CLI, tests, repository configuration, or another package layer.
3. Rewrite every generated engine/extensions `.js` and `.d.ts` core reference to `@piaoxianguo/miniagent-core`; normalize their `.js.map` and `.d.ts.map` source references; reject any generated reference that escapes its package or mentions a repository-relative core path. Do not rewrite unified source files.
4. Hash the source revision, canonical contract, and all three normalized package trees before the candidate marker is added to derive one joint candidate ID; write `miniagentRelease: { sourceRevision, candidateId }` into every generated `package.json` so `npm view` exposes it, then pack. Enumerate each archive, compute SHA-512 SRI over its exact bytes, and bind the three final identities back to the joint ID in the frozen manifest. Provide deterministic-check mode that generates in two isolated temporary roots under the exact toolchain and proves equal manifests, trees, candidate IDs, and tarball identities.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-001 | `npm run release:toolchain && npm run build && npm run release:build -- --verify-determinism` | Exact Node 22.22.0/npm 10.9.4 is enforced; two isolated projections yield byte-identical three-package candidates and tarballs, with package-local/public-core references only. |
| CK-002 | `node -e "const c=require('./.release/candidate/manifest.json'); const ids=new Set(c.packages.map(p=>p.candidateId)); if(c.packages.length!==3||new Set(c.packages.map(p=>p.name)).size!==3||ids.size!==1||!ids.has(c.candidateId)) process.exit(1)"` | The frozen manifest identifies exactly three approved names, one common candidate ID/source revision and no aggregate or CLI artifact. |

### T-002: Prove package contracts and clean packed-artifact consumption

- Depends on: T-001
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006, RQ-007, RQ-012, RQ-016, RQ-017
- Boundaries: BD-001, BD-002, BD-003
- Inputs: Exact candidate tarballs/manifest and canonical contract.
- Outputs: Automated manifest/archive reports, strict-peer dependency evidence, runtime results, and TypeScript resolution results for all twelve public entries.

#### Steps

1. Make the verifier recalculate every tarball identity and inspect `npm pack --json`/tar inventory plus embedded manifest/export targets, failing on missing targets/metadata, extra layers, CLI/bin/tests/repository-only files, undeclared dependencies, peer leakage, horizontal MiniAgent dependencies, or escaping references.
2. In a newly created temporary project with no repository links or prior MiniAgent packages, install the three exact `.tgz` paths together using `npm install --strict-peer-deps`; inspect `npm ls --all --json` to prove engine/extensions depend normally on core 0.8.0, no horizontal dependency exists, required SDK peers are valid, and all critical Zod edges resolve to one compatible installation.
3. Generate consumer `.mjs` and strict NodeNext `.ts` probes from the canonical export list. Runtime-import and typecheck all twelve entries—the core root; engine root and six adapters; extensions root and three subpaths—using only the installed archives.
4. Add isolated automated policy cases for malformed manifests, absent exports, forbidden inventory/references, wrong dependency ranges, invalid peers, missing/mismatched Registry-visible joint candidate markers, changed tarballs after acceptance, and an independently regenerated/unaccepted candidate.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-003 | `npm run release:test` | Contract and negative policy cases pass, including changed-candidate rejection and the exact RQ-001…RQ-007/RQ-016 package rules. |
| CK-004 | `npm run release:verify -- --candidate .release/candidate/manifest.json` | All three exact archives pass inventory/identity checks, strict clean installation, dependency-tree/peer assertions, twelve Node imports, and twelve TypeScript resolutions with no repository access. |

### T-003: Lock the private source release and update bilingual consumer guidance

- Depends on: T-002
- Covers: RQ-008, RQ-013, RQ-016
- Boundaries: BD-003, BD-005
- Inputs: Accepted split-package names/exports and root dependency metadata.
- Outputs: Private 0.8.0 unified source metadata, synchronized lockfile, and accurate English/Chinese package guidance.

#### Steps

1. Set root `package.json` to version `0.8.0` and `private: true`, declare `packageManager: npm@10.9.4` and the exact release packing Node version, remove/disable aggregate publication hooks/configuration, preserve local CLI development behavior, and ensure no workflow/script can publish the root or a CLI package.
2. Set the root's directly used runtime dependency ranges at least to the approved package ranges (including `zod` `^3.25.28`) and regenerate `package-lock.json` without changing unrelated capabilities.
3. Update all directly related install/import examples in both readmes to use the three packages and declared subpaths; state that engine/extensions install core automatically and that neither an aggregate nor CLI package is released at 0.8.0.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-005 | `npm install --package-lock-only && npm ci && node -e "const p=require('./package.json'); if(p.version!=='0.8.0'||p.private!==true||p.publishConfig||p.scripts?.prepublishOnly) process.exit(1)"` | Lockfile is reproducible, the source release is 0.8.0/private, and the aggregate has no npm publication hook/configuration. |
| CK-006 | `npm run release:test -- --docs` | English and Chinese guidance contains every new package/subpath used in examples, explains automatic core installation, and exposes no 0.8 aggregate/CLI installation route. |

### T-004: Implement fail-closed, identity-bound publication policy

- Depends on: T-002
- Covers: RQ-009, RQ-010, RQ-011, RQ-015, RQ-017, RQ-018
- Boundaries: BD-002, BD-004
- Inputs: Retained frozen-candidate manifest/tarballs, npm packuments, and injectable publish operation.
- Outputs: Tested eligibility/state machine that either publishes approved missing tarballs in dependency order or performs no mutation.

#### Steps

1. Implement an exact npm packument lookup at the Registry's URL-encoded scoped-package/version endpoint with bounded retry: only a confirmed 404 means absent; 401/403, 429, 5xx, malformed/timeout/network responses fail closed and never authorize publication.
2. For each present version, compare authoritative `dist.integrity`, `miniagentRelease.sourceRevision`, and `miniagentRelease.candidateId` with the retained frozen manifest. Skip only an identical archive from the same joint candidate; reject any absent/mismatched marker, differing identity, present dependent without core, or partial state not attributable to the complete retained three-artifact set. Explicitly test candidate A/B where core bytes match but a sibling differs.
3. Process core, then engine, then extensions. After publishing core's accepted `.tgz` with the argv form `npm publish` plus the exact accepted tarball path, `--provenance`, and `--access public`, poll until the expected integrity and joint ID are visible before dependent attempts; publish only missing retained accepted tarball paths, never package directories or regenerated archives. A retry after an ambiguous publish outcome must re-query and either identity-skip or fail.
4. Keep lookup/decision/test execution credential-free; accept npm authentication only in the final CI publication process environment and never log environment values, npm configuration, or secret-bearing commands.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-007 | `npm run release:test -- --publication-policy` | Fixtures pass for all valid none/one/two/all-present states, same-core/different-sibling candidates, common-marker mismatch, core-first waits, idempotent retry, foreign identities, invalid dependency states, candidate perturbation, provenance argv, and every indeterminate lookup class. |
| CK-008 | `env -u NODE_AUTH_TOKEN npm run release:publish -- --candidate .release/candidate/manifest.json --dry-run --registry-fixture scripts/fixtures/registry-none.json` | Dry run targets only the three retained accepted tarballs in core-first `npm publish … --provenance --access public` order and neither needs nor prints an npm credential. |

### T-005: Make CI retain and serialize the exact master publication candidate

- Depends on: T-003, T-004
- Covers: RQ-009, RQ-010, RQ-011, RQ-012, RQ-015, RQ-017, RQ-018
- Boundaries: BD-006
- Inputs: Repository gates, exact toolchain, candidate generator/verifier/publisher, GitHub artifact storage, and master push context.
- Outputs: Validation-only pull requests and one serialized, retained-candidate master release path with provenance.

#### Steps

1. Retain Node 20/22 repository quality checks and add package contract/archive/consumer policy checks to PR and master validation, with publication depending on every required job; only a push to `master` can mutate.
2. Give the publish job the fixed `miniagent-npm-0.8.0` concurrency group with `cancel-in-progress: false` and explicit least privileges `contents: read`, `actions: read` (candidate recovery only), and `id-token: write`; add no pull-request/check/status API permissions.
3. Pin packing to `actions/setup-node` Node 22.22.0 plus npm 10.9.4 and assert both versions. On an initial attempt, build/generate once and run complete contract/archive/strict-peer clean-consumer acceptance. On a retry of the same run/SHA, first download the original `miniagent-0.8.0-candidate-${GITHUB_SHA}-${GITHUB_RUN_ID}` artifact and repeat complete acceptance against those exact bytes; only if it is unavailable may the job reproduce under the exact pinned toolchain, and any failure to match a present package's joint candidate ID and identity stops closed.
4. On the initial attempt and before the first Registry lookup or publish mutation, upload one non-secret artifact containing `manifest.json` and all three exact accepted tarballs, validate that no credential/config is present, and record its run ID, attempt, SHA, joint candidate ID, and per-tarball SRI. A retry treats the already uploaded/downloaded artifact as authoritative. Re-hash/reaccept that retained set and use only it for in-job publication and Registry smoke; do not regenerate or substitute files.
5. Scope `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the single publication step, retain the exact accepted-tarball argv ending in `--provenance --access public`, keep PRs/lookups/tests/artifacts/logs/local commands credential-free, and limit targets through the canonical allowlist.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-009 | `npm run release:test -- --workflow` | Parser/policy tests prove PRs cannot mutate, master publication needs all gates, concurrency is fixed/non-cancelling, permissions are exactly the used read scopes plus OIDC, Node/npm are exact, `NPM_TOKEN` is step-scoped, and accepted `.tgz` publication includes provenance. |
| CK-010 | `npm run release:test -- --workflow-artifact` | Workflow ordering proves retry recovery precedes fallback generation, complete reacceptance precedes upload, upload succeeds before the first mutation, and the same hashed record feeds publication plus in-job Registry smoke; simulated runner loss is recoverable by run ID/SHA. |

### T-006: Complete implementation, local gates, and drift evidence uncommitted

- Depends on: T-005
- Covers: RQ-001, RQ-002, RQ-003, RQ-004, RQ-005, RQ-006, RQ-007, RQ-008, RQ-009, RQ-010, RQ-011, RQ-012, RQ-013, RQ-015, RQ-016, RQ-017, RQ-018
- Boundaries: BD-001, BD-002, BD-003, BD-004, BD-005, BD-006, BD-007
- Inputs: Complete implementation and generated candidate.
- Outputs: A complete uncommitted implementation, fresh repository/package/consumer/workflow evidence, and aligned `.rks-agent/tasks/publish-split-packages-0-8/reviews/drift-review.md` ready for configured downstream review.

#### Steps

1. Start from a clean generated-output state, install strictly from the lockfile, and run the repository's required commit gates in mandated order.
2. Regenerate the release candidate once, run the complete package/policy suite, and preserve the manifest/inventories/test output as review evidence without committing generated archives or credentials.
3. Inspect the diff and generated inventories for unrelated capability changes, secret material, aggregate/CLI publication routes, and mismatch with the Spec's exact package/export/dependency table; run the configured final drift check and record `.rks-agent/tasks/publish-split-packages-0-8/reviews/drift-review.md` while leaving all implementation changes uncommitted for complete-result challenge/review.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-011 | `npm ci && npm run lint && npm run build && npm test` | The lockfile install and mandatory lint, build, and complete test suite all pass in that order. |
| CK-012 | `npm run release:build -- --verify-determinism && npm run release:test && npm run release:verify -- --candidate .release/candidate/manifest.json` | Fresh candidate generation, all policy cases, archive inspection, strict-peer clean install, and every runtime/type entry pass against the exact frozen tarballs. |
| CK-013 | `git diff --check && git status --short` | The complete implementation is still uncommitted, has no whitespace errors, contains only intended implementation/documentation/workflow/lockfile changes, and has no candidate archive or secret staged; configured drift evidence is aligned. |

### T-007: Complete governed review, fresh verification, and controller-owned acceptance commit

- Depends on: T-006
- Covers: RQ-009, RQ-012, RQ-015, RQ-017, RQ-018
- Boundaries: BD-007, BD-008
- Inputs: Ready Spec, executable Plan, complete uncommitted diff, aligned drift evidence, CK-011/CK-012 results, candidate identity report, and configured SDD controller lifecycle.
- Outputs: Configured change challenges, independent approved complete-result review, fresh pre-mutation verification evidence, and exactly one workspace-controller-created accepted-result commit on `codex/publish-split-packages-0-8`.

#### Steps

1. Return the complete uncommitted result to the configured controller: `change-adversarial` writes `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-challenges.md`, then `final-review` independently evaluates that complete result plus `.rks-agent/tasks/publish-split-packages-0-8/reviews/drift-review.md` and writes `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-review.md`, emphasizing archive escape paths, dependency/peer completeness, candidate retention/mutation, common candidate identity, lookup ambiguity, partial/overlapping runs, permissions/provenance, credential scope, and rollback limitations.
2. If `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-review.md` is not approved, do not commit, integrate, or publish; return to implementation, remediate findings, repeat T-006, and rerun the configured challenge/review stages against the still-uncommitted replacement result.
3. After approval, run the configured verification stage fresh against the exact approved uncommitted result: repeat mandatory repository gates, deterministic generation, complete tarball acceptance, workflow/state tests, secret scan, and diff-scope checks; record the pre-mutation checkpoint in `.rks-agent/tasks/publish-split-packages-0-8/verification/completion-evidence.md`. Any failure returns to implementation/review, and no Registry mutation is permitted.
4. Only after fresh verification passes, the workspace controller stages the scoped result, excludes `.release/`, credentials, and unrelated user changes, and creates the single accepted-result commit. Implementation executors do not commit. Bind `.rks-agent/tasks/publish-split-packages-0-8/reviews/change-review.md` and the verification checkpoint to that exact resulting tree/commit; external mutation remains blocked until it exists.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-014 | `Non-command: The configured stages record challenges in .rks-agent/tasks/publish-split-packages-0-8/reviews/change-challenges.md and an approved verdict in .rks-agent/tasks/publish-split-packages-0-8/reviews/change-review.md for the complete uncommitted result and aligned .rks-agent/tasks/publish-split-packages-0-8/reviews/drift-review.md; any adverse verdict returns to implementation before commit.` | Governed evidence is current, independent, complete, path-correct, non-circular, and approved while implementation remains uncommitted. |
| CK-015 | `npm ci && npm run lint && npm run build && npm test && npm run release:build -- --verify-determinism && npm run release:test && npm run release:verify -- --candidate .release/candidate/manifest.json && git diff --check` | Fresh pre-mutation verification passes against the exact reviewed result and is recorded in `.rks-agent/tasks/publish-split-packages-0-8/verification/completion-evidence.md`; no Registry mutation has occurred. |
| CK-019 | `Non-command: After CK-014 and CK-015, the workspace controller stages only the approved scoped result and creates exactly one commit with message "release: prepare split MiniAgent 0.8 packages", then proves its tree equals the freshly verified reviewed tree.` | One controller-owned accepted-result commit exists; implementation did not commit and external release remains unchanged/unstarted. |

### T-008: Authorized root controller integrates, pushes, and monitors publication

- Depends on: T-007
- Covers: RQ-009, RQ-010, RQ-011, RQ-015, RQ-017, RQ-018
- Boundaries: BD-006, BD-007, BD-008
- Inputs: Existing user authorization, controller-created accepted-result commit, clean worktrees, configured `Gloria-GK-406` GitHub identity, and GitHub/npm CI configuration.
- Outputs: Authorized local fast-forward master integration/push and a successful, retained-candidate publication run, or a safely stopped/retryable partial release.

#### Steps

1. Hand off only the accepted commit to the authorized root/closeout controller. Credential-safely inspect configured accounts with `gh auth status` (never `gh auth token`), explicitly select `Gloria-GK-406`, and prove the selected identity is `Gloria-GK-406` with `ADMIN` on `Gloria-GK-406/miniAgent`; failure blocks integration without mutation.
2. Verify the main worktree's `master` still equals the accepted commit's base, fast-forward it locally to `codex/publish-split-packages-0-8`, and push that exact accepted SHA using the selected identity. Do not introduce a separate PR approval/merge requirement. No Registry mutation may have occurred before this accepted commit/push.
3. Monitor the exact pushed SHA's CI run. Confirm gates precede candidate upload and mutation, the concurrency group serializes competing runs, the exact candidate artifact is downloadable by run/SHA, and identities are reported without secrets.
4. On failure before mutation, return through a new governed implementation/review/verification/commit cycle. On ambiguous/partial mutation, rerun the same workflow run/SHA so it first retrieves and reaccepts the retained tarball set; pinned reproduction is fallback only. If retained bytes cannot be recovered and reproduced identities/common marker cannot be proven identical, stop and escalate rather than mixing artifacts.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-016 | `gh auth status --hostname github.com && gh auth switch --hostname github.com --user Gloria-GK-406 && test "$(gh api user --jq .login)" = "Gloria-GK-406" && test "$(gh repo view Gloria-GK-406/miniAgent --json viewerPermission --jq .viewerPermission)" = "ADMIN" && test "$(git -C /Users/puxianguo/project/miniAgent rev-parse master)" = "$(git merge-base master codex/publish-split-packages-0-8)" && git -C /Users/puxianguo/project/miniAgent merge --ff-only codex/publish-split-packages-0-8 && git -C /Users/puxianguo/project/miniAgent push origin master` | Without reading/printing credentials, the authorized ADMIN identity is explicitly selected; local `master` fast-forwards to exactly the controller-accepted commit and that SHA is pushed as the sole release trigger. |
| CK-017 | `RELEASE_SHA="$(git -C /Users/puxianguo/project/miniAgent rev-parse master)"; RUN_ID="$(gh run list --workflow ci.yml --branch master --commit "$RELEASE_SHA" --json databaseId --jq '.[0].databaseId')"; gh run watch "$RUN_ID" --exit-status; rm -rf .release/accepted-run; gh run download "$RUN_ID" --name "miniagent-0.8.0-candidate-${RELEASE_SHA}-${RUN_ID}" --dir .release/accepted-run` | The exact pushed-SHA run succeeds and its pre-mutation non-secret manifest plus three accepted tarballs remain downloadable by run/SHA; failures remain traceable and identity-safe. |

### T-009: Authorized closeout controller verifies Registry and completes evidence

- Depends on: T-008
- Covers: RQ-004, RQ-006, RQ-014, RQ-016, RQ-017, RQ-018
- Boundaries: BD-002, BD-008
- Inputs: Successful exact-SHA publication run, its downloaded pre-mutation frozen manifest/tarballs keyed by run/SHA, and public npm Registry access without credentials.
- Outputs: Authoritative three-version metadata, clean Registry-only runtime/type/dependency acceptance, completed `.rks-agent/tasks/publish-split-packages-0-8/verification/completion-evidence.md`, and final `.rks-agent/tasks/publish-split-packages-0-8/spec-result.md` closeout.

#### Steps

1. The authorized root/closeout controller uses `gh run list` with the accepted master SHA to resolve the run ID, then `gh run download` the named candidate artifact into `.release/accepted-run`; verify its artifact inventory and hashes before using its manifest. Query the authoritative Registry for each exact package/version and compare name, version, public metadata, dependencies, exports, `miniagentRelease` source/joint identity, `dist.integrity`, and provenance attestation with that downloaded CI record.
2. In a new temporary consumer, request only engine 0.8.0 and extensions 0.8.0 with strict peers; prove npm automatically installs core 0.8.0, the internal graph remains one-way, and the critical Zod/SDK peer graph is valid.
3. Runtime-import and TypeScript-resolve all twelve declared roots/subpaths from Registry-installed packages only. The same registry-smoke mode runs in-job against the already uploaded local record and post-run against the downloaded record; attach the run/artifact URL, metadata/provenance, dependency tree, and probe output to `.rks-agent/tasks/publish-split-packages-0-8/verification/completion-evidence.md`, then write `.rks-agent/tasks/publish-split-packages-0-8/spec-result.md` only when every TaskContract condition is satisfied. This closeout is read-only with respect to published package bytes and never regenerates, republishes, or alters the candidate.

#### Validation

| ID | Check | Expected result |
|---|---|---|
| CK-018 | `env -u NODE_AUTH_TOKEN npm run release:registry-smoke -- --version 0.8.0 --candidate .release/accepted-run/manifest.json --require-provenance` | Public metadata exposes all three exact joint-ID/integrity/provenance-matching releases; a fresh Registry-only consumer installing engine/extensions obtains core automatically and passes strict peers, dependency assertions, twelve runtime imports, and twelve TypeScript resolutions; closeout evidence records this without altering the published candidate. |

## Requirement Coverage

| Requirement | Tasks | Boundaries | Evidence |
|---|---|---|---|
| RQ-001 | T-001, T-002, T-006 | BD-001, BD-002, BD-003 | CK-001, CK-002, CK-003, CK-004, CK-011, CK-012 |
| RQ-002 | T-001, T-002, T-006 | BD-001, BD-002, BD-003 | CK-001, CK-003, CK-004, CK-011, CK-012 |
| RQ-003 | T-001, T-002, T-006 | BD-001, BD-002, BD-003 | CK-001, CK-003, CK-004, CK-011, CK-012 |
| RQ-004 | T-001, T-002, T-006, T-009 | BD-001, BD-002, BD-003, BD-008 | CK-003, CK-004, CK-011, CK-012, CK-018 |
| RQ-005 | T-001, T-002, T-006 | BD-001, BD-002, BD-003 | CK-001, CK-003, CK-004, CK-011, CK-012 |
| RQ-006 | T-001, T-002, T-006, T-009 | BD-001, BD-002, BD-003, BD-008 | CK-003, CK-004, CK-011, CK-012, CK-018 |
| RQ-007 | T-001, T-002, T-006 | BD-001, BD-002, BD-003 | CK-001, CK-003, CK-004, CK-011, CK-012 |
| RQ-008 | T-003, T-006 | BD-003, BD-005 | CK-005, CK-006, CK-011, CK-013 |
| RQ-009 | T-004, T-005, T-006, T-007, T-008 | BD-002, BD-004, BD-006, BD-007, BD-008 | CK-007, CK-009, CK-010, CK-011, CK-012, CK-014, CK-015, CK-019, CK-016, CK-017 |
| RQ-010 | T-004, T-005, T-006, T-008 | BD-002, BD-004, BD-006, BD-008 | CK-007, CK-008, CK-009, CK-012, CK-017 |
| RQ-011 | T-004, T-005, T-006, T-008 | BD-002, BD-004, BD-006, BD-008 | CK-002, CK-007, CK-008, CK-009, CK-010, CK-012, CK-017 |
| RQ-012 | T-002, T-005, T-006, T-007 | BD-001, BD-002, BD-003, BD-006, BD-007, BD-008 | CK-004, CK-009, CK-011, CK-012, CK-014, CK-015, CK-019 |
| RQ-013 | T-003, T-006 | BD-003, BD-005 | CK-005, CK-006, CK-011, CK-013 |
| RQ-014 | T-009 | BD-002, BD-008 | CK-017, CK-018 |
| RQ-015 | T-004, T-005, T-006, T-007, T-008 | BD-002, BD-004, BD-006, BD-007, BD-008 | CK-007, CK-008, CK-009, CK-010, CK-011, CK-013, CK-014, CK-015, CK-019, CK-016, CK-017, CK-018 |
| RQ-016 | T-001, T-002, T-003, T-006, T-009 | BD-001, BD-002, BD-003, BD-005, BD-008 | CK-001, CK-003, CK-004, CK-005, CK-011, CK-012, CK-018 |
| RQ-017 | T-001, T-002, T-004, T-005, T-006, T-007, T-008, T-009 | BD-001, BD-002, BD-003, BD-004, BD-006, BD-007, BD-008 | CK-001, CK-002, CK-003, CK-004, CK-007, CK-008, CK-009, CK-010, CK-012, CK-014, CK-015, CK-019, CK-017, CK-018 |
| RQ-018 | T-004, T-005, T-006, T-007, T-008, T-009 | BD-001, BD-002, BD-004, BD-006, BD-007, BD-008 | CK-002, CK-007, CK-009, CK-010, CK-012, CK-014, CK-015, CK-019, CK-017, CK-018 |

## Risks and Rollback

- Risk: Generated imports, declarations, or maps can silently retain repository-relative core paths. Mitigation: rewrite only generated package outputs, scan every archive text entry, and prove consumption from a repository-isolated directory. Rollback: discard `.release/candidate` and revert only BD-001/BD-002 changes; unified `src/` remains untouched.
- Risk: Root metadata changes could accidentally publish the aggregate/CLI or perturb unrelated CLI development. Mitigation: `private: true`, remove root publish hooks/config, exact three-name allowlists, and retain repository build/test coverage. Rollback: before Registry mutation, revert BD-003/BD-005 and regenerate the lockfile.
- Risk: `npm pack` regeneration, toolchain drift, artifact transfer, or a later commit can change bytes after acceptance. Mitigation: assert Node 22.22.0/npm 10.9.4, persist the accepted manifest/tarballs before mutation, reaccept after retrieval/transfer, publish those exact bytes, and use pinned reproduction only when retained bytes are unavailable. Rollback: before mutation, discard/rebuild and repeat complete acceptance; after any package exists, recover the retained candidate or prove a byte-identical pinned reproduction, otherwise stop closed.
- Risk: Two master runs or a partial failure can create mixed 0.8.0 siblings even when core source is unchanged. Mitigation: fixed non-cancelling concurrency plus a Registry-visible joint candidate ID derived from all three trees, per-package integrity/source comparison, retained full-set record, and core-first visibility. Rollback: npm versions cannot be overwritten or deleted by this workflow; stop on foreign/missing common identity and retrieve the original run artifact rather than publishing a sibling from another candidate.
- Risk: Registry outage can look like absence and cause an overwrite attempt. Mitigation: only authoritative 404 authorizes publication; all other failures retry boundedly then fail closed. Rollback: no mutation occurs on indeterminate state; rerun the same candidate after Registry recovery.
- Risk: Publication is irreversible and local credentials could leak. Mitigation: all local and validation commands explicitly omit `NODE_AUTH_TOKEN`; the configured npm secret exists only on the final GitHub step and scripts never print environment/config. Rollback: revoke/rotate the CI secret through repository administration if exposure is detected, cancel pending jobs, and do not resume until reviewed; published versions remain immutable.
- Risk: The CI publish command may fail after npm accepted an archive. Mitigation: treat the result as ambiguous, query authoritative metadata, and rerun the same run/SHA using its downloaded and reaccepted candidate artifact so an identical present artifact is skipped. Rollback: do not create a new candidate/version under this task; preserve/download the partial-release record and retry or escalate.
- Risk: Post-publication smoke may find unusable artifacts after all three versions exist. Mitigation: run identical tarball consumer checks before mutation, run Registry smoke in-job from the retained record, and download that record for post-run identity/provenance comparison. Rollback: stop all retries, document the immutable release defect, and require a separately authorized follow-up version; do not unpublish or overwrite 0.8.0 in this workflow.

## Assumptions

- The Spec-authorized existing GitHub npm credential is configured as `NPM_TOKEN`; implementation may reference it only in the GitHub publication step and does not inspect it.
- `master` remains the release branch; the user's existing authorization permits the controller-approved commit to be fast-forwarded locally and pushed, and CI needs no PR/review/check API lookup.
- GitHub retains the non-secret candidate artifact long enough to complete this 0.8.0 release/retry. If the artifact is unavailable, the exact pinned toolchain fallback must reproduce and reaccept matching identities or publication stops closed.
