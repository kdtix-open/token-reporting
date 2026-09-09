# Publication prerequisites for issues 37 and 38

## Discovery and bounded scope

The September 9 current-main baseline passed 35 files / 297 tests but the fresh
dependency audit reported 14 vulnerable package entries, including seven high
severity findings.
The mounted build also emitted a 513.54 kB JavaScript chunk warning. These are
tracked separately in issues [41](https://github.com/kdtix-open/token-reporting/issues/41)
and [42](https://github.com/kdtix-open/token-reporting/issues/42).

This prerequisite updates compatible dependency resolutions and separates React
and schema-validation dependencies into cacheable build chunks. It does not
change reporting calculations, data, credentials, routes or deployment state.
The existing warning budget is not raised or suppressed. The reviewed guide is
only a local worktree bootstrap and is not part of this contribution.

The approach follows the existing Vite 7 / Rollup configuration and official
[manual chunks](https://rollupjs.org/configuration-options/#output-manualchunks)
and [build API](https://vite.dev/guide/api-javascript.html#build) documentation.
No new production dependency or major-version migration is required.

## Evidence and regression contract

- Baseline coverage: statements 84.44%, branches 70.83%, functions 86.34%,
  lines 85.89%.
- Fresh `npm audit --audit-level=low` after compatible remediation reports zero
  vulnerabilities. Vitest and its coverage provider minimums are both 4.1.11.
- All changed package resolutions use the npm registry; the added transitive
  package uses Apache-2.0. Existing MIT, ISC and CC-BY-4.0 licenses are retained.
- Artifact-level tests build the real application at `/` and
  `/tools/token-reporting/`, with private public-data copying disabled and an
  isolated temporary output directory. Both fail on the original 513.5 kB chunk,
  then pass after chunk separation. No production warning is filtered.
- Tests explicitly use production mode rather than the test runner's inherited
  environment, and restore that environment afterward.
- Node 24.19.0 is used for final publication validation. The system Node 26
  toolchain emits an existing tsx loader deprecation; this is not suppressed.

Before merge, record the exact reviewed head, final full-suite/coverage results,
warning-free mounted build, artifact verification and independent built-browser
smoke test on the PR. A process start or a build alone does not prove runtime
freshness for issue 38; that remains separate work.
