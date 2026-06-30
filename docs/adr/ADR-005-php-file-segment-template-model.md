# ADR-005: PHP File-Segment, Template, and Caller-Scope Model

Status: Accepted

Date: 2026-06-30

## Context

WordPress contains many PHP files whose observable behavior is not only declarations or method bodies. Mixed PHP/HTML templates, admin screens, feed templates, theme templates, direct scripts, and small include files can depend on original paths, caller-scope locals, globals, ordered output, `include`/`require` timing, `include_once` behavior, return values, guards, output buffering, warnings, and nested partials.

F6 already proves template/caller-scope behavior for admin-style and theme-style fixtures. `WPHX-COMP-PHP-INCLUDE-SIDE-EFFECTS` already proves a bounded WPHX PHP direct script adapter for include returns, repeated include/include_once behavior, function-scope locals, top-level side effects, and output buffering. This ADR connects those pieces to the WPHX PHP compiler lane so mixed PHP/HTML work has an explicit model before any broad WordPress template ownership claim.

`WPHX-COMP-PHP-FIRST-SEGMENT-SHELL` is the first implementation checkpoint for this ADR. It emits a minimized original-path admin-style segment shell from WPHX PHP compiler metadata and proves guard, declaration, script, literal output, template expression, control, caller-scope local mutation, object mutation, global trace mutation, and return behavior against an oracle fixture.

`WPHX-COMP-PHP-NESTED-SEGMENT-SHELL` extends the implementation checkpoint to a generated original-path parent template and generated nested partial. It proves caller-scope local reads and mutation across the include boundary, object mutation, global trace order, ordered parent/partial output, nested include return values, repeated include, include_once second-return behavior, and function-scope include locals against oracle fixtures.

## Decision

Represent every existing WordPress mixed or direct PHP script as an ordered file-segment plan before claiming durable ownership.

The segment plan is compiler-facing evidence. It can be consumed by the current WPHX Adapter IR printer, by a later broader WPHX PHP backend, or by an extracted `reflaxe.php` target without changing Haxe source semantics. It is not permission to paste production PHP strings into durable code paths.

## Segment Kinds

The accepted segment vocabulary starts with:

- `guard`: `ABSPATH`, constant, capability, or direct-load guard.
- `declaration`: function, class, interface, trait, constant, property, or conditional declaration.
- `bootstrap`: runtime/bootstrap setup required before later segments.
- `script`: top-level PHP statements with include-time side effects.
- `literal_output`: literal HTML, XML, text, whitespace, or template bytes emitted in order.
- `template_expression`: escaped or raw expression output whose value comes from locals, globals, functions, or Haxe-owned helpers.
- `control`: loops, conditionals, and alternative PHP template syntax that controls neighboring output segments.
- `include`: `include`, `include_once`, `require`, or `require_once`, including nested partials and caller-scope effects.
- `return_exit`: file return, `exit`, `die`, redirect termination, or other control-flow boundary.
- `raw_compatibility`: an explicitly bounded upstream-derived segment that remains PHP-owned until replaced.

Unsupported or unknown segment kinds must be recorded and must block durable template ownership claims.

## Adoption Modes

Use the narrowest mode that preserves observable behavior:

- `bridge_original_php_shell`: copied or upstream-derived shell remains behavior authority while Haxe owns no durable template behavior.
- `generated_helper_with_temporary_shell`: Haxe owns bounded helper payloads, but the mixed file remains a temporary PHP shell.
- `compiler_emitted_segment_shell`: WPHX emits the original-path shell from a segment plan, but some segments may still be raw compatibility boundaries.
- `context_bridge_template`: WPHX emits or owns a template whose contract explicitly includes caller locals, globals, nested includes, output, and return values.
- `direct_script_emission`: WPHX emits a non-HTML direct script where file-scope statements, output buffering, include returns, and include timing are the main contract.
- `haxe_owned_template_unit`: Haxe owns a new or fully migrated template unit, optionally authored through HXX/HHX, after the original file effects are represented.
- `whole_file_owned`: all segments are Haxe-owned or compiler-owned with no raw compatibility segment remaining.

HHX/HXX may be used for Haxe-owned markup units. It is not parity evidence for existing WordPress mixed PHP/HTML files until the file's segment plan, caller scope, globals, includes, output, and returns are covered.

## Required Metadata

A file-segment manifest must record:

- original WordPress path and upstream source hash;
- segment list in source order;
- adoption mode and ownership state;
- caller-scope inputs, locals created or mutated, globals read or mutated, superglobals, and object/array mutation;
- output channels, output buffering assumptions, headers/cookies when relevant, and return/exit behavior;
- nested includes/requires with include-once semantics and expected scope;
- bootstrap requirements, source-map/debug expectations, and warning/error behavior;
- raw compatibility segments with removal gates;
- unsupported constructs that block claims.

## Gates

Before a generated segment shell can support a durable claim, require:

1. segment manifest and upstream hash;
2. generated original-path shell or accepted backend/custom-target output;
3. `php -l`;
4. generated-shape or AST/segment snapshot;
5. oracle/candidate behavior probes for output, locals, globals, include timing, return/exit values, and nested partials;
6. source-map/stack-trace/debug policy when the file is operator-facing;
7. packaged-distribution evidence before installed WordPress claims;
8. explicit non-claims for unmodeled templates, handlers, globals, warnings, or side effects.

## Escalation

Stay in Adapter IR when segment behavior can be represented as ordered public adapter segments plus bounded Haxe helper calls.

Escalate toward a broader WPHX PHP backend or extracted `reflaxe.php` target when segment plans require arbitrary Haxe expression lowering in caller scope, broad template/direct-script statements, reusable runtime/stdlib replacement, or source-map/debug support that cannot remain bounded.

Ask the architecture oracle before broadening into whole template directories, admin screen ownership, or a full direct-script emission backend.

## Non-Claims

This ADR does not claim:

- generated ownership of existing WordPress mixed PHP/HTML files;
- full theme, admin, feed, or block template ownership;
- that HHX/HXX is parity evidence for existing WordPress templates;
- arbitrary Haxe expression lowering into PHP caller scope;
- whole-file ownership for any WordPress file.
