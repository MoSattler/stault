# Stault design

Design for Stault, a Steam-style client for a self-hosted [GameVault](https://gamevau.lt) server.

Live canvas (private until shared from its Share menu): https://claude.ai/artifact/6i5oQAmmhSYzDzTHYRtaun

| File | Board |
| --- | --- |
| `Main.dc.html` | Desktop library prototype (Windows, macOS, SteamOS desktop) |
| `Connect.dc.html` | First-run screen: connect to the server and sign in |
| `Deck.dc.html` | Big Picture Mode for Steam Deck (1280×800) and TVs |
| `DirVault.dc.html` | Visual direction: Vault |
| `canvas.json` | Canvas layout, board titles and notes |

The `.dc.html` files are Claude Design artboards. They load the canvas runtime (`support.js`), so they only render on the canvas, not when opened directly in a browser.
