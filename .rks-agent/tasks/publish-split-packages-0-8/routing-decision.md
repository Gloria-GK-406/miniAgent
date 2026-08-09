# Routing Decision

- TaskContract: `./TaskContract.md`
- Contract revision: `1`

## SDD Readiness

- Intent and outcome stability: The requested result is fixed: generate and publish exactly three named 0.8.0 packages from the existing layered repository through GitHub CI, then verify them from npm.
- Requirement stability: Package names, version, dependency direction, excluded root/CLI publication, CI delivery route, and Registry acceptance are explicit and observable.
- Execution direction: Keep the single repository and source layout, generate release directories after compilation, validate tarballs, then publish core before its dependents.
- Remaining uncertainty: Only implementation-local choices such as the release staging directory name and script factoring remain.

## Marginal Control Value

- User precision signal: The user wants a real release and has explicitly provided the required GitHub npm-token authority, so correctness of the published contract matters more than minimizing workflow time.
- Direct failure mode: A missed manifest dependency, unresolved relative core import, incorrect export map, or CI ordering error could irreversibly publish unusable public packages or leave a partial three-package release.
- Useful control: A durable Spec and Plan, independent adversarial review of publish artifacts and workflow, plan-drift control, complete-result review, and fresh pre-push verification materially reduce that escaped-failure path.
- Time-for-quality rationale: The extra review time is small compared with an immutable npm version that would require a replacement release and consumer migration if defective.

## Structural Selection

- Selected workflow: `single-spec-workflow`
- Boundary evidence: The three packages form one lockstep versioned release with one CI pipeline, one consumer acceptance boundary, and one rollback point before the external publish trigger.
- Why Direct is insufficient: Direct checks cannot cheaply provide the independent challenge and artifact approval appropriate before the irreversible Registry mutation.
- Why Multi is unnecessary: Core, engine, and extensions are not independently acceptable releases for this request; partial success is a retry state inside one coordinated release.
- Reroute conditions: Reroute only if the packages require independent versions, repositories, release approvals, or separately acceptable delivery schedules.

## Controller Selection

- Controller: `sdd-governed`
- Profile source: `code-feature`
- Why this is sufficient: Governed supplies independent Spec and Plan challenge/review, drift control, independent complete-change review, and audit-strength verification before the authorized push and release.
- Why lighter is insufficient: Standard ordinary review does not independently challenge the package contract and plan before an irreversible public publication.
- Why heavier is unnecessary: Governed is the strongest available Single Spec controller and the release remains one coherent acceptance boundary.
