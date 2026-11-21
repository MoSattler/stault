# Stault

A Steam-style desktop client for a self-hosted [GameVault](https://gamevau.lt) server, for Windows, macOS and SteamOS.

Built with [Electrobun](https://docs.electrobun.dev/electrobun/) 2 (Bun main process, system webview), React, Tailwind CSS and Vite. Design boards are in [design/](design/README.md).

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
| `typecheck` | Type-checks `src/`. |
| `build:canary` | Builds a canary release for the current OS and architecture. |
| `build` | Builds a stable release for the current OS and architecture. |

## Layout

```
src/bun/          Main process: windows, native APIs, privileged code
src/mainview/     Webview UI: React + Tailwind, built by Vite
electrobun.config.ts   App identity and how the bundle is assembled
hutch.config.ts        Tasks and the pinned Electrobun version
```
