# Build Profiles

WPHX-210 defines the first deterministic PHP build profiles for the WordPress 7.0 line.

## Profiles

- `wp70-debug` keeps compiler debug metadata, source maps, runtime probes, and oracle traces for local diagnosis.
- `wp70-parity` keeps source-map and oracle evidence while running the parity/conformance gates without debug-only compiler mode.
- `wp70-release` removes debug maps, runtime probes, and oracle traces, then records the release artifact policy used for distribution review.

All profiles preserve WordPress distribution paths through the original-path shell/linker policy.

## Source Of Truth

The source-controlled contract is:

- `profiles/wp70-build-profiles.v1.json`

The generated evidence is:

- `manifests/build-profiles/wphx-210-build-profiles.v1.json`
- `receipts/build-profiles/wphx-210-build-profiles.v1.json`

The checker writes deterministic effective-profile records under `build/wp70/*/effective-profile.json`. Those files are ignored build output; their digests are recorded in the manifest.

## Verification

Run:

```bash
npm run build:profiles
npm run build:profiles:check
```

Intentional differences between debug, parity, and release are recorded in the profile contract and validated by the checker.
