---
kind: rks-verification
decision: pass
---

# Completion verification: split packages 0.8.0

## Exact claim

The approved result was committed, fast-forwarded to `master`, published by the exact accepted-SHA GitHub Actions run, and independently verified from the retained run artifact and public npm Registry. All TaskContract success conditions are satisfied.

## Condition-to-evidence mapping

- Repository quality and regression safety: under Node `v22.22.0` and npm `10.9.4`, `npm ci` passed, followed in the repository-required order by `npm run lint`, `npm run build`, and `npm test`. Dependency architecture was valid and Vitest passed 139 files / 1,095 tests.
- Deterministic three-package candidate: `npm run release:build -- --verify-determinism` passed and produced exactly core, engine, and extensions for candidate `sha256:257b3aa85865921409ed106ed53fdcc2fccdc61376fd9999c97f857ba3698d04`.
- Release policy and hostile-boundary coverage: credential-cleared `npm run release:test` passed 14/14, including generator/verifier npm isolation, archive containment, publication partial states, one-shot release eligibility, npmjs mutation authority, Registry smoke isolation, provenance statement binding, workflow graph, artifact retention, OIDC scope, and immutable Action references.
- Packed consumer behavior: credential-cleared `npm run release:verify -- --candidate .release/candidate/manifest.json` passed with inventories core 63, engine 103, extensions 91; engine/extensions depend on core 0.8.0 without horizontal edges; one `zod@3.25.76` resolved; all 12 runtime entries and all 12 strict NodeNext type entries passed.
- Root compatibility and local product: `npm run typecheck` and `npm run package:smoke` passed; the private root remains locally buildable and its CLI reports 0.8.0 without creating an aggregate/CLI publication route.
- Publication metadata and workflow: all six generated/extracted manifests carry the exact case-preserving GitHub repository metadata; root aggregate is private; publication allowlist contains only the three split packages; all 13 external Action uses are allowlisted official repositories pinned to full 40-hex commits; eligible publication is bound to the unique complete-history marker-addition SHA; candidate bytes are scanned, retained, downloaded, and reverified before publication.
- Credential and residue boundary: local verification ran without `NODE_AUTH_TOKEN`, `NPM_TOKEN`, or `GITHUB_TOKEN`; the candidate contains no `.npmrc`, PEM, or key file and contains exactly three `.tgz` archives; the npm secret remains referenced only in the final publish step.
- Change integrity: `git diff --check` passed, the Git index remained empty, `.release/` stayed ignored, and the final independent change review verdict is `approved` against the current complete tracked and untracked result.
- Accepted revision and CI: commit `5837f962345b6e9dce53f0b1f9947313d771beb3` was fast-forwarded and pushed to `master`. GitHub Actions run `31327450178` completed successfully for that exact SHA: Node 20/22 repository checks, pinned package validation, one-shot eligibility, candidate retention, publication, and in-job Registry smoke all passed.
- Retained candidate: artifact `miniagent-0.8.0-candidate-5837f962345b6e9dce53f0b1f9947313d771beb3-31327450178` was downloaded and reverified. Its run record binds run `31327450178`, attempt `1`, the accepted SHA, candidate `sha256:7c6894a2d33c76c6d19ade653579758cccb6f360e463dc9b4dcff85a093afdde`, and all three exact SHA-512 archive identities.
- Public Registry result: `@piaoxianguo/miniagent-core@0.8.0`, `@piaoxianguo/miniagent-engine@0.8.0`, and `@piaoxianguo/miniagent-extensions@0.8.0` are present on npm. Credential-free Registry smoke matched each integrity/source/candidate identity and provenance statement, installed only engine and extensions with strict peers, obtained core automatically, found one Zod resolution, and passed all 12 runtime and 12 strict NodeNext type entries.
