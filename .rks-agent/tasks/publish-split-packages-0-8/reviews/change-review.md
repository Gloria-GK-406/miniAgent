---
kind: rks-review
verdict: approved
---

# Change Review Round 8: Publish split MiniAgent 0.8 packages

## Review Boundary

- Scope: `change`, the complete tracked and untracked result in `/Users/puxianguo/project/miniAgent/.worktrees/publish-split-packages-0-8` against baseline/current `HEAD` `838cb8cb9b86046df1d3dac94702a48438c28692`.
- Governing inputs: TaskContract revision 1, ready Spec, approved Plan, completed Task registry, aligned drift review Round 9, replacement adversarial challenges Round 8, and the current implementation. Task quick reviews and executor reports were supporting evidence only.
- Reviewed identities: workflow `sha256:4faf39ec30d67156b70c0d0e3e4d66aad7e956731c144ed67b067dc9e694ddcf`; package contract `sha256:de2384d69df8c1f82e253da75cab4ee932b45bc17d822e239fbe5352780b97ad`; generator `sha256:c90a37b383f2fef77c2f83e2e02a40d3a573b6a454263b42924aa70db52fd948`; verifier `sha256:39cf1ff2443b20f50ecc4ee60d8e50bb83227cfa9ccea33b0fb8504aa8be3219`; eligibility `sha256:9cc5e1550f2d7f294c79fb77087cdd1d540ad7f4c04e1623ec78bd998925f197`; publisher `sha256:1636a4ca7c988e6971265eeab83288dedad0079d91c3b0efad3dc162675a7da0`; Registry smoke `sha256:617dd31d162906a90de701db6e4e77b3e85d5c09debaef0e9bd98023b0dc0bb2`; release tests `sha256:74cb1296035f179aae9400f36b2b3df6da343e9c3ff78a75a51b2d7d20255783`; generated manifest `sha256:4f1774dc44b04a74f4e44c25002f4948da024fbfbbdfb79f567a1b411f9ce2bc`.
- No npm or GitHub credential was read or used, and no workflow run, Registry mutation, commit, push, or publication occurred during review.

## Verdict

`approved`. No blocking finding remains in the complete pre-publication result. The implementation satisfies the three exact 0.8.0 package contracts, closed package/archive inventories, one-way runtime dependency graph, public export surface, deterministic accepted-candidate identity, strict clean-consumer checks, private aggregate root and CLI exclusion, one-shot master eligibility, immutable hosted-Action selection, serialized core-first retry-safe publication, npmjs-only credential-confined mutation, retained-candidate reacceptance, provenance/source/subject binding, Registry-only consumer smoke, and directly related bilingual guidance.

This approval is the independent complete-change gate before controller verification and the accepted-result commit. It does not claim the still-future hosted CI and real npm Registry outcome in TaskContract SC-7 / Spec RQ-014; those remain closeout evidence after the authorized exact release commit is pushed.

## Challenge Dispositions

### CH-1 — confirmed as a non-blocking observation

The challenge accurately identifies an open inventory at the retained candidate root. `scripts/verify-release-packages.mjs:143-231` closes each manifest-declared package directory and archive but does not reject an additional sibling of `manifest.json`; `.github/workflows/ci.yml:115-128` rejects only regular `.npmrc`, `*.pem`, and `*.key` residue plus an incorrect tarball count before uploading the whole hidden `.release/candidate` tree. A separately introduced undeclared regular file can therefore be retained, and a symlink is outside the shell guard's `-type f` selection.

It is not a blocker for this exact release tree. The reviewed generator removes and reconstructs the exact candidate root, emits only the three package trees, three archives, and manifest, and the workflow adds only `run-record.json`; the current candidate has exactly `archives/`, `packages/`, and `manifest.json` and contains no symlink. All 13 hosted Action uses are pinned to an exact approved official commit, and independent credential-free `git ls-remote` probes resolved the four selected commits to the official repositories' current `refs/tags/v4`. No current producer, permission path, or credible accepted-tree execution was demonstrated that introduces the challenged residue between reacceptance and upload. More importantly, publication consumes only the three canonical manifest-declared `.tgz` paths and rechecks their SHA-512 integrity, package/archive inventories, source/common candidate identity, and containment immediately before mutation. Thus the gap can broaden retained diagnostic material under an additional producer or race, but it cannot alter accepted package bytes or authorize a foreign npm target in the reviewed workflow.

The minimum future hardening is still worthwhile: derive a closed candidate-root allowlist from the accepted manifest plus `run-record.json`, and reject symlinks and special entries immediately before upload. It is defense in depth rather than required remediation for this gate.

## Independent Evidence

- Under the required Node `22.22.0` and npm `10.9.4`, the credential-cleared complete release suite passed `14/14`. It covers deterministic projection, exact manifests/archives, symlink and path containment, hostile npm configuration isolation, one-shot complete-history eligibility, valid/invalid partial release states, ambiguous outcomes, npmjs confinement, provenance identity binding, and the parsed pinned workflow policy.
- Exact candidate verification passed with common candidate `sha256:257b3aa85865921409ed106ed53fdcc2fccdc61376fd9999c97f857ba3698d04`, inventories `63/103/91`, the required `engine/extensions -> core@0.8.0` graph, one `zod@3.25.76`, and all 12 runtime plus 12 NodeNext type entry probes.
- Repository `typecheck`, `lint`, `build`, and full Vitest passed; dependency architecture was valid and Vitest reported `139` files / `1095` tests. Local package smoke passed with CLI source version `0.8.0`, while root `package.json` remains private and has no aggregate publication hook.
- The workflow grants global `contents: read`, candidate-only `actions: read`, and publish-only `id-token: write`; its sole `secrets.NPM_TOKEN` reference is step-scoped to the exact publisher invocation. Pull-request-runnable jobs contain no artifact upload, npm secret, publication, Registry smoke, or OIDC authority.
- The exact official Action selections independently resolved as checkout `11d5960a326750d5838078e36cf38b85af677262`, setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020`, upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02`, and download-artifact `d3f86a106a0bac45b974a628896c90dbdf5c8093`. The current regression enumerates all 13 external uses and rejects mutable, short, or unapproved selectors.
- `git diff --check`, the empty-staging assertion, current candidate no-symlink inspection, release-script syntax exercised by the suite, and package smoke all passed. No extra product behavior, layer relocation, workspace split, CLI publication, aggregate publication, or package beyond the exact three approved names was found.
