# Stault

Steam-style desktop client for a self-hosted GameVault server. Design boards and decisions: `design/README.md`.

Stack: Electrobun 2 (Bun main process + system webview), React 19, Tailwind 4, Vite 7.

## Electrobun 2.x is not 1.x and not Electron

- The CLI is Hutch. Tasks live in `hutch.config.ts` and run as `hutch run <task>` (`dev`, `dev:hmr`, `typecheck`, `build`). `package.json` scripts are not used.
- The SDK is not an npm package. Hutch copies it into `.hutch/devkit` (git-ignored), and `electrobun/main` / `electrobun/view` resolve there through `tsconfig.json` and the aliases in `vite.config.ts`. Never add `electrobun` to `dependencies`.
- Install packages with `hutch install` (lockfile: `hutch.lock`). Run local binaries with `hutch pm exec -- <bin>`.
- Upgrade Electrobun with `hutch electrobun update`.
- Read the docs before using an API; older examples are wrong for 2.x: https://docs.electrobun.dev/electrobun/

## Working on the UI

The webview UI is a plain Vite app. `hutch run hmr` (preview config `ui` in `.claude/launch.json`) serves it at http://localhost:5173, so it can be built and inspected in a browser. There is no main process there: anything that calls into it over Electrobun RPC only works in the real app (`hutch run dev:hmr`), where webview console output is forwarded to the terminal.

## Layout

- `src/bun/`: main process. Owns windows, native APIs and anything privileged.
- `src/mainview/`: webview UI. Vite builds it to `dist/`, which `electrobun.config.ts` copies into the app bundle.
