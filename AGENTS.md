# Monospec Development

Read [README](README.md) for serving, import commands, and ownership.

- Preserve collection/item/asset contracts and load order: generated JSON, authored JSON, then internal fallback data. Avoid interpreting old design-plan filenames as current entry points.
- Runtime files are `index.html`, `monospec-app.js`, JSON catalogs, and `assets/`. Keep required media/catalog URLs intact.
- `scripts/Import-ObsidianToMonospec.ps1` is a project-coupled authoring tool; keep it repository-owned with `obsidian/` inputs when intended. It resolves media relative to cwd, so run it from this directory with explicit vault/output paths.
- Check JS with `node --check monospec-app.js`. No package/build/lint or automated app regression runner is configured. Validate importer changes with synthetic notes and temporary output before touching runtime catalogs.
- Follow applicable parent instructions when present; optional local context is `../_docs/README.md`, absent in clones. Normal app serving cannot require outer docs. Preserve unrelated changes and report unverified media/browser behavior.
