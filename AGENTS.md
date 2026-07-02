# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` at session start for current workflow context.

The product and architecture authority is `docs/prd/wordpress-haxe-port.md`. Do not begin broad WordPress or Gutenberg source translation before the PRD feasibility gates pass.

## Work Surface

- This repository is the program control plane and future Haxe implementation home.
- A future `../gutenberghx` sibling repo may hold Gutenberg package implementation work after the browser feasibility gates justify parallelization. Until an ADR says otherwise, this repo's Beads database remains the task authority for that work.
- `../wordpress-develop` is the vanilla WordPress 7.0 oracle checkout. Treat it as read-only unless a task explicitly says otherwise.
- `../gutenberg` is the forward Gutenberg 23.4 oracle checkout. Do not mix this baseline into the WordPress 7.0 distribution track without an ADR.
- `../genes` is the active genes-ts compiler checkout. Compiler fixes discovered here must be generic genes-ts work, not WordPress-specific special cases.
- `../haxe.compilerdev.reference/haxe` is the Haxe 4.3.7 compiler source reference, including the PHP generator. Treat the wider `../haxe.compilerdev.reference` tree as reference material with nested repos.
- `../haxe.compilerdev.reference` also contains local source references for tink/coconut/genes-style libraries. Use `../haxe.compilerdev.reference/tink_hxx` when designing HHX/markup parsing and typed template authoring.
- `../opencodehx` and `../codex-hxrust` are precedent/reference repos for porting workflow, Beads practice, compiler-pressure handling, and generated-target quality. Do not copy their rules blindly; adapt only what fits this PRD.

Record checkout paths, commits, dirty state, and intended authority in `upstream.lock.json` or later lock manifests before using a repo as evidence.

## Core Porting Rules

1. Behavioral parity wins. Upstream WordPress and Gutenberg are the oracles; a cleaner Haxe design is not enough to change observable behavior.
2. Haxe-authored source is authoritative for migrated runtime logic. Generated PHP, TypeScript, TSX, JavaScript, source maps, manifests, and distro files are build artifacts.
3. This is a complete port, not a typed wrapper layer. Typed compatibility surfaces are bootstrap scaffolding for ABI preservation, inventories, shells, and oracle tests; every temporary wrapper needs an ownership state and removal gate.
4. Fix design smells when evidence and tests protect the compatibility boundary. Before parity, internal improvements must preserve observable behavior; after parity, refactor behind the same oracle gates.
5. Never hand-edit generated target files. Fix Haxe source, macros, the linker, genes-ts, or the Haxe PHP backend.
6. Do not hide unsupported constructs. Create Beads issues and compiler-pressure records with minimized fixtures, upstream references, fallback, and removal condition.
7. Keep upstream checkouts as siblings by default. Do not vendor, copy, or submodule WordPress, Gutenberg, genes-ts, or compiler repos unless a Beads task and ADR explicitly choose that path.
8. Keep CAF out of bootstrap work. Preserve machine-readable boundaries for future ingestion, but do not add CAF commands, gates, or dependencies during the initial program setup.
9. For unusually tricky or high-impact issues, especially architecture, compiler/target strategy, generated PHP ABI design, test architecture, concurrency/workflow design, or long-lived migration plans, explicitly consider asking GPT 5.5 Pro for a second-pass review. Refer to that external architecture reviewer as **the oracle** in notes, prompts, and Beads comments, while keeping WordPress/Gutenberg as the behavior oracles. Do not block routine implementation on the oracle, but when risk is high, suggest an oracle review and capture the prompt/context bundle so the decision is reproducible.

## Haxe and Target Design

