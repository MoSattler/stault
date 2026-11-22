# Stault

Steam-style desktop client for a self-hosted GameVault server. Design boards and decisions: `design/README.md`. What the app covers and what it leaves out: `README.md`. Setup, tasks and releases: `CONTRIBUTING.md`.

Stack: Electrobun 2 (Bun main process + system webview), React 19, Tailwind 4, Vite 7.

## Electrobun 2.x is not 1.x and not Electron

- The CLI is Hutch. Tasks live in `hutch.config.ts` and run as `hutch run <task>` (`dev`, `dev:hmr`, `hmr`, `test`, `typecheck`, `build`). `package.json` scripts are not used. `hutch <file.ts>` runs a script with Bun.
- The SDK is not an npm package. Hutch copies it into `.hutch/devkit` (git-ignored), and `electrobun/main` / `electrobun/view` resolve there through `tsconfig.json` and the aliases in `vite.config.ts`. Never add `electrobun` to `dependencies`.
- Install packages with `hutch install` (lockfile: `hutch.lock`); it never runs install scripts. Run local binaries with `hutch pm exec -- <bin>`.
- Upgrade Electrobun with `hutch electrobun update`.
- Read the docs before using an API; older examples are wrong for 2.x: https://docs.electrobun.dev/electrobun/

## Commits and releases

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`; `!` marks a breaking change). release-please reads them on `main` to pick the next version and write the changelog, so the type decides whether a change is released: only `feat` and `fix` are.
- Never edit `version` in `package.json`, `CHANGELOG.md` or `.release-please-manifest.json`, and never push a version tag. Merging the release PR does all of it (`.github/workflows/release.yml`).

## Architecture

- `src/bun/` is the main process and owns everything privileged: tokens, server calls, files, downloads, child processes. `index.ts` wires the services together and is the only file that imports `electrobun/main`, so everything else can be unit-tested.
- `src/mainview/` is UI only. It reaches the main process through one interface, `StaultApi` (`src/mainview/api/`), with two implementations: `rpc.ts` in the app and `mock.ts` in a plain browser.
- `src/shared/rpc.ts` is the contract. Adding a request means: the type there, a handler in `src/bun/index.ts`, and a mock in `src/mainview/api/mock.ts`.
- The main process holds the whole `AppState` (`src/bun/state.ts`) and pushes patches; the webview mirrors it in `src/mainview/state/store.ts`. View state (current page, dialogs) lives only in the webview.
- Installed games are found by scanning library folders for `.stault/manifest.json`. There is no central database of installs.

## GameVault API quirks (checked against 17.2.0)

- `GET /api/games` returns `versions: []`; only `GET /api/games/{id}` lists versions. `?limit=-1` returns everything.
- A `Range` request is answered with `200`, not `206`; `Content-Length` is the remainder.
- Login is `GET /api/auth/basic/login` with a Basic header. Access tokens last 5 minutes; refresh tokens rotate.
- There is no macOS game type. A Mac build is indexed as `UNDETECTABLE`.
- The spec is served by any server at `/api/docs-json`.
- Save files (`/api/savefiles/user/{id}/game/{id}`) are off unless the server sets `SAVEFILES_ENABLED=true`; a disabled endpoint answers `405`. Only the newest save can be fetched. `HEAD` returns its name, `<upload ms>_<installation id>.zip`, without the body. `DELETE` answers `401` even with a valid token.

## Save sync (`src/bun/saves/`)

- Ludusavi 0.31 finds and moves save files. It is not on npm: `dev/fetch-ludusavi.ts` downloads the pinned build into `vendor/` (git-ignored) before every build and dev start, and `electrobun.config.ts` copies it into the app. To upgrade, change the version and checksums there.
- The rule the sync follows (`nextStep` in `saves/index.ts`): never replace a server save this device has not seen, never replace local saves the server has not seen. Both changed means compare, then ask.
- Ludusavi quirks, all found by running it: without a game name it waits on stdin; root paths are globs, so the `[id]` in Stault's folder names must be escaped; it reports real paths, so folders must be resolved through symlinks before they are named in redirects; it does not follow symlinks into game folders.
- A game can describe its own saves with a `.ludusavi.yaml` in its files; the Harbor Lights sample does.

## Working on and checking the UI

- `hutch run hmr` (preview config `ui` in `.claude/launch.json`) serves the UI on mock data at http://localhost:5173. Switches: `?platform=macos|windows|linux`, `?signedout`.
- For the real app, start the test server with `./dev/seed.sh` and run `hutch run dev:hmr`. Webview console output is forwarded to the terminal.
- Screen-control tools cannot type into the password field. `hutch dev/sign-in.ts "<data folder>"` signs the dev build into the test server instead; the app prints its data folder on start.
- When the app window is covered by another window (or the browser pane is hidden), CSS animations pause, so a screenshot can show a page still faded out. The content is there; check the accessibility tree or bring the window forward.
- The running dev app holds Hutch's build lock. `hutch run build:canary` waits silently until the dev app is closed.
- All three builds have been run: macOS natively, Linux in a container, Windows in a VM (sections below).

## Testing on Linux (`dev/linux/`)

- `./dev/seed.sh`, then `./dev/linux/up.sh`, starts the container `stault-linux`: a Debian 13 desktop (Xvfb, openbox, keyring, umu-launcher) on the test server's Docker network. Inside it the server is `http://gamevault:8080`. `./dev/linux/run.sh` puts this checkout's code into the released Linux app there and starts it.
- Drive it with `docker exec stault-linux xdotool …`; take a screenshot with `docker exec stault-linux import -window root /tmp/shot.png` and `docker cp`. The window sits at 80,50 on a 1440x900 screen. The user can watch at `vnc://127.0.0.1:5901`. xdotool can type into the password field.
- A title-bar drag needs pauses between press, moves and release; Electrobun starts the move a moment after the press.
- Once the image exists, `seed.sh` compiles the Windows samples (`dev/samples/*.c`) into real programs: Pixel Drift opens a message box, Setup Quest's installer copies a game to `/DIR=` or to `C:\Games\Setup Quest`.
- On an Apple Silicon host the container runs through Rosetta, which can't start Hutch or the system `bwrap`, so nothing is built in the container and current Arch (GTK loads icons through `bwrap`) is no use as its base. Wine sometimes dies at start with an `xsave` assertion in the launch log; start the game again.

