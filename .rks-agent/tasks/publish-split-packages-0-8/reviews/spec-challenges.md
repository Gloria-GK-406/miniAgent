# Adversarial Challenges: split-package publication Spec

- Target: `.rks-agent/tasks/publish-split-packages-0-8/spec.md`, current ready content, SHA-256 `ce23a3ce15b897b19c98fc80ea4a2dfca0f8a4398ca960f1b4b33512023159b6`
- Governing sources: `.rks-agent/tasks/publish-split-packages-0-8/TaskContract.md`, revision 1, SHA-256 `63e182e672ef81360cd939befa4247ad92af291fe9378547ad8d442472d947a6`; repository package/import metadata; authoritative npm Registry metadata queried 2026-08-09
- Attack scope: consumer installability; exact runtime and peer dependency contracts; exports and archive boundaries; exclusion of root aggregate and CLI releases; first publication, partial retry, and lookup-failure behavior; credential/provenance boundary; irreversible real-Registry acceptance

## Challenge CH-1

- Target claim or boundary: The package table and RQ-002/RQ-007 claim complete, minimal runtime dependency contracts, while the package table names external dependencies but specifies no allowed version ranges or peer-dependency treatment.
- Attack: Implement the named dependency sets with unbounded, independently chosen, or merely currently-installable ranges; alternatively omit an explicit peer-resolution rule for `zod-to-json-schema` and the MCP/OpenAI/Anthropic SDKs.
- Failure mechanism: The candidate can pass today's clean install while 0.8.0 remains permanently capable of resolving a later incompatible major or an unsatisfied/duplicated Zod peer. Current authoritative metadata already exposes coupled constraints: `zod-to-json-schema@3.25.2` requires peer `zod ^3.25.28 || ^4`; `@modelcontextprotocol/sdk@1.29.0` requires peer `zod ^3.25 || ^4.0`; OpenAI and Anthropic declare optional Zod peers. The repository currently resolves `zod@3.25.76`, but the Spec does not make that compatible intersection or an equivalent bounded policy part of the package contract.
- Task outcome at risk: The three immutable 0.8.0 packages remain independently installable and usable with a complete, minimal runtime graph.
- Credible scenario: A conforming generator uses `*`, broad majors, or inconsistent ranges because only dependency names are normative. A future dependency major or npm peer resolution then changes the installed graph without a MiniAgent release, or strict/alternative peer handling produces an install failure or multiple incompatible Zod instances.
- Implementation consequence: An implementation can satisfy manifest-name inspection and the one-time default npm smoke while publishing dependency metadata that is not stable or peer-consistent for consumers.
- Downstream impact: Consumers can later receive install-time conflicts or runtime/schema incompatibility from the unchanged, unreplaceable 0.8.0 release; fixing it requires a new MiniAgent version and leaves 0.8.0 permanently defective.
- Why now: npm version metadata is immutable after publication, and AC-008/AC-010 exercise one resolution at one time rather than constraining every future resolution allowed by the manifest.
- Expected or required behavior: Every external runtime dependency has a bounded source-grounded range, and the Spec states whether each relevant peer is intentionally satisfied by a direct dependency, exposed as a peer, or otherwise guaranteed in the clean consumer graph.
- Evidence or probe: Inspect generated `dependencies`, `peerDependencies`, and `peerDependenciesMeta`; compare their intersections with `npm view <exact-version> dependencies peerDependencies peerDependenciesMeta`; install with strict peer checking and inspect `npm ls` for invalid or duplicate critical peers.
- Source anchor: TaskContract SC-1/SC-2/SC-4 and Constraints (minimal and complete dependencies; independent consumer use); Spec lines 59-67, RQ-002/RQ-007, AC-001/AC-008.
- Risk: high-risk
- Minimum mitigation: Add the intended version ranges and peer-resolution policy to the three package contracts, requiring a peer-clean consumer graph for the selected exact dependency versions/ranges.
- Risk basis: The omission permits a currently passing but permanently unstable package contract; the failure is consumer-facing, can arise after release without repository changes, and cannot be repaired in 0.8.0 once published.

## Challenge CH-2

