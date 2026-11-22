import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeFolder } from "../src/bun/folders";

const root = mkdtempSync(join(tmpdir(), "stault-folders-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("removes a folder with everything in it, and is content with one that is gone", async () => {
	const folder = join(root, "game");
	mkdirSync(join(folder, "files", "data"), { recursive: true });
	writeFileSync(join(folder, "files", "data", "level0"), "x");

	await removeFolder(folder);
	expect(existsSync(folder)).toBe(false);
	await removeFolder(folder);
});
