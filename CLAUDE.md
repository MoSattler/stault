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
- The release workflow builds the Mac app on `macos-latest` (Apple Silicon) and `macos-26-intel` (Intel; GitHub ends Intel runners in August 2027), and fails when a binary in the app is built for the other chip. Since 26.6.0, `7zip-bin-full` puts the Apple Silicon binary in `mac/x64`, so on an Intel Mac `dev/fetch-vendor.ts` fetches 7-Zip's own build of the same version instead; raise the two together.
- The Homebrew cask is `.github/homebrew/stault.rb`. Each release writes it into MoSattler/homebrew-tap with the version and both DMGs' checksums, so a change made in the tap is lost.

## Images in PR descriptions

- Images for a PR description go on the orphan branch `pr-assets`, in a folder named after the PR's branch (an issue's images go on `issue-assets`). Never commit them to the PR's own branch: they would land on `main`.
- Upload one through the API. It needs no checkout and prints the link to put in the description:
  ```bash
  base64 < shot.png | tr -d '\n' | gh api -X PUT repos/MoSattler/stault/contents/<branch>/<name>.png -f branch=pr-assets -f message="docs: image for <branch>" -F content=@- --jq .content.download_url
  ```
- Never replace or delete a file there: merged descriptions still point at it. A changed image gets a new name.

## Architecture

- `src/bun/` is the main process and owns everything privileged: tokens, server calls, files, downloads, child processes. `index.ts` wires the services together and is the only file that imports `electrobun/main`, so everything else can be unit-tested.
- `src/mainview/` is UI only. It reaches the main process through one interface, `StaultApi` (`src/mainview/api/`), with two implementations: `rpc.ts` in the app and `mock.ts` in a plain browser.
- `src/shared/rpc.ts` is the contract. Adding a request means: the type there, a handler in `src/bun/index.ts`, and a mock in `src/mainview/api/mock.ts`.
- The main process holds the whole `AppState` (`src/bun/state.ts`) and pushes patches; the webview mirrors it in `src/mainview/state/store.ts`. View state (current page, dialogs) lives only in the webview.
- Installed games are found by scanning library folders for `.stault/manifest.json`. There is no central database of installs.
- On Linux, Windows programs run through umu-launcher (`findUmu` in `src/bun/launcher/index.ts`): an installed `umu-run` first, since its package may set up more than the program; else umu's zipapp, which `dev/fetch-vendor.ts` bundles and which runs on the system's `python3`. Ubuntu 24.04+ lets Proton's sandbox (bwrap) start only under an AppArmor profile; umu's Ubuntu package links one. Where the restriction is on and no bwrap profile is in `/etc/apparmor.d`, Stault asks for that package.

## GameVault API quirks (checked against 17.2.0)

- `GET /api/games` returns `versions: []`; only `GET /api/games/{id}` lists versions. `?limit=-1` returns everything.
- A `Range` request is answered with `200`, not `206`; `Content-Length` is the remainder.
- Login is `GET /api/auth/basic/login` with a Basic header. Access tokens last 5 minutes; refresh tokens rotate.
- There is no macOS game type. A Mac build is indexed as `UNDETECTABLE`.
- The spec is served by any server at `/api/docs-json`.
- Save files (`/api/savefiles/user/{id}/game/{id}`) are off unless the server sets `SAVEFILES_ENABLED=true`; a disabled endpoint answers `405`. Only the newest save can be fetched. `HEAD` returns its name, `<upload ms>_<installation id>.zip`, without the body. `DELETE` answers `401` even with a valid token.

## Save sync (`src/bun/saves/`)

- Ludusavi 0.31 finds and moves save files. It is not on npm: `dev/fetch-vendor.ts` downloads the pinned build into `vendor/` (git-ignored) before every build and dev start, and `electrobun.config.ts` copies it into the app. To upgrade, change the version and checksums there. 0.31 has no Intel Mac release, so on an Intel Mac the script compiles the release's source with cargo instead.
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

- `./dev/seed.sh`, then `./dev/linux/up.sh`, starts the container `stault-linux`: a Debian 13 desktop (Xvfb, openbox, keyring) on the test server's Docker network. Inside it the server is `http://gamevault:8080`. `./dev/linux/run.sh` puts this checkout's code into the released Linux app there, adds the Linux Ludusavi and umu-launcher if the app lacks them, and starts it.
- Drive it with `docker exec stault-linux xdotool …`; take a screenshot with `docker exec stault-linux import -window root /tmp/shot.png` and `docker cp`. The window sits at 80,50 on a 1440x900 screen. The user can watch at `vnc://127.0.0.1:5901`. xdotool can type into the password field.
- A title-bar drag needs pauses between press, moves and release; Electrobun starts the move a moment after the press.
- Once the image exists, `seed.sh` compiles the Windows samples (`dev/samples/*.c`) into real programs: Pixel Drift and Copper Kite open a message box, Setup Quest's installer copies a game to `/DIR=` or to `C:\Games\Setup Quest`.
- On an Apple Silicon host the container runs through Rosetta, which can't start Hutch or the system `bwrap`, so nothing is built in the container and current Arch (GTK loads icons through `bwrap`) is no use as its base. Wine sometimes dies at start with an `xsave` assertion in the launch log; start the game again.

