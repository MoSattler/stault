import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimInstance } from "../src/bun/single-instance";

const root = mkdtempSync(join(tmpdir(), "stault-instance-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the first copy runs, a second one is turned away and announced", async () => {
	const dataDir = join(root, "data");
	const first = await claimInstance(dataDir);
	expect(first).not.toBeNull();
	const announced = new Promise<void>((resolve) => first!.onSecondLaunch(resolve));

	expect(await claimInstance(dataDir)).toBeNull();
	await announced;
});

test("another data folder is another Stault", async () => {
	expect(await claimInstance(join(root, "one"))).not.toBeNull();
	expect(await claimInstance(join(root, "two"))).not.toBeNull();
});
