import { describe, expect, test } from "bun:test";
import {
	ApiError,
	findServer,
	GameVaultClient,
	normalizeServerUrl,
	OfflineError,
	SignedOutError,
} from "../src/bun/gamevault/client";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A stand-in server: access tokens are "a1", "a2"…; only the newest one is accepted. */
function fakeServer() {
	const calls: string[] = [];
	let issued = 0;
	let refreshAccepted = true;
	const fetchImpl = async (url: string, init: RequestInit = {}) => {
		const path = new URL(url).pathname;
		const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? "";
		calls.push(`${init.method ?? "GET"} ${path}`);
		if (path === "/api/auth/basic/login") {
			if (auth !== `Basic ${btoa("sam:secret")}`) return json({ message: "nope" }, 401);
			issued++;
			return json({ access_token: `a${issued}`, refresh_token: `r${issued}` });
		}
		if (path === "/api/auth/oauth2/token") {
			const body = JSON.parse(String(init.body));
			if (body.code !== "c1" || body.code_verifier !== "v1") return json({ message: "The login code is invalid." }, 401);
			issued++;
			return json({ access_token: `a${issued}`, refresh_token: `r${issued}` });
		}
		if (path === "/api/auth/refresh") {
			if (!refreshAccepted || auth !== `Bearer r${issued}`) return json({}, 401);
			issued++;
			return json({ access_token: `a${issued}`, refresh_token: `r${issued}` });
		}
		if (auth !== `Bearer a${issued}`) return json({ message: "expired" }, 401);
		if (path === "/api/users/me") return json({ id: 7, username: "sam" });
		return json({ message: "Game not found" }, 404);
	};
	return {
		calls,
		fetchImpl,
		expireAccessToken: () => issued++,
		rejectRefresh: () => {
			refreshAccepted = false;
		},
	};
}

describe("normalizeServerUrl", () => {
	test("adds https and drops trailing slashes and /api", () => {
		expect(normalizeServerUrl(" vault.lan/ ")).toBe("https://vault.lan");
		expect(normalizeServerUrl("http://nas.local:8080/api/")).toBe("http://nas.local:8080");
		expect(normalizeServerUrl("https://example.com/gamevault")).toBe("https://example.com/gamevault");
	});
	test("rejects an empty address", () => {
		expect(() => normalizeServerUrl("  ")).toThrow();
	});
});

describe("findServer", () => {
	const answering = (origin: string) => async (url: string) => {
		if (!url.startsWith(origin)) throw new TypeError("fetch failed");
		return json({ status: "HEALTHY", version: "17.2.0" });
	};

	test("an address without a scheme falls back from https to http", async () => {
		const found = await findServer("nas.local:8080", answering("http://nas.local:8080"));
		expect(found.serverUrl).toBe("http://nas.local:8080");
		expect(found.status.version).toBe("17.2.0");
	});

	test("https wins when both would answer", async () => {
		const found = await findServer("vault.lan", async () => json({ status: "HEALTHY", version: "17.2.0" }));
		expect(found.serverUrl).toBe("https://vault.lan");
	});

	test("an explicit scheme is not second-guessed", async () => {
		expect(findServer("https://nas.local:8080", answering("http://nas.local:8080"))).rejects.toBeInstanceOf(OfflineError);
	});

	test("something that answers but is not GameVault is rejected", async () => {
		expect(findServer("http://router.lan", async () => json({ hello: "world" }))).rejects.toThrow("not like a GameVault server");
	});
});