- Prefer typed Haxe models, abstracts, enums, typedefs, and macros where they strengthen the source without obscuring target behavior.
- Do not PHP-ify Haxe source just because the first target is PHP. Generated PHP, public ABI files, and compatibility shells must meet or exceed WordPress 7.0 code quality, interface, reflection, and ecosystem expectations, but the Haxe source should be idiomatic modern Haxe. Use Haxe features such as enums, abstracts, structural typedefs, generics, pattern matching, extension methods, inline helpers, and macros when they reduce duplication, clarify ownership, or improve refactorability without weakening parity evidence. Source-level improvements are encouraged when they preserve the same public WordPress ethos and observable interface; avoid abstractions that obscure PHP-visible behavior, hide compatibility effects, or add portability layers before a real second provider needs them.
- Prefer module-level functions when behavior is stateless and does not need class identity, inheritance, reflection-visible grouping, or a target ABI shell. Do not create public static "utility" or "strategy" holder classes just to organize functions; use classes when they model state, nominal contracts, generated public ABI, or a real target boundary.
- Document every Haxe module and class with a short comment that explains its role, ownership boundary, or emitted-target contract. Document functions once they pass a reasonable complexity threshold: branching policy with non-obvious invariants, parity-sensitive behavior, side effects, target/runtime boundary assumptions, generated ABI implications, or anything future porters would otherwise need to rediscover from upstream. Avoid noisy comments on tiny self-evident helpers, but do not leave complex behavior undocumented.
- Target-shaped Haxe is allowed when it preserves WordPress PHP, browser, React, or package semantics. Do not add a broad portability abstraction before parity evidence exists.
- For Haxe-owned templates and markup, prefer an HXX-style typed authoring path when it improves clarity, safety, or WordPress ergonomics. Adapt the PhoenixHx/RailsHx pattern: inline markup and typed template references should lower to normal WordPress-compatible PHP/HTML, theme, admin, block, or browser artifacts; raw PHP/HTML template segments are explicit adoption boundaries with provenance and removal gates. Do not use HXX to bypass mixed PHP/HTML caller-scope, include-order, global, output-buffer, hook, or template-loader parity requirements.
- Hard rule: do not use `Dynamic`, `untyped`, raw `php.Syntax.code`, raw JavaScript, broad casts, or generated `any` casually. Prefer concrete Haxe types, typedefs, abstracts, enums, or target-native extern types. If one of these escape hatches is truly required, keep it at the smallest runtime/compiler boundary, add a nearby comment explaining why no narrower type works yet, and file follow-up work when the boundary should narrow.
- For JSON and untyped payloads, prefer the strongest practical typed model before introducing or preserving an `Unknown`/`Dynamic`-backed wrapper: a precise domain typedef/enum plus decoder, a generated or macro-backed codec/parser/writer, a recursive typed JSON value enum/abstract for genuinely open JSON, and only then an unknown boundary for uninspected passthrough. An unknown wrapper is not a domain model by itself; it must restrict operations, emit or decode to a narrower type before app logic reads it, or document that the value may only be passed through, stored, encoded, identity-compared, or immediately narrowed. If such a boundary remains, the nearby WPHX-211-style comment must say why a domain type or typed JSON codec is not practical yet, what contains the unsafety, and which Beads issue, schema, fixture, or owner can replace it.
- Do not port runtime behavior by pasting generated PHP or JavaScript bodies into Haxe strings. Typed Haxe should own the decision/model logic first; unavoidable PHP-native or JS-native operations must be isolated behind the narrow WPHX-211 boundary style with evidence, comments, and removal/follow-up ownership.
- Large public adapter bodies must not live as inline `PhpRawBlock`/string concatenation in Haxe source. If a parity-sensitive PHP/JS public ABI body is still too target-native for structured IR, make it a named compiler-owned adapter template or structured adapter source artifact under the compiler tree, with narrow placeholders, manifest-recorded path/hash/provenance, upstream/fixture evidence, and an explicit path toward typed IR or backend support when the body becomes reusable. Such templates are compiler inputs, not runtime implementation files and not generated targets. Keep inline raw blocks small; if a raw block carries orchestration logic, split it into typed IR nodes or a provenance-tracked adapter template before adding more slices.
- PHP ABI shells are compatibility adapters, not hand-written implementation destinations. Haxe-owned source or typed Haxe metadata should describe both the runtime behavior and the public ABI/shell contract so PHP can be one generated target adapter and another runtime/language adapter can be generated later if needed. New shell bodies used by fixtures may be temporary scaffolding only when explicitly labeled with ownership state and removal gate; durable shells must be generated by Haxe source, macros, the original-path linker, or a generic PHP backend/custom-target improvement. If the stock Haxe PHP target cannot generate an idiomatic required shell shape, capture compiler-pressure evidence and consider a generic backend/Reflaxe path rather than normalizing long-lived hand-authored PHP in JavaScript runners.
- Copied, transformed, hand-authored, or JS-patched public PHP shells may support bridge evidence or helper-candidate evidence only. Durable public PHP ownership claims must cite the shell-retirement ladder in `docs/operations/ownership-state-model.md` and point to compiler-emitted original-path shell evidence, durable adapter evidence, whole-file evidence, or an accepted backend/custom-target improvement.
- WPHX PHP is the active staged custom PHP compiler lane, not merely a temporary shell generator. It uses Reflaxe infrastructure, but its current admitted scope is Adapter IR-backed WordPress original-path public adapter emission, while stock Haxe PHP remains a private implementation/stdphp oracle until specific fixtures move that responsibility. Design new Haxe annotations, ABI metadata, and Adapter IR nodes as if a later full WPHX PHP backend or extracted `reflaxe.php` target will consume them without Haxe source rewrites; do not describe WPHX PHP as a mature full PHP target or flip to arbitrary-Haxe backend scope without minimized evidence, receipts, generated PHP quality gates, and an ADR.
- Macros should generate deterministic boilerplate, manifests, validators, and ABI bindings. They should not become broad textual rewrites of generated PHP or TypeScript.
- Public PHP boundaries must preserve native PHP arrays, globals, references, conditional declarations, reflection-visible signatures, classes, traits, include timing, and mixed template behavior.
- PHP is the privileged compatibility host for current WordPress parity. Rust/native providers are future optional internal providers only for pure kernels with PHP fallbacks and native-on/native-off differential evidence; do not describe a Rust-first or peer PHP/Rust core as a current compatibility goal.
- Generated PHP is a compatibility surface. It should remain idiomatic enough for existing WordPress plugins, themes, reflection, stack traces, and operational tooling to work against the same public interfaces. Do not assume stock Haxe PHP is good enough for public WordPress distribution files; use it first for private implementation output, while WPHX PHP owns bounded original-path public adapters as the staged custom compiler. If clean Haxe source cannot emit suitable private implementation PHP, prefer a generic Haxe PHP backend improvement first. Promote WPHX PHP toward a broader Reflaxe/custom PHP backend only when the staged Adapter IR path accumulates backend-scale pressure, with compiler-pressure evidence, parity receipts, and an ADR; use sibling custom-compiler repos such as `../haxe.ruby`, `../haxe.elixir.codex`, and `../haxe.rust` as references, not copy-paste sources.
- A custom/Reflaxe PHP generator must reuse or adapt Haxe's standard library and stock PHP target behavior wherever practical, using `../haxe.compilerdev.reference/haxe` as the oracle for std/php lowering. Do not reimplement stdlib, runtime boot, native PHP array helpers, string/Unicode behavior, reflection basics, or target intrinsics merely because the first driver fixture is small. Add WordPress-specific lowering only where WordPress ABI, original-path layout, conditional declarations, ecosystem reflection, or parity evidence requires it, and keep those specializations named and bounded so the generator can later become a reusable `reflaxe.php`-style target.
- Prefer Haxe extension-style helpers such as `using StringTools` for string operations when they keep source idiomatic and readable.
- Browser boundaries must preserve package exports, WordPress script handles, globals, object semantics, React/TSX behavior, source maps, and upstream bundling expectations.

