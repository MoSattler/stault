// Signs the Stault dev build into the local test server without going through
// the Connect screen, for automated testing. Run the app once first, so its
// data folder exists (the app prints the path as "Data folder:" on start).
//
//   hutch dev/sign-in.ts "<data folder>"

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GameVaultClient } from "../src/bun/gamevault/client";
import { readJson, writeJson } from "../src/bun/json-file";

const dataDir = process.argv[2];
if (!dataDir) throw new Error('Usage: hutch dev/sign-in.ts "<data folder>"');

const seed = readFileSync(join(import.meta.dir, "seed.sh"), "utf8");
const read = (name: string) => seed.match(new RegExp(`^${name}=(.*)$`, "m"))![1];
const serverUrl = read("SERVER");
const username = read("DEV_USER");

let refreshToken = "";
const client = new GameVaultClient(serverUrl, null, {
	onTokens: (tokens) => {
		refreshToken = tokens.refresh_token;
	},
});
const status = await GameVaultClient.status(serverUrl);
await client.login(username, read("DEV_PASSWORD"));
const me = await client.me();

const settingsPath = join(dataDir, "settings.json");
writeJson(settingsPath, {
	...readJson<object>(settingsPath, {}),
	account: { serverUrl, serverVersion: status.version, userId: Number(me.id), username: me.username },
	lastSignIn: { serverUrl, username: me.username },
});
// The app reads this file when the keychain has no entry for the account.
writeJson(join(dataDir, "session.json"), { [`${serverUrl}#${username}`]: refreshToken }, 0o600);
console.log(`Signed ${username} in to ${serverUrl}. Start the app.`);