describe("ssoReturnsToApps", () => {
	/** A server that refuses a loopback login without a PKCE challenge, or one that passes it on to its identity provider. */
	const server = (takesApps: boolean) => async (url: string, init?: RequestInit) => {
		const asked = new URL(url);
		expect(asked.pathname).toBe("/api/auth/oauth2/login");
		expect(asked.searchParams.get("client_origin")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		expect(asked.searchParams.has("code_challenge")).toBe(false);
		expect(init?.redirect).toBe("manual");
		return takesApps
			? json({ message: "A loopback client_origin requires a PKCE code_challenge." }, 400)
			: new Response(null, { status: 302, headers: { Location: "https://idp.example/authorize" } });
	};

	test("a server that hands single sign-on back to apps turns down a login without PKCE", async () => {
		expect(await GameVaultClient.ssoReturnsToApps("http://gv", server(true))).toBe(true);
	});

	test("one that doesn't sends it on to the identity provider", async () => {
		expect(await GameVaultClient.ssoReturnsToApps("http://gv", server(false))).toBe(false);
	});
});

describe("GameVaultClient", () => {
	test("logs in and hands the tokens to the hook", async () => {
		const server = fakeServer();
		const saved: string[] = [];
		const client = new GameVaultClient("http://gv", null, { onTokens: (t) => void saved.push(t.refresh_token) }, server.fetchImpl);
		await client.login("sam", "secret");
		expect(saved).toEqual(["r1"]);
		expect((await client.me()).username).toBe("sam");
	});

	test("a wrong password is a clear error", async () => {
		const server = fakeServer();
		const client = new GameVaultClient("http://gv", null, { onTokens() {} }, server.fetchImpl);
		expect(client.login("sam", "wrong")).rejects.toThrow("Wrong username or password.");
	});

	test("trades a single sign-on's one-time code and verifier for tokens", async () => {
		const server = fakeServer();
		const saved: string[] = [];
		const client = new GameVaultClient("http://gv", null, { onTokens: (t) => void saved.push(t.refresh_token) }, server.fetchImpl);
		await expect(client.redeemLoginCode("c1", "not-it")).rejects.toThrow("The login code is invalid.");
		await client.redeemLoginCode("c1", "v1");
		expect(saved).toEqual(["r1"]);
		expect((await client.me()).username).toBe("sam");
	});

	test("hands its tokens on to another client", async () => {
		const server = fakeServer();
		const saved: string[] = [];
		const client = new GameVaultClient("http://gv", null, { onTokens: (t) => void saved.push(t.refresh_token) }, server.fetchImpl);
		await new GameVaultClient("http://gv", null, { onTokens: (t) => client.adopt(t) }, server.fetchImpl).login("sam", "secret");
		expect(saved).toEqual(["r1"]);
		expect((await client.me()).username).toBe("sam");
		expect(server.calls).toEqual(["GET /api/auth/basic/login", "GET /api/users/me"]);
	});

	test("refreshes once when the access token has expired, even for parallel requests", async () => {
		const server = fakeServer();
		const saved: string[] = [];
		const client = new GameVaultClient("http://gv", null, { onTokens: (t) => void saved.push(t.refresh_token) }, server.fetchImpl);
		await client.login("sam", "secret");
		server.expireAccessToken();
		// The stand-in's refresh token moved on with the expiry; put the client in step.
		const fresh = new GameVaultClient("http://gv", "r2", { onTokens: (t) => void saved.push(t.refresh_token) }, server.fetchImpl);
		const [a, b] = await Promise.all([fresh.me(), fresh.me()]);
		expect(a.username).toBe("sam");
		expect(b.username).toBe("sam");
		expect(server.calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(1);
		expect(saved.at(-1)).toBe("r3");
	});

	test("starts from a stored refresh token alone", async () => {
		const server = fakeServer();
		server.expireAccessToken(); // tokens a1/r1 now current
		const client = new GameVaultClient("http://gv", "r1", { onTokens() {} }, server.fetchImpl);
		expect((await client.me()).id).toBe(7);
	});

	test("a rejected refresh token means signed out", async () => {
		const server = fakeServer();
		server.rejectRefresh();
		const client = new GameVaultClient("http://gv", "r0", { onTokens() {} }, server.fetchImpl);
		expect(client.me()).rejects.toBeInstanceOf(SignedOutError);
	});

	test("server errors carry the server's message", async () => {
		const server = fakeServer();
		const client = new GameVaultClient("http://gv", null, { onTokens() {} }, server.fetchImpl);
		await client.login("sam", "secret");
		const error = await client.game(99).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(404);
		expect(error.message).toBe("Game not found");
	});

	test("an unreachable server is reported as offline", async () => {
		const online: boolean[] = [];
		const client = new GameVaultClient(
			"http://gv",
			"r1",
			{ onTokens() {}, onOnline: (o) => void online.push(o) },
			async () => {
				throw new TypeError("fetch failed");
			},
		);
		expect(client.me()).rejects.toBeInstanceOf(OfflineError);
		await Promise.resolve();
		expect(online).toEqual([false]);
	});
});

describe("save files", () => {
	const signedIn = (answer: (method: string, init: RequestInit) => Response) => {
		const calls: { method: string; path: string; init: RequestInit }[] = [];
		const client = new GameVaultClient("http://gv", "r0", { onTokens() {} }, async (url, init = {}) => {
			const path = new URL(url).pathname;
			if (path === "/api/auth/refresh") return json({ access_token: "a1", refresh_token: "r1" });
			calls.push({ method: init.method ?? "GET", path, init });
			return answer(init.method ?? "GET", init);
		});
		return { client, calls };
	};

	test("the newest save is read from the file name, without downloading it", async () => {
		const { client, calls } = signedIn(
			() =>
				new Response(null, {
					headers: { "Content-Disposition": 'attachment; filename="1700000000123_24660172-3e73-4539-8653-286a02ba82d9.zip"' },
				}),
		);
		expect(await client.newestSave(7, 3)).toEqual({
			uploadedAt: 1700000000123,
			installationId: "24660172-3e73-4539-8653-286a02ba82d9",
		});
		expect(calls).toMatchObject([{ method: "HEAD", path: "/api/savefiles/user/7/game/3" }]);
	});

	test("no save yet is not an error; save files switched off is", async () => {
		const none = signedIn(() => json({ message: "Savefile was not found." }, 404));
		expect(await none.client.newestSave(7, 3)).toBeNull();
		const off = signedIn(() => json({ message: "This API endpoint is disabled." }, 405));
		const error = await off.client.newestSave(7, 3).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(405);
	});

	test("an upload is a form with the zip, marked with this install's id", async () => {
		const { client, calls } = signedIn(() => new Response(null, { status: 201 }));
		await client.uploadSave(7, 3, new Blob(["zip"]), "24660172-3e73-4539-8653-286a02ba82d9");
		const [call] = calls;
		expect(call).toMatchObject({ method: "POST", path: "/api/savefiles/user/7/game/3" });
		expect((call.init.headers as Record<string, string>)["X-Installation-Id"]).toBe("24660172-3e73-4539-8653-286a02ba82d9");
		expect(((call.init.body as FormData).get("file") as File).name).toBe("save.zip");
	});
});