## Compiler Improvement Loop

When this port exposes a genes-ts or Haxe PHP target limitation:

1. Reduce it to the smallest generic fixture.
2. File/link Beads work in this repo and, when editing a sibling compiler repo, follow that repo's own `AGENTS.md` and task workflow.
3. Fix the compiler generically. Never add WordPress/Gutenberg path names, product assumptions, or one-off special cases to `../genes` or Haxe compiler code.
4. Run the relevant compiler checks before relying on the fix here.
5. Update pins, manifests, compiler-pressure records, and receipts only after the fix is landed or explicitly recorded as temporary local evidence.

Generated target readability is a product surface. If good Haxe source emits weak, noisy, or invalid target code, prefer a generic compiler improvement over source contortions.

## Documentation

Keep `README.md`, `docs/operations/repositories.md`, `docs/operations/dependent-libraries.md`, `docs/operations/hhx-template-policy.md`, `docs/operations/port-philosophy.md`, `docs/operations/beads.md`, `docs/operations/agent-instructions.md`, `docs/operations/ownership-state-model.md`, `docs/operations/progress-matrix.md`, lock manifests, `AGENTS.md`, and Beads current as repo paths, baselines, gates, or operating rules change. Do not let chat history become the only source of truth.

Hard rule: keep `docs/operations/progress-matrix.md` current. Any task that changes parent milestone status, seeds or closes a major `WPHX-*` track, adds or removes material evidence gates, changes the Gutenberg/gutenberghx plan, changes ownership-state interpretation, or changes the super-progress estimate must update the matrix in the same change. Progress claims must distinguish Beads child completion from verified Haxe ownership and installed WordPress functionality.

## Beads Authority

- Required local Beads version is pinned in `.beads/.local_version` and mirrored in `toolchain.lock.json`.
- The root `.beads` store is authoritative for this program. Sibling repo `.beads` stores are reference context unless the current task explicitly enters that repository and follows its own `AGENTS.md`.
- From sibling checkouts, nested repos, or task worktrees, use `tools/bd-wphx` from the program root so Beads commands resolve to this repository's root database.
- Parallel write-capable agents must follow `docs/operations/multi-agent.md`: one claimed Beads issue, one branch, one worktree, non-overlapping owned paths, and a handoff that records discoveries.
- Beads is on embedded Dolt storage as of WPHX-016. `bd doctor` is not supported in this embedded mode; use `bd info`, `bd dolt status --json`, and `bd backup status --json` until a later Beads release changes that.
- Beads sync uses the configured SSH Dolt remote in `.beads/config.yaml`; use `bd dolt push` / `bd dolt pull` for task database sync. `bd export -o .beads/issues.jsonl` refreshes the tracked interchange export but is not the durable sync channel.
- Beads backup and restore are documented in `docs/operations/beads-backup-restore.md`.

## Local Hooks and Checks

- Install hooks with `npm run hooks:install` after cloning or when hook scripts change.
- The pre-commit hook must run a staged gitleaks scan, format staged `.hx` files with `haxelib run formatter`, and keep the WPHX PHP WordPress-profile adapter raw-block guard green.
- Use `npm run security:gitleaks` for full-history secret scanning.
- Use `npm run format:haxe:check` for tracked Haxe formatting checks. It is valid for this to report no tracked Haxe files during bootstrap.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Atomically claim work
bd close <id>         # Complete work
bd export -o .beads/issues.jsonl  # Refresh tracked JSONL export
bd dolt push          # Sync Beads Dolt state
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd export -o .beads/issues.jsonl
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
