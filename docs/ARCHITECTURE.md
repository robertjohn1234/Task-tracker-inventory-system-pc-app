# Architecture

## Folder map

```
src/
  main/                  Electron main process (Node, can touch files)
    main.js              creates the window, registers every feature
    preload.js           the ONLY bridge: exposes window.api to the screens
    files/               scanner, extractor, organizer, file operations, previews
    tasks/               tasks engine
    inventory/           inventory-core (rules), inventory (IPC), inventory-import (Excel)
    notes/  punch/  ai/  appearance/
  renderer/              Screens (browser side, no direct Node access)
    index.html           loads every screen script, in order
    core/                shared UI: theme, intro, tabs, UI kit
    files/ tasks/ notes/ punch/ ai/
    inventory/           inventory-mode (switch), inventory-ui (Consumables), tools-ui (Tools & Equipment)
    reports/             reports-ui (the Reports tab), damaged-report (damaged & missing tools report)
assets/                  icons and images
tests/                   automated tests (node:test)
tools/                   organize.js (one-time), check.js (npm run check)
docs/                    this file
_unused/                 code that is no longer loaded (kept, not deleted)
```

## The three layers of a feature

1. **Rules** (`src/main/<feature>/<feature>-core.js`) — plain functions, no Electron.
   `saveItem(data, input)` returns `{ ok: true, ... }` or `{ ok: false, error }`.
   Everything that decides "is this allowed" lives here, so it can be tested.
2. **Engine** (`src/main/<feature>/<feature>.js`) — `registerX(ipcMain, ctx)`. Loads/saves the
   data file, and turns each screen request into a call to the rules (`ipcMain.handle('inv-load', ...)`).
3. **Screen** (`src/renderer/<feature>/*.js`) — draws the UI and calls `window.api.xxx()`.

The name links them: `window.api.invLoad` (preload) ⇄ channel `inv-load` (engine).

## Inventory: two systems on one data file

- One ledger file; two **views**. `inv-load(scope)` is called with `'consumables'` or `'tools'`
  and the engine returns only that part (items, movements, loans, repairs, categories, summary).
  Excel export asks for `'all'`.
- `inventory-mode.js` draws the switch and owns the two containers `#invConsumables`, `#invTools`.
  The choice is remembered per PC (`wh-inv-mode`).
- `inventory-ui.js` = Consumables screen. It also exports `window.InvKit` (shared dialogs and helpers).
- `tools-ui.js` = Tools & Equipment screen; it only uses `window.InvKit` and `window.api`.
- New tool items require a picture (`REQUIRE_PHOTO` in `tools-ui.js`, and the rule in `saveItem`).
  Pictures are small files in `<data folder>/inventory/photos/` named after their content (`ph-<20 hex>.jpg`, the same picture is stored once).
  The data file only holds the file name. The screens show them through `InvKit.photoSrc()` (a `file://` link, lazy-loaded).
  The main process turns new data-URL pictures into files (`photoToFile` / `migratePhotos` in `inventory.js`); old data is converted on the first start.
  Backups copy only the JSON, so copy the `photos` folder too when moving to another PC. The Send / receive file (.whinv) carries the pictures inside it.

## Reports tab

`reports-ui.js` owns the tab and its sub-tabs. A report section registers itself:
`Reports.register({ id, label, el, onShow })` (see the top of `reports-ui.js`). The punch list screen
(`punch/punch-ui.js`) sits inside it and is opened with `PunchUI.load()`.
`DamagedReport.open(state?)` builds the damaged & missing tools report; it is also used by the
Repairs tab in Tools & Equipment. To add a report: write `reports/<name>-report.js`, add its `<script>`
before `reports-ui.js`, and register a section.

## Conventions

- Renderer scripts are classic scripts sharing globals; each screen exposes one object on `window`
  (`InvKit`, `ToolsUI`, `InvMode`). Don't add new loose globals — add to a feature object.
- Never let a screen read files directly: add an engine handler + a preload line.
- Validation lives in `*-core.js`, never only in the screen (screens can be bypassed, tests can't).
- Every change to stored data gets a new `updatedAt`; deletes are tombstones (`deleted: true`) so sync works.
- Dates are ISO `YYYY-MM-DD` strings.
- One feature = one folder in `main/` and one in `renderer/`.

## Adding a new feature (checklist)

1. Create `src/main/<name>/<name>-core.js` (rules) and `<name>.js` exporting `registerName(ipcMain, ctx)`.
2. In `src/main/main.js`: `require('./<name>/<name>')` and call `registerName(ipcMain, ctx)`.
3. In `src/main/preload.js`: add `nameDoThing: (x) => ipcRenderer.invoke('name-do-thing', x)`.
4. Create `src/renderer/<name>/<name>-ui.js`; add its `<script>` to `src/renderer/index.html`
   (after `core/…`, before nothing that depends on it).
5. Add a nav button in `index.html` and show/hide it where the other tabs are handled.
6. Write tests in `tests/<name>-core.test.js` for the rules.
7. `npm test` and `npm run check`, then `npm start`.

## Data files (`%APPDATA%\work-helper`)

Inventory ledger (JSON), backups folder, settings. `.whinv` is the export used to sync two PCs;
merge keeps the newest `updatedAt` per record.

## Records, Removed and the admin PIN (Tools & Equipment)

- **Records** tab = every new tool and every added unit (supplier, DR / PO number). **Removed** tab = every unit that left the stock (reason, what happened, who approved), with Print / PDF for the boss to sign.
- Removing tool units is only possible with a fixed reason (`TOOL_OUT_REASONS` in `inventory-core.js`), a written explanation and an "Approved by" name. The core checks these (`needApproval`).
- The **admin PIN** is checked in the main process only (`needPin` in `inventory.js`): salted scrypt hash in `<data folder>/inventory/admin-pin.json`, 5 wrong tries = 5 minute lock, every attempt written to `audit.log`.
  It guards: removing / correcting tool units, deleting tool stock entries, Lost (report or return), write-off, undoing entries that took stock out, and clear-all.
- The renderer asks the main process first without a PIN; the answer code (`NO_PIN`, `PIN`, `PIN_WRONG`, `PIN_LOCKED`) makes `InvKit.withPin()` show the right dialog and retry.
- It is a deterrent, not real security: the data is a plain JSON file on the PC. Forgot the PIN: close the app, delete `admin-pin.json`, set a new one.

## Price and the Insights tab (Tools & Equipment)

- `price` is optional everywhere: on the tool (price per unit) and on added units (the purchase price; the latest purchase price becomes the tool's price). `null` = not known; nothing is ever blocked for a missing price.
  Totals always say how many tools are priced. The Tools filter has "Missing price" and "Missing location".
- The **Insights** tab (`insightsData()` in `tools-ui.js`) works only from data already in the app: needs attention, problem tools, borrowers to follow up,
  idle tools (90 days, `IDLE_DAYS`), always-out tools, removals by month / reason, and data to complete. The same sections feed the on-screen tables and the Print / PDF.
  A tool that was never lent counts its idle days from the day it was created in the app.
