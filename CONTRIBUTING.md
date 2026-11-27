# Contributing to Stault

Stault is built with [Electrobun](https://docs.electrobun.dev/electrobun/) 2 (Bun main process, system webview), React, Tailwind CSS and Vite. Design boards are in [design/](design/README.md).

## Setup

Install [Hutch](https://docs.electrobun.dev/electrobun/guides/hutch/), Electrobun's build CLI, then:

```sh
hutch run install
```

## Tasks

Tasks are defined in `hutch.config.ts` and run with `hutch run <task>`.

| Task | What it does |
| --- | --- |
| `dev:hmr` | Runs the app against the Vite dev server. UI edits hot-reload; restart after main-process edits. |
| `dev` | Runs the app from bundled assets and relaunches it when main-process code changes. |
| `hmr` | Serves only the UI at http://localhost:5173, on sample data, for work in a browser. |
| `test` | Runs the unit tests. The save sync tests run the real Ludusavi and are skipped until a build or dev start has fetched it (`hutch dev/fetch-vendor.ts`). |
| `typecheck` | Type-checks `src/`, `test/` and `dev/`. |
| `build:dev` | Builds the app as `dev` does, without starting it. The Linux scripts and the end-to-end tests use it. |
| `build:canary` | Builds a canary release for the current OS and architecture. Close the dev app first. |
| `build` | Builds a stable release for the current OS and architecture. |

Hutch builds only for the OS it runs on, so a Windows or Linux build has to be made on that OS.

## Test server

`./dev/seed.sh` starts a local GameVault server in Docker at http://127.0.0.1:18080 with a few tiny sample games and a test account (see the script for its name and password). One sample, Harbor Lights, is a real Mac app that writes a save each time it runs, so install, launch and save sync can be tried on macOS.

The server also offers single sign-on through a stand-in identity provider at http://127.0.0.1:18081, which signs the test account in straight away, without a login page. This works from the machine that runs Docker, not from the Linux desktop container or the Windows VM.

## Testing on Linux

`./dev/linux/up.sh` starts a Linux desktop in Docker (Debian 13, x64) next to the test server, and `./dev/linux/run.sh` runs the current code in it. Watch the screen at `vnc://127.0.0.1:5901`; inside the container the test server is `http://gamevault:8080`. Windows games run there through the umu-launcher that comes with Stault, and the Pixel Drift and Setup Quest samples are real Windows programs once the image is built, so installing and launching them can be tried without a game or a GPU.

On an Apple Silicon Mac the container runs through Rosetta. That is enough for everything above, but Hutch does not run there, so `run.sh` builds the JavaScript on the Mac and puts it into the latest released Linux app. It does not test the Linux packaging; the canary build from the Release workflow does.

## End-to-end tests

`e2e/` holds tests that start the built app and drive its real window with [WebdriverIO](https://webdriver.io): they sign in to the test server, click through the UI and check what lands on disk. Each spec file gets its own app with nobody signed in and nothing installed.

They run on Linux, through WebdriverIO's [Electrobun service](https://github.com/webdriverio/desktop-mobile/tree/main/packages/electrobun-service) and WebKit's WebDriver, and on Windows, where they start the app themselves and Edge's WebDriver attaches to its webview (`e2e/windows.ts`). macOS's webview can't be driven. `.github/workflows/e2e.yml` runs both on every pull request; the Windows job brings up the test server in Docker inside WSL2. On a Mac, with the test server up, the Linux side runs locally:

```sh
./dev/linux/e2e.sh                               # all of them
./dev/linux/e2e.sh --spec specs/sign-in.e2e.ts   # one file
```

That runs them in a Linux container of their own (`stault-e2e`), on the same mix as `run.sh`: this checkout's JavaScript in the latest released Linux app. A failed check leaves a screenshot of the window in `e2e/failures/`.

One spec file per area: signing in and out, single sign-on, the library, a game's page, installing and playing, downloads, settings and save sync. A new screen or flow gets its checks in the same change. What they can't reach is listed in `CLAUDE.md`: mainly the system's own file dialogs.

WebdriverIO runs on Node, so `e2e/` is a small npm project of its own (`package-lock.json`, `npm ci`), apart from the app's Hutch-managed dependencies. Nothing in `src/` exists for the tests' sake; they find things the way a user does, by label and text.

## Testing on Windows

On an Apple Silicon Mac, `./dev/windows/up.sh <ISO>` creates a Windows 11 VM in [UTM](https://mac.getutm.app) (`brew install --cask utm`) from the Windows 11 Arm64 ISO that Microsoft offers for download, and installs Windows without questions. `./dev/windows/run.sh` then runs the current code in it, and `./dev/windows/vm.sh` takes screenshots, clicks, types and runs commands there. Inside the VM the test server is `http://10.0.2.2:18080`.

Windows for Arm runs Stault's x64 build through emulation, so this shows what works, not how fast it is. As on Linux, `run.sh` puts the JavaScript built on the Mac into the latest released Windows app; it does not test the Windows packaging.

## Layout

```
src/shared/       Types shared by both sides, including the RPC contract
src/bun/          Main process: server client, session, downloads, installs, launcher, save sync
src/mainview/     Webview UI: React + Tailwind, built by Vite
test/             Unit tests (Bun's test runner)
e2e/              End-to-end tests (WebdriverIO, on Node)
dev/              Local test server, Linux and Windows test machines, helper scripts
electrobun.config.ts   App identity and how the bundle is assembled
hutch.config.ts        Tasks and the pinned Electrobun version
```

Installed games live in the library folders chosen in Settings, one folder per game, each with a `.stault/manifest.json` that describes the install.

## Commits and releases

`.github/workflows/release.yml` builds installers for macOS (Apple Silicon), Windows x64 and Linux x64.

Versions come from the commit messages on `main`, which follow [Conventional Commits](https://www.conventionalcommits.org): `fix:` raises the patch version, `feat:` the minor version, and a breaking change (`feat!:`) also the minor version until 1.0. Other types (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) release nothing.

- [release-please](https://github.com/googleapis/release-please) keeps a release PR open with the next version and its changelog. Merge it to tag the version, publish the GitHub release and attach stable installers. The version lives in `package.json`; don't edit it or create tags by hand.
- A release also writes the Homebrew cask, `.github/homebrew/stault.rb`, into [MoSattler/homebrew-tap](https://github.com/MoSattler/homebrew-tap) with that release's version and checksum, so change the cask here, not in the tap. The workflow pushes there with the deploy key in the `HOMEBREW_TAP_DEPLOY_KEY` secret.
- Run the workflow by hand (Actions → Release → Run workflow) for canary installers, which stay attached to the run for 14 days. Use this to try a build on Windows or a Steam Deck.

The builds are not code-signed; see [Install](README.md#install) for what Windows and macOS do with them.

## Website

`docs/` is the website, https://mosattler.github.io/stault/. GitHub Pages publishes the folder from `main` as it is (Settings → Pages: the branch `main`, the folder `/docs`), so there is nothing to build. The page repeats the README's features and install steps; change both together. To preview it at http://localhost:4000:

```sh
python3 -m http.server -d docs 4000
```

## Screenshots

The images in `docs/screenshots/`, shown in the README and on the website, are taken from the UI in a browser (`hutch run hmr`, `?platform=windows`) at 1280×800, with the sample games in `src/mainview/api/mock.ts` swapped for real ones for the capture.
