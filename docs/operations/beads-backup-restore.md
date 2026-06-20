# Beads Sync And Restore

WPHX-807 configured Beads 1.0.4 sync and backup for the program database.

## Dolt Remote

The root `.beads/config.yaml` now contains:

```yaml
sync.remote: "git+https://github.com/fullofcaffeine/wordpress-hx.git"
```

Push and pull Beads state with:

```bash
bd dolt push
bd dolt pull
```

Fresh clones can recover the task graph with:

```bash
bd bootstrap --yes
```

In the WPHX-807 drill, a fresh clone detected `refs/dolt/data` on GitHub origin, cloned the Dolt database, and reproduced the source issue counts and ready queue.

## Backup

The local filesystem backup used for the drill is outside this repository:

```text
../wordpresshx-beads-backup
```

Sync the configured backup with:

```bash
bd backup sync
```

Restore into an initialized checkout with:

```bash
bd backup restore --force ../wordpresshx-beads-backup
```

Machine-local backup state files under `.beads/` are ignored by git. The durable shared sync channel is the Dolt remote; the local filesystem backup proves restore mechanics and can be replaced by a cloud/NAS/DoltHub destination in a later operations task.

## Verified Drill

Source and restored state matched:

- issues: 28;
- closed tasks: 21;
- in-progress tasks: 1 (`WPHX-807`);
- dependency edges: 73;
- memory surface: empty, schema version 1 on both sides;
- ready queue: `WPHX-000`, `WPHX-011`, `WPHX-100`, `WPHX-400`, `WPHX-700`, `WPHX-800`.

The fresh restore path was `/tmp/wordpresshx-wphx807-restore-20260619222425`.
