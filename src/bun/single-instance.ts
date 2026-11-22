import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";

export interface Instance {
	/** Called each time the user starts Stault again while this copy runs. */
	onSecondLaunch(callback: () => void): void;
}

/** Where the running copy listens. Windows has no socket files, so a named pipe stands in. */
function address(dataDir: string): string {
	if (process.platform !== "win32") return join(dataDir, "instance.sock");
	return `\\\\.\\pipe\\stault-${createHash("sha1").update(dataDir).digest("hex").slice(0, 16)}`;
}

/**
 * Makes this the one running copy of Stault for its data folder. Two copies
 * would run the same downloads twice and invalidate each other's session.
 * Resolves to null when another copy is already running; that copy is told.
 */
export function claimInstance(dataDir: string): Promise<Instance | null> {
	const path = address(dataDir);
	let secondLaunch = () => {};
	const instance: Instance = {
		onSecondLaunch(callback) {
			secondLaunch = callback;
		},
	};
	return new Promise((resolve) => {
		const probe = createConnection(path);
		probe.once("connect", () => {
			probe.end();
			resolve(null);
		});
		probe.once("error", (error: NodeJS.ErrnoException) => {
			// A reset means a copy answered and hung up before the connection was reported.
			if (error.code === "ECONNRESET") return resolve(null);
			// Nobody answered, so a socket file here is left over from a copy that crashed.
			if (process.platform !== "win32") rmSync(path, { force: true });
			mkdirSync(dataDir, { recursive: true });
			const server = createServer((socket) => {
				socket.on("error", () => {});
				socket.end();
				secondLaunch();
			});
			server.once("error", (error: NodeJS.ErrnoException) => {
				// In use: another copy started at the same moment and won.
				// Anything else: no lock is possible here, and running beats refusing to.
				resolve(error.code === "EADDRINUSE" ? null : instance);
			});
			server.listen(path, () => {
				server.unref();
				resolve(instance);
			});
		});
	});
}
