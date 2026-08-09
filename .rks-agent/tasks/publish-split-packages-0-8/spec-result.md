---
kind: rks-spec-result
outcome: completed
terminal_stage: verification
---

# Spec Result: Publish MiniAgent split packages 0.8.0

## Delivered

- Published exactly `@piaoxianguo/miniagent-core`, `@piaoxianguo/miniagent-engine`, and `@piaoxianguo/miniagent-extensions` at 0.8.0; no aggregate or CLI 0.8 package was published.
- Engine and extensions declare core 0.8.0 as an ordinary dependency, so npm installs core automatically; the packages retain one-way layer dependencies and twelve declared public entries.
- Added deterministic package projection, frozen candidate identity, archive/consumer verification, core-first retry-safe publication, public Registry smoke, bilingual installation guidance, and a private root source package.
- Added one-shot accepted-SHA release eligibility, exact npmjs mutation authority, step-only npm authentication/OIDC provenance, retained candidate artifacts, pinned external Actions, and unconditional credential-free PR package validation.

## Success Evidence

| Condition | Evidence |
|---|---|
| SC-1 | The retained CI candidate contains exactly the three 0.8.0 package manifests and tarballs with the approved exports, dependency ranges, repository metadata, and no CLI/aggregate target. |
| SC-2 | Fresh strict-peer tarball and Registry consumers resolve engine/extensions to core 0.8.0, without horizontal dependencies, with one compatible Zod installation. |
| SC-3 | All twelve declared roots/subpaths pass runtime import and strict NodeNext TypeScript resolution from both retained archives and public Registry packages. |
| SC-4 | English and Chinese readmes/tool examples use the split packages, explain automatic core installation, and state that 0.8 has no aggregate/CLI release route. |
| SC-5 | The private root remains locally buildable; lint, build, typecheck, 1,095 tests, and package smoke passed under the accepted result. |
| SC-6 | GitHub Actions run `31327450178` for accepted SHA `5837f962345b6e9dce53f0b1f9947313d771beb3` retained and reaccepted one candidate, then published core first and both dependents with provenance. |
| SC-7 | Independent public npm verification matched candidate/integrity/source/provenance identities and passed Registry-only dependency, runtime, and type smoke for all three 0.8.0 versions. |

## Repository Result

- Accepted implementation commit: `5837f962345b6e9dce53f0b1f9947313d771beb3` on `master` and `origin/master`.
- Published candidate: `sha256:7c6894a2d33c76c6d19ade653579758cccb6f360e463dc9b4dcff85a093afdde` from retained run artifact `31327450178` attempt 1.
- Published packages: core 0.8.0, engine 0.8.0, extensions 0.8.0.
- Parent rollback required: no; npm versions are immutable and the completed release requires no retry.

## Artifacts

- `TaskContract.md`
- `spec.md`
- `plan.md`
- `reviews/change-challenges.md`
- `reviews/change-review.md`
- `reviews/drift-review.md`
- `verification/completion-evidence.md`
