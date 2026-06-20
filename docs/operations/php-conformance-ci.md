# PHP Conformance CI

WPHX-208 adds the GitHub Actions matrix for compiler/runtime-sensitive PHP target changes.

## Trigger

The workflow runs on pull requests and pushes to `main` when runtime-sensitive paths change:

- Haxe source and fixtures;
- build profile contracts;
- PHP ABI/linker/generator tools;
- scripts, manifests, receipts, package locks, toolchain locks, and the workflow itself.

It also supports manual `workflow_dispatch` runs.

## Matrix

The matrix groups checks into:

- `hygiene-and-manifests`
- `php-feasibility`
- `wp-abi-and-macros`
- `wp-runtime-and-linker`

Each job sets up Node 20.19.3, PHP 8.4, Haxe 4.3.7, the Haxe formatter, and the pinned PHP 8.4/8.5 Docker images from `toolchain.lock.json`.
It also restores `../wordpress-develop` from the WordPress `7.0.0` tag and verifies commit `26b68024931348d267b70e2a29910e1320d0094f`, because the ABI extractor and hook oracle read upstream files from that sibling checkout.

The hygiene suite includes `npm run build:profiles:check` so debug, parity, and release profile drift blocks target/runtime-sensitive changes.

## Verification

Run:

```bash
npm run ci:php-conformance
npm run ci:php-conformance:check
```

Evidence is recorded in:

- `manifests/ci/wphx-208-php-conformance-ci.v1.json`
- `receipts/ci/wphx-208-php-conformance-ci.v1.json`
