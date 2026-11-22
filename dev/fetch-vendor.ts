// Fetches the pinned builds of the programs Stault bundles into vendor/, from
// where electrobun.config.ts copies them into the app. They are not on npm, so
// they can't be dependencies. Runs before every build and dev start; does
// nothing for a program already in place.
//
// - Ludusavi finds and moves game saves, on every OS.
// - umu-launcher runs Windows games through Proton, on Linux.
// - 7-Zip extracts games, on an Intel Mac. Everywhere else it comes from npm.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..");
/** The system and chip the build is for, as in "darwin-arm64". */
const host = `${process.platform}-${process.arch}`;

async function download(url: string, sha256: string): Promise<Buffer> {
	const name = basename(url);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${name}: the download answered ${response.status}.`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (actual !== sha256) throw new Error(`${name}: checksum mismatch (${actual}).`);
	return bytes;
}

/** Downloads and checks an archive, then unpacks it into `target`. */
async function unpack(url: string, sha256: string, target: string) {
	const archive = join(target, basename(url));
	writeFileSync(archive, await download(url, sha256));
	// Windows has no tar that reads zip everywhere; the 7-Zip the app bundles does.
	const command =
		process.platform === "win32"
			? [join(root, "node_modules", "7zip-bin-full", "win", process.arch, "7z.exe"), "x", archive, `-o${target}`, "-y"]
			: ["tar", "-xf", archive, "-C", target];
	const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
	if (result.status !== 0) throw new Error(`Could not unpack ${archive}.`);
	rmSync(archive);
}

/** Fills vendor/<name>/ with `fill`, unless it already holds this version. */
async function vendor(name: string, version: string, fill: (target: string) => Promise<void>) {
	const target = join(root, "vendor", name);
	const stamp = join(target, "version");
	const wanted = `${version} ${host}`;
	if (existsSync(stamp) && readFileSync(stamp, "utf8") === wanted) return;
	console.log(`Fetching ${name} ${version}…`);
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });
	await fill(target);
	writeFileSync(stamp, wanted);
}

// --- Ludusavi ----------------------------------------------------------------

const LUDUSAVI = "0.31.0";
const LUDUSAVI_RELEASE = `https://github.com/mtkennerly/ludusavi/releases/download/v${LUDUSAVI}`;

// Checksums as published with the release.
const LUDUSAVI_BUILDS: Record<string, { archive: string; sha256: string; binary: string }> = {
	"darwin-arm64": {
		archive: `ludusavi-v${LUDUSAVI}-mac.tar.gz`,
		sha256: "5787e64d4c795180ab485535cae0b0ef6ee14d4fbe3813797a86913a37cc47f1",
		binary: "ludusavi",
	},
	"linux-x64": {
		archive: `ludusavi-v${LUDUSAVI}-linux.tar.gz`,
		sha256: "7322ff45d41eae7ae064a80d8c9ecccc5b8fb6fc090a603a66369cd4b054068d",
		binary: "ludusavi",
	},
	"win32-x64": {
		archive: `ludusavi-v${LUDUSAVI}-win64.zip`,
		sha256: "f47a8ad8c708f01d2eb124704973beffab205e292f5287a10fc4a101f8d68706",
		binary: "ludusavi.exe",
	},
};
// Since 0.31 the Mac release is for Apple Silicon only, so an Intel Mac compiles
// the release's source instead, which needs Rust. Checksum of GitHub's archive
// of the tag.
const LUDUSAVI_SOURCE = {
	url: `https://github.com/mtkennerly/ludusavi/archive/refs/tags/v${LUDUSAVI}.tar.gz`,
	sha256: "e7dcfa4fb17fcd2be9ef34d55fe0ca0d3f79fdf570107aeaa5b4e76910e2f8a1",
};
// The licences of everything compiled into Ludusavi, shipped next to it.
const LUDUSAVI_LEGAL = {
	archive: `ludusavi-v${LUDUSAVI}-legal.zip`,
	sha256: "9fce11fc44942efdd5969928d89b106c229f9a041d7a713c424a6da981660ebf",
};

/** Compiles Ludusavi from the release's source into `target`. */
async function compileLudusavi(target: string) {
	const source = join(target, "source");
	mkdirSync(source);
	await unpack(LUDUSAVI_SOURCE.url, LUDUSAVI_SOURCE.sha256, source);
	const dir = join(source, `ludusavi-${LUDUSAVI}`);
	const result = spawnSync("cargo", ["build", "--release", "--locked"], {
		cwd: dir,
		stdio: "inherit",
		// Build for the oldest macOS Stault supports, whatever this Mac runs.
		env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: "14.0" },
	});
	if (result.error) throw new Error(`Building Ludusavi needs Rust (https://rustup.rs): ${result.error.message}`);
	if (result.status !== 0) throw new Error("Could not build Ludusavi.");
	renameSync(join(dir, "target", "release", "ludusavi"), join(target, "ludusavi"));
	rmSync(source, { recursive: true });
}

await vendor("ludusavi", LUDUSAVI, async (target) => {
	const build = LUDUSAVI_BUILDS[host];
	if (build) {
		await unpack(`${LUDUSAVI_RELEASE}/${build.archive}`, build.sha256, target);
		if (process.platform !== "win32") chmodSync(join(target, build.binary), 0o755);
	} else if (host === "darwin-x64") {
		await compileLudusavi(target);
	} else {
		throw new Error(`Ludusavi has no build for ${host}.`);
	}
	writeFileSync(
		join(target, "legal.zip"),
		await download(`${LUDUSAVI_RELEASE}/${LUDUSAVI_LEGAL.archive}`, LUDUSAVI_LEGAL.sha256),
	);
});

// --- umu-launcher (Linux) ------------------------------------------------------

// The zipapp: a single Python program, run by the system's python3, with the
// libraries it needs and all their licences inside. Checksum as GitHub lists it
// for the release file.
const UMU = "1.4.4";
const UMU_ZIPAPP = {
	url: `https://github.com/Open-Wine-Components/umu-launcher/releases/download/${UMU}/umu-launcher-${UMU}-zipapp.tar`,
	sha256: "eb590691841f7fad3fc3ad8fd5db4ccb87849fe7948e62b28ece7a4ee48cc851",
};

if (process.platform === "linux") {
	await vendor("umu", UMU, async (target) => {
		await unpack(UMU_ZIPAPP.url, UMU_ZIPAPP.sha256, target);
		// The archive holds umu/umu-run and a link to it.
		renameSync(join(target, "umu", "umu-run"), join(target, "umu-run"));
		rmSync(join(target, "umu"), { recursive: true });
		chmodSync(join(target, "umu-run"), 0o755);
	});
}

// --- 7-Zip (Intel Mac) -----------------------------------------------------------

// Since 26.6.0 the 7zip-bin-full package's mac/x64 folder holds the Apple Silicon
// build, so an Intel Mac takes 7-Zip's own build of the same version. Raise the
// two together. Checksum as GitHub lists it for the release file.
const SEVEN_ZIP = "26.06";
const SEVEN_ZIP_INTEL_MAC = {
	url: `https://github.com/ip7z/7zip/releases/download/${SEVEN_ZIP}/7z${SEVEN_ZIP.replace(".", "")}-mac-x64.tar.xz`,
	sha256: "3af68b124052da7fc2a246c96b0bea6a68bfee389baa788f4cead1a133445586",
};

if (host === "darwin-x64") {
	await vendor("7zip", SEVEN_ZIP, (target) =>
		unpack(SEVEN_ZIP_INTEL_MAC.url, SEVEN_ZIP_INTEL_MAC.sha256, target),
	);
}
