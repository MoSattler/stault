import { afterAll, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract } from "../src/bun/extract";

const os = { darwin: "mac", win32: "win", linux: "linux" }[process.platform as "darwin" | "win32" | "linux"];
const sevenZip = join(import.meta.dir, "..", "node_modules", "7zip-bin-full", os, process.arch, os === "win" ? "7z.exe" : "7zz");

// Creating a symbolic link needs special rights on Windows.
const linkTest = test.skipIf(process.platform === "win32");

const root = mkdtempSync(join(tmpdir(), "stault-extract-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A fresh folder to work in, with an `outside` folder next to where the archive lands. */
function sandbox(name: string) {
	const dir = join(root, name);
	mkdirSync(join(dir, "source"), { recursive: true });
	mkdirSync(join(dir, "outside"));
	writeFileSync(join(dir, "outside", "victim.txt"), "safe");
	return { dir, source: join(dir, "source"), archive: join(dir, "game.zip"), out: join(dir, "out"), outside: join(dir, "outside") };
}

/** Adds paths from `cwd` to an archive, storing links as links. */
function add(archive: string, cwd: string, ...paths: string[]) {
	const made = Bun.spawnSync([sevenZip, "a", "-snl", archive, ...paths], { cwd });
	if (!made.success) throw new Error(made.stderr.toString());
}

/** A tar archive. An entry with `linkTo` is a hard link, which 7-Zip cannot be made to store. */
function tar(entries: { name: string; data?: string; linkTo?: string }[]) {
	const blocks = entries.flatMap(({ name, data = "", linkTo }) => {
		const header = Buffer.alloc(512);
		const field = (text: string, at: number) => header.write(text, at);
		field(name, 0);
		field("0000644\0", 100);
		field(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
		field("00000000000\0", 136);
		field("        ", 148); // The checksum counts itself as spaces.
		field(linkTo ? "1" : "0", 156);
		field(linkTo ?? "", 157);
		field("ustar\0" + "00", 257);
		field(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
		const body = Buffer.alloc(Math.ceil(data.length / 512) * 512);
		body.write(data);
		return [header, body];
	});
	return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

const noProgress = () => {};

linkTest("extracts a macOS framework, whose links pass through other links", async () => {
	const box = sandbox("framework");
	const framework = join("Game.app", "Contents", "Frameworks", "Sparkle.framework");
	mkdirSync(join(box.source, framework, "Versions", "A"), { recursive: true });
	writeFileSync(join(box.source, framework, "Versions", "A", "Sparkle"), "binary");
	symlinkSync("A", join(box.source, framework, "Versions", "Current"));
	symlinkSync("Versions/Current/Sparkle", join(box.source, framework, "Sparkle"));
	// Stripped frameworks keep links to folders that were removed.
	symlinkSync("Versions/Current/Headers", join(box.source, framework, "Headers"));
	add(box.archive, box.source, "Game.app");

	await extract(sevenZip, box.archive, box.out, noProgress);

	expect(readlinkSync(join(box.out, framework, "Sparkle"))).toBe("Versions/Current/Sparkle");
	expect(readFileSync(join(box.out, framework, "Sparkle"), "utf8")).toBe("binary");
	expect(readlinkSync(join(box.out, framework, "Headers"))).toBe("Versions/Current/Headers");
});

linkTest("refuses a link that leads out of the folder", async () => {
	const box = sandbox("link-out");
	writeFileSync(join(box.source, "Game.exe"), "program");
	symlinkSync("../outside", join(box.source, "saves"));
	add(box.archive, box.source, ".");

	await expect(extract(sevenZip, box.archive, box.out, noProgress)).rejects.toThrow(/"saves" is a link to somewhere outside/);
	expect(existsSync(box.out)).toBe(false);
});

linkTest("refuses a dangling link that would lead out once its target exists", async () => {
	const box = sandbox("dangling-out");
	mkdirSync(join(box.source, "a", "b"), { recursive: true });
	symlinkSync("../..", join(box.source, "a", "b", "top")); // The folder itself: allowed alone.
	symlinkSync("top/../later", join(box.source, "a", "b", "sneaky")); // The folder's parent, via top.
	add(box.archive, box.source, ".");

	await expect(extract(sevenZip, box.archive, box.out, noProgress)).rejects.toThrow(/sneaky" is a link to somewhere outside/);
});

// Pins 7-Zip's behaviour with its own check off: files are written before links are made.
linkTest("never writes a file through a link", async () => {
	const box = sandbox("write-through");
	symlinkSync("../outside", join(box.source, "evil"));
	add(box.archive, box.source, "evil");
	rmSync(join(box.source, "evil"));
	mkdirSync(join(box.source, "evil"));
	writeFileSync(join(box.source, "evil", "planted.txt"), "x");
	add(box.archive, box.source, "evil/planted.txt");

	await expect(extract(sevenZip, box.archive, box.out, noProgress)).rejects.toThrow();
	expect(existsSync(join(box.outside, "planted.txt"))).toBe(false);
	expect(existsSync(box.out)).toBe(false);
});

linkTest("refuses a hard link to a file outside the folder", async () => {
	const box = sandbox("hard-link-out");
	const archive = join(box.dir, "game.tar");
	writeFileSync(archive, tar([{ name: "settings.txt", linkTo: "../outside/victim.txt" }]));

	await expect(extract(sevenZip, archive, box.out, noProgress)).rejects.toThrow(/"settings.txt" is a link to somewhere outside/);
	expect(readFileSync(join(box.outside, "victim.txt"), "utf8")).toBe("safe");
	expect(lstatSync(join(box.outside, "victim.txt")).nlink).toBe(1);
});

linkTest("keeps hard links between files of the same archive", async () => {
	const box = sandbox("hard-link-in");
	const archive = join(box.dir, "game.tar");
	writeFileSync(archive, tar([{ name: "a.txt", data: "hi" }, { name: "b.txt", linkTo: "a.txt" }]));

	await extract(sevenZip, archive, box.out, noProgress);

	expect(readFileSync(join(box.out, "b.txt"), "utf8")).toBe("hi");
	expect(lstatSync(join(box.out, "b.txt")).nlink).toBe(2);
});
