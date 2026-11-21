# Stault

A Steam-style desktop client for a self-hosted [GameVault](https://gamevau.lt) server, for Windows, macOS and SteamOS.

Built with [Electrobun](https://docs.electrobun.dev/electrobun/) 2 (Bun main process, system webview), React, Tailwind CSS and Vite. Design boards are in [design/](design/README.md).

## What v0.1 does

- Connects to a GameVault server (17.0 or newer) and signs in. The session token is kept in the system keychain.
- Shows the library: recently played, new on the server, all games, and a page per game.
- Installs games: a download queue with pause, resume, a bandwidth limit and recovery after a restart, then extraction with a bundled 7-Zip.
- Launches games and records playtime on the server.

| | Launches |
| --- | --- |
| Windows | Windows builds |
| Linux / SteamOS | Linux builds natively, Windows builds through [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher) (install it separately) |
| macOS | Games whose files contain a Mac `.app`. Windows builds are not supported. |

Not in v0.1: cloud saves, Big Picture Mode, Steam shortcuts, single sign-on.

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
| `test` | Runs the unit tests. |
| `typecheck` | Type-checks `src/`, `test/` and `dev/`. |
| `build:canary` | Builds a canary release for the current OS and architecture. Close the dev app first. |
| `build` | Builds a stable release for the current OS and architecture. |

Hutch builds only for the OS it runs on, so a Windows or Linux build has to be made on that OS.

## Test server

`./dev/seed.sh` starts a local GameVault server in Docker at http://127.0.0.1:18080 with a few tiny sample games and a test account (see the script for its name and password). One sample, Harbor Lights, is a real Mac app, so install and launch can be tried on macOS.

## Layout

```
src/shared/       Types shared by both sides, including the RPC contract
src/bun/          Main process: server client, session, downloads, installs, launcher
src/mainview/     Webview UI: React + Tailwind, built by Vite
test/             Unit tests (Bun's test runner)
dev/              Local test server and helper scripts
electrobun.config.ts   App identity and how the bundle is assembled
hutch.config.ts        Tasks and the pinned Electrobun version
```

Installed games live in the library folders chosen in Settings, one folder per game, each with a `.stault/manifest.json` that describes the install.
