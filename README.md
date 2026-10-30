# Work Helper

Local desktop app (Electron) for files, tasks, inventory, notes and punch records.
All data stays on the PC in `%APPDATA%\work-helper`.

## Everyday commands

| Command         | What it does                                              |
|-----------------|-----------------------------------------------------------|
| `npm start`     | Run the app                                               |
| `npm test`      | Run the automated tests (inventory rules, Excel import)   |
| `npm run check` | Check every file path, `require` and `<script>` still resolves |

Run `npm test` and `npm run check` before every commit or before you send a new build to testers.

## Where things are

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — folder map, how a feature is wired,
and a checklist for adding a new feature.
