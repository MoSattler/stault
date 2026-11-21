// Fetches the pinned Ludusavi build for this platform into vendor/ludusavi/,
// from where electrobun.config.ts copies it into the app. Ludusavi finds and
// moves game saves; it is not on npm, so it can't be a dependency.
// Runs before every build and dev start; does nothing when already in place.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "0.31.0";
const RELEASE = `https://github.com/mtkennerly/ludusavi/releases/download/v${VERSION}`;

// Checksums as published with the release.
const BUILDS = {
	darwin: {
		archive: `ludusavi-v${VERSION}-mac.tar.gz`,
		sha256: "5787e64d4c795180ab485535cae0b0ef6ee14d4fbe3813797a86913a37cc47f1",
		binary: "ludusavi",
	},
	linux: {
		archive: `ludusavi-v${VERSION}-linux.tar.gz`,
		sha256: "7322ff45d41eae7ae064a80d8c9ecccc5b8fb6fc090a603a66369cd4b054068d",
		binary: "ludusavi",
	},
	win32: {
		archive: `ludusavi-v${VERSION}-win64.zip`,
		sha256: "f47a8ad8c708f01d2eb124704973beffab205e292f5287a10fc4a101f8d68706",
		binary: "ludusavi.exe",
	},
};
// The licences of everything compiled into Ludusavi, shipped next to it.
const LEGAL = {
	archive: `ludusavi-v${VERSION}-legal.zip`,
	sha256: "9fce11fc44942efdd5969928d89b106c229f9a041d7a713c424a6da981660ebf",
};

const root = join(import.meta.dir, "..");
const target = join(root, "vendor", "ludusavi");
const stamp = join(target, "version");
const build = BUILDS[process.platform as keyof typeof BUILDS];
if (!build) throw new Error(`Ludusavi has no build for ${process.platform}.`);

async function download(name: string, sha256: string): Promise<Buffer> {
	const response = await fetch(`${RELEASE}/${name}`);
	if (!response.ok) throw new Error(`${name}: the download answered ${response.status}.`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (actual !== sha256) throw new Error(`${name}: checksum mismatch (${actual}).`);
	return bytes;
}

function unpack(archive: string) {
	// Windows has no tar that reads zip everywhere; the 7-Zip the app bundles does.
	const command =
		process.platform === "win32"
			? [join(root, "node_modules", "7zip-bin-full", "win", process.arch, "7z.exe"), "x", archive, `-o${target}`, "-y"]
			: ["tar", "-xzf", archive, "-C", target];
	const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
	if (result.status !== 0) throw new Error(`Could not unpack ${archive}.`);
}

const wanted = `${VERSION} ${process.platform}`;
if (existsSync(stamp) && readFileSync(stamp, "utf8") === wanted) process.exit(0);

console.log(`Fetching Ludusavi ${VERSION}…`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const archive = join(target, build.archive);
writeFileSync(archive, await download(build.archive, build.sha256));
unpack(archive);
rmSync(archive);
if (process.platform !== "win32") chmodSync(join(target, build.binary), 0o755);
writeFileSync(join(target, "legal.zip"), await download(LEGAL.archive, LEGAL.sha256));
writeFileSync(stamp, wanted);
