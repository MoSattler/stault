# Stault

A Steam-style desktop client for a self-hosted [GameVault](https://gamevau.lt) server, for Windows, macOS and SteamOS.

Built with [Electrobun](https://docs.electrobun.dev/electrobun/) 2 (Bun main process, system webview), React, Tailwind CSS and Vite. Design boards are in [design/](design/README.md).

## What v0.1 does

- Connects to a GameVault server (17.0 or newer) and signs in, with a password or through the server's single sign-on (see [Single sign-on](#single-sign-on)). The session token is kept in the system keychain.
- Shows the library: recently played, recently added, all games, and a page per game.
- Installs games: a download queue with pause, resume, a bandwidth limit and recovery after a restart, then extraction with a bundled 7-Zip.
- Launches games and records playtime on the server.
- Keeps game saves in step with the server (see [Save sync](#save-sync)).

| | Launches |
| --- | --- |
| Windows | Windows builds |
| Linux / SteamOS | Linux builds natively, Windows builds through [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher) (install it separately) |
| macOS | Games whose files contain a Mac `.app`. Windows builds are not supported. |

Not in v0.1: Big Picture Mode, Steam shortcuts.

## Single sign-on

When the server has OAuth2 switched on (`AUTH_OAUTH2_ENABLED=true`), the Connect screen offers "Sign in with SSO". It opens the server's login page in a window of its own; after the login the window closes and Stault is signed in.

- The login window keeps no cookies. Signing out of Stault and in again asks the identity provider for a login again.
- A login that needs a passkey or security key may not work in the window, and some providers (Google) refuse logins from windows inside apps. Neither has been tried.
- When the server refuses the login, for example a new account that an admin still has to activate, its message stays in the window. Close it to return to Stault.

So far this has only been run on macOS.

## Save sync

Before a game starts, Stault fetches a newer save from the server; after you quit, it uploads yours. The game's page shows where its saves stand and has buttons to move them by hand.

- The server has to accept save files: set `SAVEFILES_ENABLED=true` on it and give `/savefiles` a volume. They are off by default.
- [Ludusavi](https://github.com/mtkennerly/ludusavi), bundled with Stault, finds the save files. A game it doesn't know is not synced. When Stault matches no entry or the wrong one, choose it on the game's page.
- Offline, a game starts with the saves on the device, and saves made meanwhile are uploaded once the server is back.
- When saves changed on two devices, Stault asks which to keep. It never overwrites a save it has not seen on either side.
- Saves use the format of the official GameVault client, so a Windows build's saves move between it and Stault, and between Windows and Linux. A Mac build's saves only move between Macs.
- Only the newest save on the server can be fetched. The server keeps older ones (10 by default) on its disk.

So far this has only been run on macOS. On Windows and Linux it is covered by tests of the pieces.

## Install

On macOS (Apple Silicon, macOS 14 or newer), install with Homebrew:

```bash
brew install --cask mosattler/tap/stault
```

On Windows and Linux, download an installer from the [latest release](https://github.com/MoSattler/stault/releases/latest).

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

## Releases

`.github/workflows/release.yml` builds installers for macOS (Apple Silicon), Windows x64 and Linux x64.

Versions come from the commit messages on `main`, which follow [Conventional Commits](https://www.conventionalcommits.org): `fix:` raises the patch version, `feat:` the minor version, and a breaking change (`feat!:`) also the minor version until 1.0. Other types (`docs:`, `chore:`, `ci:`, `refactor:`, `test:`) release nothing.

- [release-please](https://github.com/googleapis/release-please) keeps a release PR open with the next version and its changelog. Merge it to tag the version, publish the GitHub release and attach stable installers. The version lives in `package.json`; don't edit it or create tags by hand.
- A release also updates the Homebrew cask in [MoSattler/homebrew-tap](https://github.com/MoSattler/homebrew-tap). The workflow pushes there with the deploy key in the `HOMEBREW_TAP_DEPLOY_KEY` secret.
- Run the workflow by hand (Actions → Release → Run workflow) for canary installers, which stay attached to the run for 14 days. Use this to try a build on Windows or a Steam Deck.

The builds are not code-signed. Windows warns before opening them. macOS reports a downloaded copy as damaged and refuses to open it, so the Homebrew cask removes the quarantine flag after installing. For a copy taken from the DMG, run `xattr -dr com.apple.quarantine /Applications/Stault.app` once.

## Test server

`./dev/seed.sh` starts a local GameVault server in Docker at http://127.0.0.1:18080 with a few tiny sample games and a test account (see the script for its name and password). Beside it runs a stand-in identity provider for single sign-on, whose login page takes any username without a password; the test account's name signs in as that account. One sample, Harbor Lights, is a real Mac app that writes a save each time it runs, so install, launch and save sync can be tried on macOS.

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
