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
| `test` | Runs the unit tests. The save sync tests run the real Ludusavi and are skipped until a build or dev start has fetched it (`hutch dev/fetch-ludusavi.ts`). |
| `typecheck` | Type-checks `src/`, `test/` and `dev/`. |
| `build:canary` | Builds a canary release for the current OS and architecture. Close the dev app first. |
| `build` | Builds a stable release for the current OS and architecture. |

Hutch builds only for the OS it runs on, so a Windows or Linux build has to be made on that OS.

## Test server

`./dev/seed.sh` starts a local GameVault server in Docker at http://127.0.0.1:18080 with a few tiny sample games and a test account (see the script for its name and password). One sample, Harbor Lights, is a real Mac app that writes a save each time it runs, so install, launch and save sync can be tried on macOS.

## Layout

```
src/shared/       Types shared by both sides, including the RPC contract
src/bun/          Main process: server client, session, downloads, installs, launcher, save sync
src/mainview/     Webview UI: React + Tailwind, built by Vite
test/             Unit tests (Bun's test runner)
dev/              Local test server and helper scripts
electrobun.config.ts   App identity and how the bundle is assembled
hutch.config.ts        Tasks and the pinned Electrobun version
```

Installed games live in the library folders chosen in Settings, one folder per game, each with a `.stault/manifest.json` that describes the install.

## Commits and releases

`.github/workflows/release.yml` builds installers for macOS (Apple Silicon), Windows x64 and Linux x64.

Versions come from the commit messages on `main`, which follow [Conventional Commits](https://www.conventionalcommits.org): `fix:` raises the patch version, `feat:` the minor version, and a breaking change (`feat!:`) also the minor version until 1.0. Other types (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) release nothing.

- [release-please](https://github.com/googleapis/release-please) keeps a release PR open with the next version and its changelog. Merge it to tag the version, publish the GitHub release and attach stable installers. The version lives in `package.json`; don't edit it or create tags by hand.
- A release also updates the Homebrew cask in [MoSattler/homebrew-tap](https://github.com/MoSattler/homebrew-tap). The workflow pushes there with the deploy key in the `HOMEBREW_TAP_DEPLOY_KEY` secret.
- Run the workflow by hand (Actions → Release → Run workflow) for canary installers, which stay attached to the run for 14 days. Use this to try a build on Windows or a Steam Deck.

The builds are not code-signed; see [Install](README.md#install) for what Windows and macOS do with them.

## README screenshots

The images in `docs/screenshots/` are taken from the UI in a browser (`hutch run hmr`, `?platform=windows`) at 1280×800, with the sample games in `src/mainview/api/mock.ts` swapped for real ones for the capture.