- Target claim or boundary: RQ-009 and AC-011 require package-contract and packed-artifact acceptance before publication, but do not require CI to publish the exact artifacts that passed those gates.
- Attack: Let the validation job pack and test one set of directories, then let the publish job check out, rebuild, regenerate, or select package directories independently before invoking `npm publish`.
- Failure mechanism: The publish job can create materially different manifests/files from the tested tarballs because of a wrong working directory, environment-sensitive generation, stale files, or later regeneration. All required gates remain green because they attest to the earlier artifacts, while npm receives an untested candidate.
- Task outcome at risk: Only the reviewed, archive-inspected, clean-consumer-tested core/engine/extensions artifacts are irreversibly published; root aggregate and CLI artifacts remain unpublished.
- Credible scenario: The current workflow pattern uses a separate publish job that checks out and rebuilds after `needs: check`. A split-package implementation can preserve that pattern, validate packed outputs in `check`, then regenerate in `publish`; the Spec currently treats ordering of jobs as sufficient without an artifact-identity boundary.
- Implementation consequence: A nominally conforming workflow may publish missing files, repository-relative imports, an unintended manifest, or even the wrong package directory despite successful prepublication acceptance.
- Downstream impact: A bad 0.8.0 package cannot be overwritten. Post-Registry AC-009/AC-010 detects the damage only after the irreversible mutation and may leave one or more package names/version slots unusable.
- Why now: Ordinary post-publication smoke is too late, and reviewing commands cannot prove that two independently generated filesystem states are identical.
- Expected or required behavior: Publication consumes the already accepted package artifacts, or the publish job repeats the full package-contract/archive/consumer acceptance against the exact directories or tarballs passed to `npm publish`.
- Evidence or probe: Trace CI artifact production and handoff from acceptance through each `npm publish`; deliberately perturb/regenerate a publish directory after the check job and verify publication is blocked rather than accepting the changed candidate.
- Source anchor: TaskContract Constraint that all three tarballs pass before irreversible publication, SC-1/SC-4/SC-6; Spec Constraint line 43, RQ-009/RQ-012, AC-004/AC-011.
- Risk: high-risk
- Minimum mitigation: Add an explicit same-candidate requirement binding accepted tarballs (or their exact revalidated publish directories) to every publication command.
- Risk basis: This is a concrete gap between evidence and mutation target that can bypass all stated prepublication gates and cause irreversible consumer and release harm.

## Challenge CH-3

- Target claim or boundary: RQ-011 and AC-006 define retry safety solely as exact-version existence, skipping any present package and continuing with missing packages.
- Attack: Run two eligible master publications for different commits concurrently, or retry a partial release after master has advanced while retaining version 0.8.0.
- Failure mechanism: Run A can publish core and stop; run B then treats A's core as sufficient and publishes engine/extensions built from B. Likewise, two initially absent lookups can race. Exact version equality proves neither common source identity nor API/artifact compatibility, and no concurrency or frozen-candidate rule prevents a mixed release set.
- Task outcome at risk: The three locked 0.8.0 packages form one jointly tested, dependency-compatible release, and partial retries safely complete that same release.
- Credible scenario: A follow-up master push lands while the first publish run is active or after it partially succeeds. Both CI runs are individually eligible and use the same hard-coded version. The later run skips an existing package as required and publishes its missing siblings from a different checkout.
- Implementation consequence: A conforming implementation can assemble a Registry release that never existed in, and was never jointly tested by, any one CI candidate; lookup-failure handling may be correct and still not prevent this race.
- Downstream impact: Exact-version dependencies can resolve but fail at runtime or type level across changed public APIs. Every occupied 0.8.0 slot is immutable, so the mixed set cannot be repaired by retry, and real-Registry acceptance discovers it after publication.
- Why now: Serialization or candidate-continuity must be designed into first publication and retry behavior; once one package from each candidate is published, rollback/overwrite is unavailable.
- Expected or required behavior: Concurrent eligible releases cannot interleave, and a retry may continue only the same frozen candidate or must establish that every existing 0.8.0 package is compatible with/identical to the candidate whose missing siblings it will publish.
- Evidence or probe: Model two CI runs from different commits with interleaved absent/existing lookup results and publish completions; assert that at most one candidate may mutate the Registry and that a later candidate cannot consume another candidate's partial state based on version alone.
- Source anchor: TaskContract Goal and Constraints (joint usability, immutable skip, safe partial retry), SC-3/SC-7; Spec Definitions of partial release, RQ-010/RQ-011/RQ-014, AC-006/AC-009/AC-010.
- Risk: high-risk
- Minimum mitigation: Specify release serialization plus frozen-candidate continuity across retries, or require an equivalent compatibility/identity check before using an existing package as the basis for publishing missing siblings.
- Risk basis: Concurrent master pushes and post-partial follow-up commits are ordinary operational events; version-only skip can irreversibly combine untested artifacts and defeat the core release outcome despite every individual lookup behaving correctly.
