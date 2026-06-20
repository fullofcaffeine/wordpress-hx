# Dependent Library and GutenbergHX Policy

This project should split dependent work only when the split improves verified parallelism more than it adds coordination cost.

## GutenbergHX

`gutenberghx` is a good future sibling repository, but it should not be created merely because Gutenberg is large.

Create it when these are true:

- WordPress 7.0's exact pinned Gutenberg build is locked.
- The forward `../gutenberg` baseline is locked.
- Gutenberg package inventory/export metadata exists.
- The genes-ts browser platform has passed at least the first real package and React/TSX feasibility spikes.
- Cross-repo task, manifest, and receipt flow is documented well enough that agents can work there without inventing a second task authority.

Recommended trigger: after `WPHX-403` and `WPHX-404` pass, or earlier only if an ADR explicitly accepts the coordination cost.

## Relationship Between Repos

When created, `gutenberghx` should be a sibling implementation repo, not a vendored subtree:

```text
wordpress-hx/      # program root, WordPress distro integration, root Beads authority
gutenberghx/       # Gutenberg package implementation repo
gutenberg/         # upstream oracle checkout
genes/             # compiler checkout
```

`wordpress-hx` should reference `gutenberghx` through lock manifests, package artifact manifests, receipts, and integration build inputs. `gutenberghx` should reference `wordpress-hx` as the program authority and distribution consumer.

Until an ADR changes this, `wordpress-hx/.beads` remains the active task authority. Work in `gutenberghx` should use a wrapper or Beads redirect back to the root program database rather than creating an independent issue store.

## What Belongs in GutenbergHX

Move work to `gutenberghx` when it is primarily about:

- `@wordpress/*` package source and public exports;
- package-wave ports from the Gutenberg dependency graph;
- genes-ts package fixtures driven by Gutenberg package behavior;
- React/TSX package surfaces;
- package build, typecheck, source-map, and bundle parity;
- forward Gutenberg package parity.

Keep WordPress distribution integration in `wordpress-hx`:

- Core script handles and asset metadata integration;
- exact copied paths required by the WordPress 7.0 distribution;
- the embedded WordPress 7.0 Gutenberg pin;
- PHP/block-library joint work that crosses the PHP pipeline;
- final distro receipts and scorecards.

## Smaller Libraries

Default: keep smaller dependent libraries inside `wordpress-hx` until evidence says otherwise.

Keep a library in `wordpress-hx` when:

- it is only needed by the WordPress distribution;
- it has no independent release or consumer surface;
- its behavior is best tested through WordPress/Gutenberg parity;
- splitting would create more manifest and task overhead than parallelism.

Split a smaller library into its own repo only when at least one is true:

- multiple ports can reuse it independently;
- it needs a separate release cadence or package identity;
- it creates sustained compiler-pressure work that benefits from isolated fixtures;
- it has a stable public API worth testing and versioning outside WordPress;
- multiple agents need to work on it without touching WordPress/Gutenberg-owned paths.

Vendor code should still remain inventoried even when it is not split. A bundled vendor may be a direct Haxe port, a Haxe reimplementation over host primitives, a generated wrapper only when upstream has the same runtime dependency assumption, or a temporary exception with a removal gate.

