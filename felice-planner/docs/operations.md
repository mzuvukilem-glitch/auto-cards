# Operations guide

Installing, configuring, running, backing up and maintaining Alur & Felice Planner.

## Contents

1. [Requirements](#1-requirements)
2. [First-time setup](#2-first-time-setup)
3. [Running the app](#3-running-the-app)
4. [Configuration](#4-configuration)
5. [Backups](#5-backups)
6. [Restoring](#6-restoring)
7. [Upgrades and the automatic backup](#7-upgrades-and-the-automatic-backup)
8. [Loading data from the original planner](#8-loading-data-from-the-original-planner)
9. [Sharing the app on a network](#9-sharing-the-app-on-a-network)
10. [Changing the app](#10-changing-the-app)
11. [Testing and checks](#11-testing-and-checks)
12. [Troubleshooting](#12-troubleshooting)
13. [Project layout](#13-project-layout)
14. [Moving the app to another machine (Windows)](#14-moving-the-app-to-another-machine-windows)

---

## 1. Requirements

* **Node.js 24 or newer** (the server runs TypeScript directly and uses the built-in `node:sqlite`). Check with `node -v`.
* **npm** (comes with Node).
* A modern browser.

No database server, no Docker and no build step on the server are needed.

## 2. First-time setup

```bash
cd felice-planner
npm install          # installs the server, web and shared packages
npm run setup        # creates server/.env with a random password and session secret
```

`npm run setup` prints the sign-in password once and writes it, together with a random `SESSION_SECRET`, to `server/.env` (permissions `0600`). It will not overwrite an existing `.env`.

The database file `server/data/planner.db` is created automatically the first time the server starts, with the two organisations (Felice and Alur) already in it.

## 3. Running the app

| Goal | Command | Open |
|---|---|---|
| Develop (auto-restarts on change) | `npm run dev` | <http://localhost:5173/> |
| Run for real (one process) | `npm run build` then `npm start` | <http://127.0.0.1:4000/> |

In development two processes run together: the API on port 4000 and the Vite web server on port 5173, which forwards `/api` to the API. In production the API server also serves the built web app from `web/dist`, so there is only one process.

To stop, press Ctrl+C in the terminal that is running it.

All commands, run from the project root:

| Command | What it does |
|---|---|
| `npm run setup` | Create `server/.env`. `npm run setup -- "<file>"` creates the settings file somewhere else instead. |
| `npm run dev` | API and web in development mode. |
| `npm run build` | Type-check and build the web app into `web/dist`. |
| `npm start` | Start the API server (serves `web/dist` if it exists). |
| `npm run seed -- --file "<xlsx>" --year 2026 --org felice` | Load the original planner workbook into an organisation. |
| `npm run backup` | Write a safe copy of the database to `server/backups/`. (The app's **Backup & restore** page does the same, and restores.) |
| `npm run typecheck` | Type-check the server, the web app and the shared code. |
| `npm test` | Run all the automated tests (server and web). |
| `npm run test:coverage` | Run them and fail unless coverage is 100%. |

## 4. Configuration

Settings live in `server/.env`. `server/.env.example` shows the format.

| Setting | Default | Meaning |
|---|---|---|
| `APP_PASSWORD` | none (required) | The sign-in password. At least 12 characters. |
| `SESSION_SECRET` | none (required) | Signs the session cookie. At least 32 random characters. |
| `PORT` | `4000` | Port the API listens on. |
| `HOST` | `127.0.0.1` | Address to listen on. Leave as is to keep the app reachable from this machine only. |
| `DB_PATH` | `./data/planner.db` | The database file. A relative path starts in the `server/` folder, whichever folder you run the command from. An absolute path (`C:\data\planner.db`, `/var/lib/planner.db`) is used as given. |
| `COOKIE_SECURE` | `false` | Set to `true` when the app is served over HTTPS, so the cookie is only sent over HTTPS. |

The server refuses to start, and says why, when the password or secret is missing or too short.

> **A setting that already exists in your terminal or system environment wins over `server/.env`.** If you change `APP_PASSWORD` (or any other setting) in the file and nothing changes, check that the same name is not already set elsewhere.

* **Change the password:** edit `APP_PASSWORD`, then restart. Existing sessions stay valid until they expire.
* **Sign everyone out:** change `SESSION_SECRET` and restart.

Never commit `server/.env` (it is already in `.gitignore`).

## 5. Backups

The database is the single file `server/data/planner.db`. While the app is running it also has `planner.db-wal` and `planner.db-shm` beside it, which hold recent changes. **A plain file copy while the app is running can miss recent changes**, so use SQLite's own copy, which is safe at any time:

```
npm run backup
```

This writes a single, consistent, compact file to `server/backups/planner-<date and time>.db`. To choose the location yourself: `npm run backup -- --out "D:\backups\planner-2026-11-30.db"` (the command stops if the file already exists). The command is the same on Windows, macOS and Linux. Keep copies somewhere other than this machine.

A good routine: back up before importing a spreadsheet, before deleting weeks, and at the end of each week or month.

**From inside the app.** Choose **Backup & restore** in the sidebar (on every page) and press **Download backup**. It saves the same kind of single, consistent file, to your browser's download folder, and works while others are using the planner.

You can also export a report to Excel from the app at any time. That is useful for sharing, but it is not a full backup (it does not contain recurring costs).

## 6. Restoring

**From inside the app (no restart needed).** Choose **Backup & restore** in the sidebar, then **Restore from a backup**, and choose a backup file (from *Download backup* or `npm run backup`). The file is checked first and shown next to the current data: weeks, cost lines, recurring costs, rider prices, imported actual weeks and the latest week for each company. Nothing changes until you press **Restore this backup** and confirm.

* **Restoring replaces the data of every company** with what is in the file. A backup is of the whole database, so Felice and Alur are restored together.
* **The data that was there is saved first**, as `server/backups/before-restore-<date and time>.db`. If the restore was a mistake, restore that file the same way to undo it.
* The restore is **all or nothing**. A file that is not a planner backup, is damaged, was made for other companies, or cannot be loaded is refused, and the current data is left as it was.
* A backup from an **older version** is brought up to date as it is read, exactly as starting the app on it would do.
* The page is available to anyone who can sign in, which is everyone who has the planner password. Keep the backup files as private as `server/.env`: they hold all of the data.

**By hand (the app is stopped, or will not start).**

1. Stop the app.
2. In `server/data/`, move `planner.db`, `planner.db-wal` and `planner.db-shm` somewhere safe (the last two may not exist).
3. Copy your backup into `server/data/` and name it `planner.db`.
4. Start the app and check a few weeks.

## 7. Upgrades and the automatic backup

When the app starts against an older database, it upgrades it in place:

* **First start with organisations:** every existing week and recurring cost becomes Felice's. Before changing anything the app writes a backup next to the database, named like `planner.db.before-organisations-2026-11-24T13-53-24-074Z.bak`. It is a normal SQLite file: to go back, restore it as in section 6.
* **Rider costs:** an older database gets the rider-cost column added; existing lines get a rider cost of 0.
* **Resident DJs:** an older database gets a `dj` marker on its lines and recurring costs. Every existing line is marked as not an individual DJ, so **no total changes**: an existing lump-sum Resident DJs line keeps counting until individual DJs are added to that week. This upgrade only adds a column and two indexes, so it writes no `.bak` file. Take a [backup](#5-backups) first if you like.

The upgrades are safe to run again and write only one backup. They are covered by automated tests, including a rebuild of an old-format database.

You can delete the `.bak` files once you are satisfied that everything is in place.

## 8. Loading data from the original planner

You can use the **Import & export** page, or the command line:

```bash
npm run seed -- --file "../../calc/Weekly Planner - April - Dec.xlsx" --year 2026 --org felice
```

* `--file` is the workbook. npm runs this command inside the `server` folder, so relative paths start there (the default already points at the original planner in the `calc` folder next to the project).
* `--year` is the year the sheet belongs to (the sheet has none). It defaults to the current year.
* `--org` is `felice` (default) or `alur`.

The command prints each week imported and any **warnings**, including weeks where the spreadsheet's own TOTALS row does not match its lines. **Importing replaces the lines of any week that already exists**, so back up first.

## 9. Sharing the app on a network

By default only this machine can reach the app. Before letting other people use it:

1. **Put HTTPS in front of it.** Run a reverse proxy (nginx, Caddy, IIS and so on) that terminates HTTPS and forwards to `127.0.0.1:4000`.
2. Set `COOKIE_SECURE=true` in `server/.env`.
3. Only change `HOST` if the proxy is on another machine, and then restrict access with a firewall. Do **not** expose port 4000 directly to the internet.
4. Use a strong, unique `APP_PASSWORD`.
5. Remember that **one password opens both companies**. Anyone who can sign in can read and edit Felice and Alur.

Two things to know when running behind a proxy:

* The sign-in limiter counts failures per **client address as the server sees it**. Behind a proxy that is the proxy's address, so the limit is shared by everyone. That is safe, but a few mistyped passwords by one person can lock out the others for 15 minutes.
* Static files are cached by browsers for an hour. After an update, people may need a hard refresh.

### Using it on a phone or tablet (iPhone, iPad, Android)

The app is a web page, so any current browser works: Safari on iOS and iPadOS, Chrome on Android. Nothing is installed on the device. The server must run on a computer, and the device must be able to reach it:

* **Recommended:** the HTTPS setup above, with `COOKIE_SECURE=true`. Open the HTTPS address on the device.
* **Trying it on your own network without HTTPS:** only on a trusted private network. Set `HOST=0.0.0.0` in `server/.env`, keep `COOKIE_SECURE=false`, restart, allow Node.js through the computer's firewall for private networks, and open `http://<the computer's address>:4000` on the device. Anyone on that network can then reach the sign-in page. Set `HOST` back to `127.0.0.1` when you are done.

To add it to an iPhone or iPad home screen: Share, then Add to Home Screen. It opens in the browser, with the planner's icon.

Export is a normal browser download and import uses the device's file picker. I have not tested either on a physical iPhone or iPad, so check them once on yours.

## 10. Changing the app

### Add another organisation
1. In `server/src/db.ts`, add a line to the `ORGANISATIONS` list: `{ slug: 'newco', name: 'NewCo', color: '#b45309' }`.
2. Restart. The organisation is created, appears in the menu, and is included in all combined reports.
3. Optional logo: put the images in `web/src/assets/logos/` (white artwork on a transparent background works best) and add the slug to the `LOGOS` list in `web/src/logos.tsx`. Without a logo, the name is shown instead.

### Add or change a cost category
Edit `shared/categories.ts`: the `CATEGORIES` list (key, label, colour), and the `RECURRING_CATEGORIES` and `RIDER_CATEGORIES` lists if it applies. Run `npm run typecheck`; it points to every place that needs updating. Existing data is not affected, because categories are stored as plain text.

### Change the browser-tab icon
Edit `web/public/favicon.svg` and the PNG versions beside it.

## 11. Testing and checks

```bash
npm run typecheck          # types for server, web and shared code
npm test                   # all the tests: server (276, one optional) and web (441)
npm run test:coverage      # the same, and fails if coverage of the code is below 100%
npm test -w server         # the server only        (node:test)
npm test -w web            # the web app only       (Vitest)
```

`npm run test:coverage` reports **statements, branches, functions and lines** for `server/src`, `shared/` and `web/src`, and fails if any of them is under 100%. The server tests also start the real programs (`npm start`, `setup`, `backup`, `seed`) as separate processes, and their coverage is counted too. A run that succeeds leaves no temporary files behind. The web report is also written to `web/coverage/` (not committed).

The tests use a temporary in-memory database, so they never touch your real data. The web tests replace the network with a fake, so they need no server. They cover:

* every API endpoint over HTTP, with every refusal it can give, and one organisation never reaching another's data;
* sign-in, the session cookie, the sign-in limit, the CSRF header, the security headers and the error handler;
* the command-line programs and server start-up and shutdown;
* every screen and editor of the web app: what the user sees, what is sent to the server, empty, loading and error states;
* the original planner workbook reconciling with the app, to the cent;
* Felice and Alur being kept apart, and combined totals adding up;
* upgrading an old-format database without losing anything;
* recurring costs, and rate plus rider cost;
* resident DJs, payment batches and the bookings report;
* importing actual expenditure (including the real expense workbook) and planned-against-actual reports;
* the rider price list and rider calculator, checked against the Rider Calc workbook;
* every import template being accepted by its importer.

To also check your live database against the workbook (only meaningful if you loaded the original planner):

Run these from the `server` folder. Setting a variable differs by shell:

```bash
# macOS, Linux (bash, zsh)
FP_LIVE_DB=./data/planner.db npm test
```
```powershell
# Windows PowerShell
$env:FP_LIVE_DB = ".\data\planner.db"; npm test
```
```bat
:: Windows Command Prompt
set FP_LIVE_DB=.\data\planner.db && npm test
```

Add `FP_EXCLUDE=headline,hosts,headline-rider,hosts-rider` the same way if you removed those on purpose.

Before relying on a change, run both commands and `npm run build`.

## 12. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `Invalid configuration … APP_PASSWORD must be set` | There is no `server/.env`, or the values are too short. Run `npm run setup`. |
| `EADDRINUSE` (address in use) | Something is already using the port. Stop the other copy, or set a different `PORT`. |
| The page loads but shows the sign-in again and again | The session secret changed, or the clock is wrong. Sign in again. If it repeats, check that `COOKIE_SECURE=true` is only used over HTTPS. |
| "Too many sign-in attempts" | 5 wrong passwords. Wait 15 minutes, or restart the server (the counter lives in memory). |
| Forgot the password | Open `server/.env`, read or change `APP_PASSWORD`, and restart. |
| The screen looks out of date after an update | The browser cached the old files. Hard refresh (Ctrl+Shift+R on Windows and Linux, Cmd+Shift+R on a Mac). On an iPhone or iPad, close the tab and open it again, or clear the site data in Settings, Safari. |
| "That week already exists" | Each organisation can have a given week only once. Open the existing week instead. |
| "No importable sheet found" | The file is neither an export from this app nor the original planner layout (WEEK 1, WEEK 2 … column headers). |
| Rider calculator: "Only headline acts and hosts have a rider" | The rider calculator is for the Headline Acts and Hosts & Promoters sections, whose lines have a rider cost. Other riders are normal lines in Rider Costs. |
| A rider cost cannot be typed over | It is worked out in the rider calculator (the button under it says how many items). Open it, change the items and save; **Clear items** then **Save** frees the box. |
| The rider price list import says "No header row found" | The file needs an **Item** (or Beverage) column and a **Cost** (or Price) column in its first rows. The Sheet1 tab of the Rider Calc workbook has both. |
| An actuals import says a tab "has no section totals" | The tab has no SUBTOTAL row for any section, so it is not a weekly tab (for example `SUMMARY`). Pick the tab for the week. |
| Actuals show as R0,00 paid | The sheet's *Amount Paid* column is empty. Paid is read from the SUBTOTAL row of each section; fill it in on the sheet and import the week again. |
| Miscellaneous in the comparison looks too high | The sheet's Miscellaneous section can include the other company's costs. In the import preview, type the amount that belongs to this company; importing the week again replaces it. |
| An import changed weeks I did not mean to change | Importing replaces any week that is in the file. Restore a backup (section 6). |
| Totals differ from the old spreadsheet | The old sheet had some wrong totals. The import preview lists them (for example April W1, May W5, June W4). |
| I changed `.env` but the old password or port still applies | The same setting is already defined in the terminal or system environment, which takes priority over the file. Remove it from the environment (or open a new terminal) and restart. |
| Port 5173 is not reachable from another tool | Vite listens on the local address only. Use the production mode (`npm run build`, `npm start`) and open port 4000. |

## 13. Project layout

```
felice-planner/
├── package.json            workspaces and the main commands
├── docs/                   this documentation and architecture.svg
├── shared/                 code used by both sides
│   ├── categories.ts       cost categories, variance groups and month helpers
│   └── types.ts            the API contract
├── server/
│   ├── .env                your settings (not committed)
│   ├── data/planner.db     the database (not committed)
│   ├── src/
│   │   ├── index.ts        start-up and shutdown
│   │   ├── app.ts          builds the server (headers, sign-in, API, web app, errors)
│   │   ├── auth.ts         sign-in, sessions, CSRF header
│   │   ├── config.ts       environment settings
│   │   ├── db.ts           schema, organisations, upgrades
│   │   ├── stores.ts       one data scope per organisation, plus combined
│   │   ├── repo.ts         weeks, lines, recurring costs, imported actuals
│   │   ├── reports.ts      summaries, top lists, comparisons, planned vs actual
│   │   ├── excel.ts        Excel export and import
│   │   ├── templates.ts    downloadable import templates
│   │   ├── actuals.ts      reads a week's section totals from the expense workbook
│   │   ├── backup.ts       safe database copy (npm run backup)
│   │   ├── snapshot.ts     download a backup and restore one from the Backup & restore page
│   │   ├── routes.ts       HTTP endpoints
│   │   ├── validate.ts     input checks
│   │   ├── seed.ts         load the original planner
│   │   └── setup.ts        create .env
│   └── test/               automated tests
└── web/
    ├── index.html
    ├── public/             browser-tab icons
    └── src/
        ├── App.tsx         sign-in gate, menu, routes
        ├── org.tsx         organisation context
        ├── api.ts          API client
        ├── ItemEditor.tsx  the line editor
        ├── ActualImport.tsx · variance.tsx   actual-expenditure import and planned-vs-actual pieces
        ├── RiderCalculator.tsx   the rider calculator on headline acts and hosts
        ├── components.tsx · lib.ts · logos.tsx · styles.css
        ├── assets/logos/   Felice and Alur logos
        └── pages/          one file per screen
```

## 14. Moving the app to another machine (Windows)

The app has nothing that depends on the operating system, so the same files run on Windows, macOS and Linux. Every command in this guide is an npm script, so it is the same in every shell (Command Prompt, PowerShell, bash, zsh). Three things are rebuilt on the new machine: the installed packages (they contain programs specific to each operating system), the web build, and the secrets file.

### 14.1 What to copy

Copy the whole project folder **except**:

| Leave out | Why |
|---|---|
| `node_modules` folders | Large, and specific to the machine. `npm ci` recreates them. |
| `web/dist` | `npm run build` recreates it. |
| `server/.env` | It holds the password and secret. Create a fresh one on the new machine. |
| `server/data` | This is your database. Move it separately and deliberately (14.3). |

On a Mac, this makes a clean archive of about 330 KB:

```bash
cd /path/to/the/folder/that/contains/felice-planner
zip -r felice-planner.zip felice-planner \
    -x "felice-planner/*node_modules/*" "felice-planner/web/dist/*" \
       "felice-planner/server/.env" "felice-planner/server/data/*" "*.DS_Store"
```

Keep `package-lock.json` in the archive. It pins exact versions, and it includes the Windows, macOS and Linux programs the build tools need.

### 14.2 On the Windows machine

1. **Install Node.js 24 or newer.** Either download the **LTS** installer from <https://nodejs.org> and accept the defaults, or run `winget install OpenJS.NodeJS.LTS` in a terminal. Close and reopen the terminal, then check:
   ```
   node -v     (must show v24 or higher)
   npm -v
   ```
2. **Unzip** the archive and open **Command Prompt** or **PowerShell** in the folder:
   ```
   cd C:\path\to\felice-planner
   ```
3. **Install the packages** (this needs access to the npm registry):
   ```
   npm ci
   ```
4. **Create the settings file.** This prints your sign-in password once and writes `server\.env`:
   ```
   npm run setup
   ```
5. **Start it.**
   * For everyday use, in one process: `npm run build`, then `npm start`, and open <http://127.0.0.1:4000>.
   * To work on the code: `npm run dev`, and open <http://localhost:5173>.
6. **Sign in** with the password from step 4. Both organisations, Felice and Alur, are there, with no data yet.

Optional check that the copy is healthy: `npm run typecheck` and `npm test -w server`. On a new machine the tests that need the original planner workbook are skipped automatically, and the rest run.

### 14.3 Bringing your data across (optional)

Your weeks and recurring costs live in the database file. To move them:

1. **On the old machine**, make a safe single-file copy (see [Backups](#5-backups)). Do not copy `planner.db` while the app is running, because recent changes may be in its `-wal` file.
2. **Transfer the file** by an approved internal route. It contains artist and host fees, so do not email it or put it on a personal cloud drive.
3. **On the Windows machine**, stop the app. Create the folder `server\data` if it does not exist, and save the file there as `planner.db`. Delete `planner.db-wal` and `planner.db-shm` if they are present.
   ```
   mkdir server\data
   copy D:\transfer\planner-backup.db server\data\planner.db
   ```
4. **Start the app.** Felice's and Alur's weeks and recurring costs appear.

If you would rather not move the database, you can use **Import & export** instead: export each company's weeks from the old machine, then import them on the new one. That moves the weeks and lines but **not** the recurring costs, which you would re-enter.

### 14.4 Windows notes

| Situation | What to do |
|---|---|
| PowerShell says *"running scripts is disabled on this system"* when you run `npm` | Use Command Prompt instead, or run `npm.cmd run dev`, or allow scripts for your user: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| `npm ci` cannot reach the registry | Your network may require your company's npm registry or proxy. Set it with `npm config set registry <url>` (and `proxy`) as IT advises. The lockfile works with a mirror. |
| Windows Firewall asks about Node.js | The app listens on this PC only (`127.0.0.1`), so you can choose **Cancel** or **Private networks**. Other PCs cannot reach it unless you follow [section 9](#9-sharing-the-app-on-a-network). |
| The app stops when you close the terminal | It runs inside that window. To keep it running in the background, run it as a Windows service or scheduled task (a tool such as NSSM does this). That is not set up here. |
| You want to use a different port | Set `PORT` in `server\.env`. |

### 14.5 Built so it behaves the same everywhere

| Area | What is done |
|---|---|
| Line endings and editors | `.gitattributes` and `.editorconfig` keep line endings and indentation the same on Windows, macOS and Linux. |
| Node version | `.npmrc` sets `engine-strict=true`, so installing on an older Node stops with a clear message instead of failing later. |
| Lockfile | Includes the native build tools for Windows, macOS and Linux, so `npm ci` works on each. |
| `server/.env` | Written without a byte-order mark, so it is read correctly on Windows. |
| Month pickers | Browsers without a month input show a year and month pair instead. |
| HTTPS-only headers | The HSTS and *upgrade insecure requests* headers are sent only when `COOKIE_SECURE=true`, so a plain-HTTP copy on a private network is not forced onto HTTPS. |
| Phones and tablets | Inputs are 16px on touch screens (stops iOS zooming in) and the layout uses the dynamic viewport height. |
| Built site | The server checks for `web/dist` on every request and answers `503` with a message until `npm run build` has been run. |
| File names | Checked on a case-sensitive file system. |

### 14.6 What was verified

The packaging command, `npm ci`, `npm run setup`, the build, the tests and the start-up were run from a clean unpack of exactly that archive, with no `node_modules`, `.env` or database, on macOS. The lockfile was checked to contain the Windows programs for the build tools. I have not been able to run the app on Windows itself, so treat steps 14.2 to 14.4 as the expected path, and tell me if anything differs.
