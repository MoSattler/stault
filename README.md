<div align="center">

<img src="assets/icon.svg" width="96" alt="">

# Stault

**The launcher your [GameVault](https://gamevau.lt) server deserves.**

A Steam-style desktop client for your self-hosted game library.<br>
Browse, install, play and sync saves on Windows, macOS and SteamOS.

[![Latest release](https://img.shields.io/github/v/release/MoSattler/stault?color=c5f04a&labelColor=16181c)](https://github.com/MoSattler/stault/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MoSattler/stault/total?color=c5f04a&labelColor=16181c)](https://github.com/MoSattler/stault/releases)
![Platforms](https://img.shields.io/badge/platforms-Windows%20·%20macOS%20·%20Linux-c5f04a?labelColor=16181c)

[Install](#install) · [Features](#features) · [Save sync](#save-sync) · [Contributing](CONTRIBUTING.md)

<img src="docs/screenshots/library.webp" alt="The Stault library: a game to jump back into, recently added games and the full list in the sidebar">

</div>

## Features

- **Your whole library.** Recently played, recently added, search, and a page per game with the art and details from your server.
- **Installs that take care of themselves.** A download queue with pause, resume and a bandwidth limit. It picks up where it left off after a restart.
- **Play and keep count.** Stault launches the game and records your playtime on the server.
- **Saves that follow you.** A newer save is fetched before the game starts, and yours is uploaded after you quit.
- **Sign in once.** The session token is kept in the system keychain. The password is never stored.

<p align="center">
<img src="docs/screenshots/game.webp" width="49%" alt="A game's page with its play button, playtime, save status and details">
<img src="docs/screenshots/downloads.webp" width="49%" alt="The download queue with one game downloading and two completed">
</p>

## Install

You need a GameVault server, version 17.0 or newer.

**macOS** (Apple Silicon, macOS 14 or newer)

```bash
brew install --cask mosattler/tap/stault
```

**Linux and SteamOS** (x64)

```bash
curl -fsSL https://github.com/MoSattler/stault/releases/latest/download/linux-x64-Stault-Setup.tar.gz | tar -xz -C /tmp && /tmp/installer
```

This installs Stault into `~/.local/share` without root, adds it to the application menu and starts it. Run it again to upgrade.

**Windows**: download the installer from the [latest release](https://github.com/MoSattler/stault/releases/latest).

The builds are not code-signed. Windows warns before opening them. macOS refuses a copy taken straight from the DMG until you run `xattr -dr com.apple.quarantine /Applications/Stault.app` once; the Homebrew cask does this for you.

## What runs where

| | Launches |
| --- | --- |
| Windows | Windows builds |
| Linux / SteamOS | Linux builds natively, Windows builds through [umu-launcher](https://github.com/Open-Wine-Components/umu-launcher) (install it separately) |
| macOS | Games whose files contain a Mac `.app`. Windows builds are not supported. |

Stault is young. It has been run on macOS and, in a test container, on Linux; on Windows, launching and save sync are covered by tests but have not been run there.

Not built yet: Big Picture Mode, Steam shortcuts, single sign-on.

## Save sync

Before a game starts, Stault fetches a newer save from the server; after you quit, it uploads yours. The game's page shows where its saves stand and has buttons to move them by hand.

The server has to accept save files: set `SAVEFILES_ENABLED=true` on it and give `/savefiles` a volume. They are off by default.

<details>
<summary>How it behaves</summary>

- [Ludusavi](https://github.com/mtkennerly/ludusavi), bundled with Stault, finds the save files. A game it doesn't know is not synced. When Stault matches no entry or the wrong one, choose it on the game's page.
- Offline, a game starts with the saves on the device, and saves made meanwhile are uploaded once the server is back.
- When saves changed on two devices, Stault asks which to keep. It never overwrites a save it has not seen on either side.
- Saves use the format of the official GameVault client, so a Windows build's saves move between it and Stault, and between Windows and Linux. A Mac build's saves only move between Macs.
- Only the newest save on the server can be fetched. The server keeps older ones (10 by default) on its disk.

</details>

## Contributing

Stault is built with [Electrobun](https://docs.electrobun.dev/electrobun/) 2 (Bun main process, system webview), React, Tailwind CSS and Vite. With [Hutch](https://docs.electrobun.dev/electrobun/guides/hutch/) installed:

```bash
hutch run install
```

```bash
hutch run dev:hmr
```

Tasks, the test server, the code layout and how releases work are in [CONTRIBUTING.md](CONTRIBUTING.md). Design boards are in [design/](design/README.md).
