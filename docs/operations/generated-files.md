# Generated File Policy

Generated files are build artifacts, not source authority.

## Do Not Edit by Hand

Do not manually edit generated PHP, TypeScript, TSX, JavaScript, source maps, distribution files, dashboards, or manifests produced by tools. Fix the Haxe source, macros, linker, compiler, or generator that produced them.

## Required Headers

Generated executable artifacts should include a header or adjacent provenance record naming:

- the generator;
- source Haxe modules or upstream source unit;
- upstream oracle ref;
- build profile;
- build identity or digest.

## Commit Policy

- Commit generated artifacts only when a Beads task requires them as review evidence or release output.
- Rebuild from clean inputs before accepting generated output.
- If generated output changes unexpectedly, explain the generator/source change or file a Beads issue before close.

## Ignored Paths

The default generated-output paths are ignored by Git:

- `build/`
- `dist/`
- `src-gen/`
- temporary manifest and receipt files

Intentional generated evidence should be written to a tracked path or committed with a receipt explaining why it belongs in history.

