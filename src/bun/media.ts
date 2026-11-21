import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GameVaultClient } from "./gamevault/client";

/**
 * Serves the server's images to the webview. The server only hands them out
 * with a bearer token, which an <img> tag cannot send, so the webview loads
 * them from this loopback server instead. Images are cached on disk.
 */
export class MediaProxy {
	private client: GameVaultClient | null = null;
	private cacheDir = "";
	// Random per run, so other local programs can't read images through the port.
	private readonly key = crypto.randomUUID();
	private readonly server: ReturnType<typeof Bun.serve>;

	constructor(private readonly cacheRoot: string) {
		this.server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: (request) => this.handle(request),
		});
	}

	/** Points the proxy at a server (or at none, after sign-out). */
	use(client: GameVaultClient | null) {
		this.client = client;
		if (!client) return;
		const host = new URL(client.serverUrl).host.replace(/[^a-z0-9.-]/gi, "_");
		this.cacheDir = join(this.cacheRoot, host);
		mkdirSync(this.cacheDir, { recursive: true });
	}

	url = (mediaId: number) =>
		`http://127.0.0.1:${this.server.port}/${this.key}/${mediaId}`;

	private async handle(request: Request): Promise<Response> {
		const [, key, id] = new URL(request.url).pathname.split("/");
		if (key !== this.key || !/^\d+$/.test(id ?? "") || !this.client) {
			return new Response(null, { status: 404 });
		}
		const headers = {
			"Cache-Control": "private, max-age=31536000, immutable",
			"Access-Control-Allow-Origin": "*",
		};
		const cached = Bun.file(join(this.cacheDir, id));
		if (await cached.exists()) return new Response(cached, { headers });
		try {
			const upstream = await this.client.media(Number(id));
			const body = await upstream.arrayBuffer();
			await Bun.write(cached, body);
			return new Response(body, {
				headers: {
					...headers,
					"Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
				},
			});
		} catch {
			return new Response(null, { status: 502 });
		}
	}
}
