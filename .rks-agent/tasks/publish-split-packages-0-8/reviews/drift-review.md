---
kind: rks-plan-drift-review
contract:
  path: ../TaskContract.md
  revision: 1
spec:
  path: ../spec.md
plan:
  path: ../plan.md
classification: aligned
round: 9
reviewer: release-drift-review-r9-20260810
---

# Plan Drift Review Round 9: Publish split MiniAgent 0.8 packages

## Classification

`aligned`

The complete accumulated implementation after TASK-03 Rework Round 11 remains inside TaskContract revision 1, the ready Spec, and the approved Plan. The Round 11 correction replaces all mutable hosted-Action selectors with reviewed immutable commit SHAs and adds an exact official-Action allowlist regression. This is a bounded hardening of the Plan T-005/BD-006 trusted CI boundary: it does not change package version, package contracts, generated package bytes, release eligibility, artifact inputs or ordering, publication targets, Registry authority, credential/OIDC authority, provenance command, concurrency, or partial-release semantics.

TASK-01, TASK-02, and TASK-03 remain `done`; the Task registry has no active item, and TASK-03 Independent Quick Review Round 11 is `passed`. The implementation remains unstaged and uncommitted at baseline/current `HEAD` `838cb8cb9b86046df1d3dac94702a48438c28692`. This result clears only the configured implementation drift checkpoint. Fresh replacement change-adversarial and final-review evidence must evaluate this exact Round 11 result before verification, commit, integration, or publication.

## Fresh Review Boundary

- Review workspace: `/Users/puxianguo/project/miniAgent/.worktrees/publish-split-packages-0-8`, branch `codex/publish-split-packages-0-8`, baseline/current `HEAD` `838cb8cb9b86046df1d3dac94702a48438c28692`, plus the complete unstaged tracked/untracked result.
- Independently reread: TaskContract revision 1, ready Spec, approved Plan, completed Task registry, TASK-03 Round 11 execution/self-check/quick-review evidence, current workflow, the external-Action pin policy regression, and the unchanged eligibility/publisher/Registry-smoke boundaries.
- Current implementation scope remains the approved deterministic three-package projection, exact retained-candidate verification, one-shot release eligibility, npmjs-only publication and closeout, private root metadata, CI policy, and directly related bilingual guidance. No Agent, engine, extension, CLI product behavior, source-layer ownership, package contract, or generated release content changed in Round 11.
- Generated `.release/`, `dist/`, and `node_modules/` remain outside the Git change set; the Git index is empty. This review performed no credential access, live Registry request, GitHub operation, commit, push, publication, or external mutation.

## Round 11 Trusted CI Reconciliation

### Plan T-005/BD-006, RQ-009/RQ-017: immutable reviewed hosted components

- All 13 external `uses:` occurrences in `.github/workflows/ci.yml` select exact 40-character lowercase commit SHAs. The only permitted repositories are `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, and `actions/download-artifact`; no mutable tag, branch, short SHA, unapproved owner, or unapproved repository remains.
- TASK-03 Round 11 records credential-free read-only resolution of the four official `refs/tags/v4` refs, and its independent quick reviewer repeated that resolution. The workflow and regression agree exactly on checkout `11d5960a326750d5838078e36cf38b85af677262`, setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02`, and download-artifact `d3f86a106a0bac45b974a628896c90dbdf5c8093`.
- `APPROVED_ACTION_PINS` plus `assertApprovedExternalActionReferences` enumerates every external workflow component and requires both full-SHA syntax and the exact four-entry repository/revision mapping. Negative cases reject a major tag, branch, short SHA, and a full-SHA action from an unapproved owner. Human-readable `# v4` comments do not participate in selection.
- This allowlist is limited to hosted CI components already required by the approved workflow. It adds no new Action, permission, network destination, package target, publication mode, or alternate release path, so it is security hardening within BD-006 rather than new product or release scope.

### Plan T-005, RQ-009/RQ-012/RQ-015: validation and eligibility semantics are unchanged

- `check` still runs the Node 20/22 repository gates. Unconditional `package-validation` still runs on pull requests and master pushes, pins the packing runtime to Node `22.22.0` and npm `10.9.4`, generates deterministically, and performs the complete release-policy and exact-candidate consumer verification.
- Pull-request-runnable jobs remain exactly `check`, `package-validation`, and `release-eligibility`; none has artifact upload, Registry publication, npm secret access, or `id-token` authority. `release-eligibility` still requires full history and admits only a push to `refs/heads/master` whose exact checked-out SHA uniquely adds the exact three-package 0.8.0 intent marker.
- `release-candidate` and `publish` still depend on the complete gate/eligibility chain and require `eligible == 'true'`. Pinning checkout/setup-node changes only component identity; full-history checkout, toolchain inputs, job graph, and one-shot eligibility behavior are intact.

### Plan T-005/T-008, RQ-010/RQ-011/RQ-017/RQ-018: retained candidate and mutation state machine are unchanged

