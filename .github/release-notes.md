## Install

You need a GameVault server, version 17.0 or newer.

**macOS** (Apple Silicon, macOS 14 or newer)

```bash
brew install --cask mosattler/tap/stault
```

Or download `macos-arm64-Stault.dmg` below. Stault is not code-signed, so macOS refuses a copy taken straight from the DMG until you run this once (the Homebrew cask does it for you):

```bash
xattr -dr com.apple.quarantine /Applications/Stault.app
```

**Windows** (x64): download `win-x64-Stault-Setup.zip` below, unzip it and run `Stault-Setup.exe`. Stault is not code-signed, so Windows may warn that the publisher is unknown: choose **More info**, then **Run anyway**.

**Linux** (x64)

```bash
curl -fsSL https://github.com/MoSattler/stault/releases/download/@TAG@/linux-x64-Stault-Setup.tar.gz | tar -xz -C /tmp && /tmp/installer
```

This installs Stault into `~/.local/share` without root, adds it to the application menu and starts it.
