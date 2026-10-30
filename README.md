# MonoSpec

Static artifact viewer driven by collection/item catalogs and media assets.

Serve this directory over HTTP, for example with Python 3:

```text
python -m http.server 5500 --bind 127.0.0.1
```

Open `http://127.0.0.1:5500/`; stop with Ctrl+C. HTTP is needed for catalog fetches. The app loads `monospec-data.generated.json`, then `monospec-data.json`, then internal fallback data. No package installation/build is configured.

With Node (validated with 24.14.1), run `node --check monospec-app.js`. No automated app/build/lint gate is configured; browser media/navigation behavior needs separate review.

Optional note import from this repository directory, with PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Import-ObsidianToMonospec.ps1 -VaultPath .\obsidian -OutputPath .\monospec-data.generated.json
```

This overwrites the chosen output; preserve existing catalogs before intentional regeneration. Import uses a limited line-based frontmatter parser, comma-separated tags, and JSON metadata fields, not general YAML. Asset `src` paths are checked relative to the working directory. Test changes with synthetic notes and temporary output before importing personal content.

`index.html`, `monospec-app.js`, catalogs, and `assets/` are runtime inputs. `scripts/` is project-coupled authoring infrastructure; `obsidian/` holds source notes. Keep their intended paths and provenance together. Review publishing inputs/notes separately from Git ignores; no hosting configuration is supplied.

See [AGENTS.md](AGENTS.md) for constraints. Optional local guides are indexed at `../_docs/README.md` and may be absent in clones; normal runtime does not require them.