- Candidate recovery still uses the SHA/run-ID artifact before fallback generation; complete `release:test -- --skip-generation` and exact `release:verify` still precede retention. The sole upload remains limited to `.release/candidate`, explicitly includes that hidden tree, rejects empty selection, and follows manifest/secret-residue/exact-three-archive guards.
- Publication still downloads the named retained candidate into exact `.release/candidate`, re-verifies its manifest, invokes the exact publisher, and then runs Registry smoke against the same record. The Action selector hardening changes none of these paths, inputs, conditions, or ordering.
- Fixed non-cancelling concurrency remains `miniagent-npm-0.8.0`. The unchanged publisher still targets only the canonical core/engine/extensions 0.8.0 allowlist, recognizes absence only from authoritative npmjs 404, requires present packages to match retained SRI/source/common candidate identity, rejects foreign or invalid mixed partial states, publishes core before dependents, waits for core visibility, and uses only retained `.tgz` paths.
- Root `0.8.0` remains private, the legacy aggregate/CLI has no 0.8 publish route, and generated candidate identity remains `sha256:257b3aa85865921409ed106ed53fdcc2fccdc61376fd9999c97f857ba3698d04`. Exact verification still reports inventories `63/103/91`, the one-way `engine/extensions -> core@0.8.0` graph, one `zod@3.25.76`, and all 12 runtime plus 12 type entries.

### Plan T-004/T-005/T-009, RQ-014/RQ-015/RQ-017: npmjs, credentials, OIDC, and provenance remain intact

- Workflow permissions remain global `contents: read`, candidate-access `actions: read`, and publish-only `id-token: write`. The sole `secrets.NPM_TOKEN` reference remains scoped to the exact publication step as `NODE_AUTH_TOKEN`; pull requests, package checks, artifact retention, and Registry smoke stay credential-free.
- The publisher still requires the complete npm authentication/OIDC triplet before non-fixture mutation, creates isolated npm configuration bound to `https://registry.npmjs.org/`, rejects project/config/environment Registry redirects, and invokes `npm publish <accepted-tgz> --provenance --access public --registry https://registry.npmjs.org/` in core/engine/extensions order.
- Registry smoke remains credential-free and npmjs-only. It compares exact Registry metadata, retained integrity/source/common identity, and a single source- and subject-bound Sigstore/SLSA provenance attestation before performing the Registry-only dependency/runtime/type consumer checks. Round 11 changed neither publisher nor smoke implementation.

## Fresh Round 9 Evidence

- Under the initially active Node `24.18.0`/npm `12.0.2`, the focused parsed workflow regression passed `1/1`; the complete suite then stopped at the exact packing-toolchain guard as designed. No result was inferred from that incompatible-toolchain run.
- After selecting the repository-required Node `22.22.0` and npm `10.9.4`, the credential-cleared complete release suite passed `14/14` in `26.84s`. It covered deterministic projection, archive/candidate verification, hostile credential/config isolation, identity-bound provenance, valid and invalid partial publication states, ambiguous outcomes, complete-history eligibility, npmjs confinement, and the full pinned workflow policy.
- Exact candidate verification exited `0` and reported candidate `sha256:257b3aa85865921409ed106ed53fdcc2fccdc61376fd9999c97f857ba3698d04`, inventories `63/103/91`, one-way internal dependencies, one compatible Zod, and 12 runtime/12 type entries. `git diff --check` and empty-staging validation passed.
- Reviewed identities: workflow `4faf39ec30d67156b70c0d0e3e4d66aad7e956731c144ed67b067dc9e694ddcf`; release tests `74cb1296035f179aae9400f36b2b3df6da343e9c3ff78a75a51b2d7d20255783`; eligibility `9cc5e1550f2d7f294c79fb77087cdd1d540ad7f4c04e1623ec78bd998925f197`; publisher `1636a4ca7c988e6971265eeab83288dedad0079d91c3b0efad3dc162675a7da0`; Registry smoke `617dd31d162906a90de701db6e4e77b3e85d5c09debaef0e9bd98023b0dc0bb2`; package contract `de2384d69df8c1f82e253da75cab4ee932b45bc17d822e239fbe5352780b97ad`; generator `c90a37b383f2fef77c2f83e2e02a40d3a573b6a454263b42924aa70db52fd948`; verifier `39cf1ff2443b20f50ecc4ee60d8e50bb83227cfa9ccea33b0fb8504aa8be3219`; generated manifest `4f1774dc44b04a74f4e44c25002f4948da024fbfbbdfb79f567a1b411f9ce2bc`.

## Findings and Downstream Disposition

- Blocking drift findings: none.
- Missing or extra implementation-stage work: none demonstrated.
- Classification: `aligned`; no Task rework/replacement, Spec block/failure, or TaskContract revision is required.
- Required next gate: regenerate change-adversarial and final-review evidence against this exact TASK-03 Round 11 replacement result. Only a fresh approved final review may proceed to fresh pre-mutation verification, the controller-owned accepted commit, authorized exact-SHA master push, retained-candidate CI monitoring, and real Registry closeout.
- This drift result does not itself approve the complete change, authorize commit/push/publication, or claim TaskContract SC-7/RQ-014 has already succeeded.
