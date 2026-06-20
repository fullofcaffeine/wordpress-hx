# WordPress Public Type Emitter

WPHX-206 adds the deterministic fixture for public PHP class, interface, and trait emission.

## Contract

- PHP shells own WordPress-visible class, interface, and trait names.
- Shells preserve repeated include safety through conditional declarations.
- Reflection-visible ABI details stay native: namespace, short name, parent class, interfaces, traits, constants, method parameter/default/type data, return type data, property visibility, and static flags.
- Haxe implementation code stays behind the public shell and owns selected method payloads.
- Both global WordPress-style symbols and namespaced symbols are covered because WordPress 7.0 has both.

## Verification

Run:

```bash
npm run wp:public-types
npm run wp:public-types:check
```

The runner compiles the Haxe payload, links a WordPress-shaped generated shell, reflects the oracle and generated shells in isolated PHP processes, and records evidence in:

- `manifests/wp-public-types/wphx-206-public-types.v1.json`
- `receipts/wp-public-types/wphx-206-public-types.v1.json`