## End-to-end tests (`e2e/`)

- WebdriverIO drives the built app's real window, on Linux and on Windows; `.github/workflows/e2e.yml` runs both on pull requests. Not on macOS: nothing reaches WKWebView (`@wdio/electrobun-service` only reaches a CEF build). `./dev/linux/e2e.sh` runs the Linux side from a Mac in the container `stault-e2e`; the Windows side runs on CI only.
- Linux: `@wdio/electrobun-service` starts the app through WebKit's WebDriver. Windows: the tests start the app themselves (`e2e/windows.ts`) and Edge's WebDriver attaches to its WebView2 through a debug port. The service would give every launch a new data folder of its own and can't start the app again, so nothing could be checked across a restart.
- On the Windows runner every process runs elevated, and WebView2 there ignores `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` and the per-user policy. It opens the debug port for the machine policy `e2e.yml` sets (`HKLM\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`, entry `bun.exe`, which hosts the webview). The session must be classic WebDriver: over BiDi it lands on a blank page instead of the app's.
- The Windows runner can only run the Linux test server in Docker inside WSL2. `e2e.yml` sets that up and runs `seed.sh` there unchanged, with MinGW so the Windows samples are real programs. WSL stops an idle distribution after 15 s, so `.wslconfig` turns that off first. `.gitattributes` keeps shell scripts LF in a Windows checkout.
- `e2e/` is its own npm project on Node (`npm ci`, `package-lock.json`), not part of `hutch install`. The WebdriverIO packages are pinned to the versions the service depends on; raise them together.
- The tests must not need anything from `src/`: no test ids, hooks or test-only branches. Select by label, role and text.
- The service runs a copy of the app from a temporary folder. A stable build crashes there at start (`Updater.localInfo` throws outside `<data folder>/app`), so the tests need a dev build (`hutch run build:dev`).
- Every spec file gets a new app in an empty home folder (`onWorkerStart` in `wdio.conf.ts`), so it starts signed out. On Linux, with no keyring there, the token goes to `session.json`. On Windows it goes to Credential Manager, and the app's data folder is under the spec's own `LOCALAPPDATA`.
- Each system has one small sample game that runs there (`NATIVE` in `e2e/app.ts`): Tin Kettle on Linux, Copper Kite on Windows.
- Installed game files are in `<library>/<Title> [<id>]/files/`.
- A failed check leaves a screenshot in `e2e/failures/` (`e2e.sh` copies them out of the container; CI attaches them to the run). Look there first. When the app doesn't come up on Windows, the error carries the end of its output.
- Not covered, because WebDriver can't reach them: the native folder and file pickers ("Add folder…", choosing an executable by hand), minimize and maximize. Also not covered: Windows games on Linux (every run would first download Proton, over 500 MB) and an unreachable server.
- The local test server keeps saves, playtime and bookmarks from earlier runs, and may hold extra games; CI's is new each time. A check must hold on both: read the state before changing it, or make it (the save tests upload their own save first).
- What WebKit's WebDriver does differently, all met here (helpers in `e2e/app.ts`):
  - Emptying a field (`setValue`, `clearValue`) goes unnoticed by React, which puts the old text back on its next render. Use `fill()`.
  - An element's text comes back as shown (so upper-cased by CSS) and without anything between blocks: "SAVESIn sync". Match with `ignoreCase` or `\s*`. A line that CSS may cut short (`truncate`) comes back empty; read those from the page, as `listedGames()` does.
  - A text selector needs a tag: `button*=Install`, not `[role=menuitem]*=Install`.
  - A click on a disabled button passes and does nothing. A dialog's main button is disabled until its data has loaded: use `confirm()`.
  - A toast covers the page's bottom right corner for four seconds and takes the clicks meant for what is under it. Call `toastGone()` first.
  - Ending the WebDriver session leaves the app running, and a second copy hands over to it. `restart()` closes the app with its own Close button before starting it again.

## Testing on Windows (`dev/windows/`)

- The VM "Stault Windows" lives in UTM: Windows 11 for Arm, which runs Stault's x64 build through emulation. `./dev/windows/up.sh <ISO>` creates it from scratch, unattended; `utmctl start "Stault Windows"` starts an existing one. Inside it the test server is `http://10.0.2.2:18080`, and the user `stault` has no password.
- `./dev/windows/run.sh` puts this checkout's code into the released Windows app there and starts it. `./dev/windows/vm.sh` drives the VM: `shot`, `click X Y`, `key`, `sys` (a batch script as SYSTEM), `user` (one on the desktop, through a scheduled task) and `ulog`. Run `vm.sh screen` once after each VM start: it sets 1440x900 and measures how UTM scales click positions.
- The app's own output does not reach a log on Windows (it is a GUI program). To trace something, append to a file from the code for the moment.
- Never run a game with `vm.sh sys`: its window opens on SYSTEM's invisible desktop and it waits there forever. And `taskkill /im <game>.exe` also ends the copy Stault started.
- Speed there says nothing: x64 is emulated and the network is user-mode. A 200 MB install took two minutes.
- Windows keeps a program's file locked for a moment after it exits, which is why game folders are deleted with `removeFolder` (`src/bun/folders.ts`), which retries.
