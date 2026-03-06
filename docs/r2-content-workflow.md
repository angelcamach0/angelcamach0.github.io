# R2 content workflow

This project now supports a remote catalog backed by Cloudflare R2.

The current model is:

1. Upload files into the R2 bucket using a type prefix.
2. The Worker lists bucket contents and turns them into catalog entries.
3. The frontend fetches the catalog and maps entries into grid tiles.
4. `00-0A` remains reserved for the terminal.

## Allowed top-level prefixes

Use one of these top-level prefixes for every uploaded item:

- `code/`
- `guide/`
- `post/`
- `journal/`
- `note/`
- `doc/`

## Folder layout

Each item should live under its own slug folder:

```text
code/bash-backup/file.sh
code/bash-backup/meta.json

guide/linux-ssh/guide.pdf
guide/linux-ssh/meta.json
```

R2 is object storage, so these are key prefixes rather than real folders, but the Worker treats them like folders.

## `meta.json`

`meta.json` is optional. If it exists, it can override the generated tile metadata.

Example:

```json
{
  "title": "Bash Backup Helper",
  "summary": "Small rsync backup helper for rotating working directories.",
  "tags": ["bash", "backup", "automation"],
  "order": 20,
  "asset": "file.sh"
}
```

Supported fields right now:

- `id`
- `title`
- `summary`
- `tags`
- `order`
- `asset`

## Catalog behavior

The Worker turns each item folder into a tile entry with:

- `id`
- `type`
- `title`
- `summary`
- `repo` = `r2`
- `path`
- `tags`
- `href`
- `order`

The frontend uses that remote catalog first and falls back to `data/tiles.json` only if the remote endpoint is unavailable.

## Notes

- The first non-`meta.json` file in a folder becomes the default asset unless `meta.json` sets `asset`.
- Embedding decisions are not implemented yet. The current phase is cataloging and serving content.
- D1 is intentionally deferred. R2 is the file layer for phase one; D1 can be added later for richer metadata and indexing.
