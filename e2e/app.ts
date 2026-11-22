// What the specs share: the test server's account and the app's first steps.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "@wdio/globals";

const seed = readFileSync(join(import.meta.dirname, "..", "dev", "seed.sh"), "utf8");
const read = (name: string) => seed.match(new RegExp(`^${name}=(.*)$`, "m"))![1];

/** STAULT_SERVER overrides the address where the server goes by another name, as inside a container. */
export const SERVER = process.env.STAULT_SERVER ?? read("SERVER");
export const USER = read("DEV_USER");
export const PASSWORD = read("DEV_PASSWORD");

/** The home folder of the app under test. Each spec file gets a new, empty one (wdio.conf.ts). */
export const HOME = process.env.HOME!;

export const gameList = () => $("aside[aria-label='Game list']");

/** Signs in on the Connect screen and waits for the library. */
export async function signIn() {
	await $("#srv").setValue(SERVER);
	await $("#usr").setValue(USER);
	await $("#pwd").setValue(PASSWORD);
	await $("button[type=submit]").click();
	await gameList().waitForDisplayed();
}

/** Opens a game's page from the list on the left. */
export async function openGame(title: string) {
	await gameList().$(`button*=${title}`).click();
}
