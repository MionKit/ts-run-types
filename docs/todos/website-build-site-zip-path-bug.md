# website build: `site.zip` step was dead (OUTPUT_DIR path typo)

**Status:** fixed incidentally during the scripts shell→.mjs migration (recorded here for the trail)
**Severity:** low (the zip is a side artifact — a manual-upload/backup convenience; it never fed the Cloudflare deploy, which uploads `container/website/.output/public`).

## What it was

The former [`scripts/website/build.sh`](../../scripts/website/build.sh) computed the output dir for its
final "package the static site into `.output/site.zip`" step as:

```sh
OUTPUT_DIR="$SCRIPT_DIR/../container/website/.output"
```

`SCRIPT_DIR` is `scripts/website`, so `$SCRIPT_DIR/..` is `scripts/`, and the path
resolved to `scripts/container/website/.output` — which does not exist. Every other
path in the script used `$SCRIPT_DIR/../..` (repo root) correctly; this one line was
a single `../` short.

Consequences (both silent):
- `[ -d "$OUTPUT_DIR/public" ]` was always false, so the `zip` step never ran and
  `.output/site.zip` was never produced, despite the script's header advertising it.
- The closing `[ -f "$OUTPUT_DIR/site.zip" ]` "static zip:" line never printed.

The static site itself was always produced correctly at `container/website/.output/public`
(by `site.sh generate`), so builds and the Cloudflare deploy were unaffected — only
the optional zip was missing.

## What shipped

The port to [`scripts/website/build.mjs`](../../scripts/website/build.mjs) anchors the
output dir at the repo root (`join(REPO_ROOT, 'container/website/.output')`), so the
zip step now runs as originally intended: after a `generate`, it writes
`container/website/.output/site.zip` (contents of `public/` at the zip root). It is a
sibling of `public/`, never swept into the deploy upload. The `zip` binary is still
optional — a missing `zip` warns and skips (unchanged).

If preserving the exact prior behavior (no zip) is preferred, drop the zip block in
`build.mjs` `main()`.
