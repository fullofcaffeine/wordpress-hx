# Vanilla Oracle

WPHX-008 creates the first vanilla runtime receipts. The goal is not differential parity yet; it is to prove that the local control plane can produce PHP, DB, and browser baseline evidence from the locked WordPress inputs.

Run:

```bash
npm run oracle:vanilla
```

The runner performs three probes:

- PHP: reads WordPress 7.0 version constants from `../wordpress-develop` and lints `src/wp-settings.php`.
- DB: starts a temporary Dockerized MySQL 8.4 server pinned by digest and queries it through PHP `mysqli`.
- Browser: launches installed Google Chrome through Playwright and captures a DOM/user-agent smoke result.

Outputs:

- `manifests/oracle/vanilla-oracle-baseline.v1.json`
- `receipts/oracle/wphx-008-php-baseline.v1.json`
- `receipts/oracle/wphx-008-db-baseline.v1.json`
- `receipts/oracle/wphx-008-browser-baseline.v1.json`
- `receipts/oracle/wphx-008-vanilla-oracle-summary.v1.json`

Later oracle work should replace these smoke receipts with WordPress install, admin, frontend, editor, REST, and Gutenberg package flows.
