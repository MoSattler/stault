# Stault

Steam-style desktop client for a self-hosted GameVault server. Design boards and decisions: `design/README.md`. What v0.1 covers and what it leaves out: `README.md`.

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
- `GET /api/status` lists the sign-in methods in `available_authentication_methods` (`basic`, `sso`).
- Single sign-on is a browser flow, `GET /api/auth/oauth2/login`, tied to a session cookie. It ends with the server sending the browser to `<callback origin>/?access_token=…&refresh_token=…`. Tokens go nowhere else: `client_origin` only accepts the server itself, its CORS origins and the official Tauri app, so the system browser cannot hand them to Stault.
- Save files (`/api/savefiles/user/{id}/game/{id}`) are off unless the server sets `SAVEFILES_ENABLED=true`; a disabled endpoint answers `405`. Only the newest save can be fetched. `HEAD` returns its name, `<upload ms>_<installation id>.zip`, without the body. `DELETE` answers `401` even with a valid token.

## Single sign-on (`src/bun/sso.ts`, `ssoLogin` in `src/bun/window.ts`)

- The login runs in a second window: a sandboxed `BrowserView` in a partition named anew each time. A partition whose name does not start with `persist:` keeps nothing on disk. `BrowserWindow` has no partition option, which is why the view is added to an empty window.
- `watchForTokens` reads the tokens from the server's last redirect and accepts them only from the server's origin or the `redirect_uri` origin of its first redirect.
- Electrobun sends the address of a `will-navigate` event as JSON (`{"url": …, "allowed": true}`), unlike its types and the other navigation events, which carry the bare address.

## Save sync (`src/bun/saves/`)

- Ludusavi 0.31 finds and moves save files. It is not on npm: `dev/fetch-ludusavi.ts` downloads the pinned build into `vendor/` (git-ignored) before every build and dev start, and `electrobun.config.ts` copies it into the app. To upgrade, change the version and checksums there.
- The rule the sync follows (`nextStep` in `saves/index.ts`): never replace a server save this device has not seen, never replace local saves the server has not seen. Both changed means compare, then ask.
- Ludusavi quirks, all found by running it: without a game name it waits on stdin; root paths are globs, so the `[id]` in Stault's folder names must be escaped; it reports real paths, so folders must be resolved through symlinks before they are named in redirects; it does not follow symlinks into game folders.
- A game can describe its own saves with a `.ludusavi.yaml` in its files; the Harbor Lights sample does.

## Working on and checking the UI

- `hutch run hmr` (preview config `ui` in `.claude/launch.json`) serves the UI on mock data at http://localhost:5173. Switches: `?platform=macos|windows|linux`, `?signedout`, `?sso` (the server also offers single sign-on), `?sso=only`.
- For the real app, start the test server with `./dev/seed.sh` and run `hutch run dev:hmr`. Webview console output is forwarded to the terminal.
- Screen-control tools cannot type into the password field. `hutch dev/sign-in.ts "<data folder>"` signs the dev build into the test server instead; the app prints its data folder on start. Single sign-on needs no password: the test server's identity provider (http://127.0.0.1:18081) takes any username.
- When the app window is covered by another window (or the browser pane is hidden), CSS animations pause, so a screenshot can show a page still faded out. The content is there; check the accessibility tree or bring the window forward.
- The running dev app holds Hutch's build lock. `hutch run build:canary` waits silently until the dev app is closed.
- Only the macOS build has been run so far. Launching on Windows and Linux (umu-launcher, setup installers) is covered by unit tests of the command builders but has not been run on those systems.
