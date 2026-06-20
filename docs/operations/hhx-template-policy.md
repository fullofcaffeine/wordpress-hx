# HHX and Template Authoring Policy

HHX-style typed markup is promising for WordPress, but it must not erase WordPress's PHP template contract.

## Local References

- `../haxe.elixir.codex` shows the PhoenixHx pattern: Haxe inline markup or `hxx(...)` authoring lowers to ordinary HEEx output. Its current direction prefers TSX-like inline markup through `phoenix.hxx.HeexTemplate.root(...)`, with raw HEEx as an explicit escape hatch.
- `../haxe.ruby` shows the RailsHx pattern: Haxe-owned templates use inline HHX through `@:railsTemplateAst(...)` and emit normal ERB/Rails artifacts. Existing ERB remains valid external/adoption source through typed `Template.existing(...)` or `Template.external(...)` contracts.
- `../haxe.compilerdev.reference/tink_hxx` is the local source reference for the base HXX/HHX macro/parser ideas, including `hxx(...)`, inline `@:markup`, fragments, spreads, children, comments, and typed tag resolution.
- The wider `../haxe.compilerdev.reference` tree contains many tink/coconut/genes source repos and should be used as a local source-code reference for template and typed UI design.

## Initial WordPress Rule

Use HHX only where Haxe owns the template or markup unit.

Do not use HHX as a shortcut to claim parity for existing mixed PHP/HTML files. WordPress templates have observable load order, caller scope, globals, includes, output buffering, and direct-file behavior. Those must first be represented by the PHP file-segment/linker model.

## Good Early HHX Candidates

- New Haxe-authored test fixtures for template lowering.
- Small generated admin/theme fixture templates where caller scope is explicitly bounded.
- Generated block markup fixtures where the upstream block grammar and saved markup can be compared byte-for-byte after normalization.
- Gutenberg React/TSX-like slices, if genes-ts HHX/TSX support proves equivalent to upstream React behavior.
- Future Haxe-owned helper components that emit normal WordPress/PHP/HTML artifacts.

## Not Early HHX Candidates

- Arbitrary existing mixed PHP/HTML files from WordPress Core.
- `wp-admin` screens with unknown caller locals or side effects.
- Theme templates that rely on include-time global state until the template inventory classifies inputs/outputs.
- `pluggable.php`, bootstrap files, or files where conditional declaration timing matters.
- Any template where raw PHP interleaving is still the source of truth and not yet modeled.

## Escape Hatches

Raw PHP/HTML template segments are allowed only as explicit compatibility or adoption boundaries. They should be represented in the file-segment manifest, tied to an upstream source hash, and have a removal or ownership condition.

If a Haxe-owned template needs raw target syntax, use an explicit metadata/manifest exception analogous to PhoenixHx `@:allow_heex` or RailsHx `@:railsAllowRawErb`, and file a compiler/template follow-up.

## Feasibility Gates

Before HHX becomes a normal WordPress authoring path, prove:

- Haxe inline markup can lower to target PHP/HTML or TSX without changing output bytes in focused fixtures.
- Embedded expressions are real typed Haxe expressions, not raw target-language strings.
- Diagnostics point to useful Haxe source locations.
- Template output participates in source inventory, artifact provenance, and receipts.
- Mixed PHP/HTML files can choose renderer, context bridge, or direct script-emission mode without hiding caller-scope behavior.

