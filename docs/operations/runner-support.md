# Runner Support

WPHX runners should use `tools/support/wphx-runner-support.mjs` for shared evidence plumbing:

- SHA-256 artifact records with byte counts;
- deterministic write/check mode;
- JSON text rendering;
- process stdout/stderr capture by digest;
- verification receipt construction with `evidence_class`, `artifact_scope`, and `behavior_parity_claimed`.

Run:

```bash
npm run operations:runner-support
npm run operations:runner-support:check
```

WPHX-700.06 first adopts the shared support in `tools/upstream/run-phpunit-ratchet.mjs`. Larger runner pieces such as Docker lifecycle management and candidate distribution assembly can be extracted later once a second or third runner needs the same behavior.