## End-to-end tests (`e2e/`)

- WebdriverIO with `@wdio/electrobun-service` starts the built app and drives its real window. Linux only so far: the service has no way into WKWebView on macOS (only into a CEF build), and its Windows path (WebView2) is untried here. `./dev/linux/e2e.sh` runs them from a Mac in the container `stault-e2e`; `.github/workflows/e2e.yml` runs them on pull requests.
- `e2e/` is its own npm project on Node (`npm ci`, `package-lock.json`), not part of `hutch install`. The WebdriverIO packages are pinned to the versions the service depends on; raise them together.
- The tests must not need anything from `src/`: no test ids, hooks or test-only branches. Select by label, role and text.
- The service runs a copy of the app from a temporary folder. A stable build crashes there at start (`Updater.localInfo` throws outside `<data folder>/app`), so the tests need a dev build (`hutch run build:dev`).
- Every spec file gets a new app in an empty home folder (`onWorkerStart` in `wdio.conf.ts`), so it starts signed out. With no keyring there, the token goes to `session.json`.
- WebKit's WebDriver returns no text for the truncated titles in the game list; find those rows with a text selector (`button*=Title`) instead of reading the list's text.
- Installed game files are in `<library>/<Title> [<id>]/files/`.

## Testing on Windows (`dev/windows/`)

- The VM "Stault Windows" lives in UTM: Windows 11 for Arm, which runs Stault's x64 build through emulation. `./dev/windows/up.sh <ISO>` creates it from scratch, unattended; `utmctl start "Stault Windows"` starts an existing one. Inside it the test server is `http://10.0.2.2:18080`, and the user `stault` has no password.
- `./dev/windows/run.sh` puts this checkout's code into the released Windows app there and starts it. `./dev/windows/vm.sh` drives the VM: `shot`, `click X Y`, `key`, `sys` (a batch script as SYSTEM), `user` (one on the desktop, through a scheduled task) and `ulog`. Run `vm.sh screen` once after each VM start: it sets 1440x900 and measures how UTM scales click positions.
- The app's own output does not reach a log on Windows (it is a GUI program). To trace something, append to a file from the code for the moment.
- Never run a game with `vm.sh sys`: its window opens on SYSTEM's invisible desktop and it waits there forever. And `taskkill /im <game>.exe` also ends the copy Stault started.
- Speed there says nothing: x64 is emulated and the network is user-mode. A 200 MB install took two minutes.
- Windows keeps a program's file locked for a moment after it exits, which is why game folders are deleted with `removeFolder` (`src/bun/folders.ts`), which retries.
