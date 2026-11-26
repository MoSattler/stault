import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { browserSignIn } from "../src/bun/sso";

/** What the browser is sent to, and what it is shown back on the loopback port. */
interface Visit {
	login: URL;
	answer: (query: string, path?: string) => Promise<Response>;
}

/** A browser that opens nothing and lets the test play the server's redirect. */
function fakeBrowser() {
	let visited: (visit: Visit) => void;
	const visit = new Promise<Visit>((resolve) => (visited = resolve));
	const open = (url: string) => {
		const login = new URL(url);
		const origin = login.searchParams.get("client_origin");
		visited({ login, answer: (query, path = "/") => fetch(`${origin}${path}${query}`) });
		return true;
	};
	return { open, visit };
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("base64url");

describe("browserSignIn", () => {
	test("sends the browser to the server's login and redeems the code it brings back", async () => {
		const browser = fakeBrowser();
		const redeemed: string[][] = [];
		const signIn = browserSignIn(
			"http://gv.lan/vault",
			browser.open,
			async (code, verifier) => void redeemed.push([code, verifier]),
			new AbortController().signal,
		);
		const { login, answer } = await browser.visit;

		expect(login.origin + login.pathname).toBe("http://gv.lan/vault/api/auth/oauth2/login");
		expect(login.searchParams.get("client_origin")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		expect(login.searchParams.get("code_challenge_method")).toBe("S256");

		// Nothing but the server's redirect counts.
		expect((await answer("?code=abc", "/favicon.ico")).status).toBe(404);
		expect((await answer("")).status).toBe(404);

		const page = await answer("?code=abc");
		expect(await page.text()).toContain("You're signed in");
		await signIn;
		expect(redeemed.length).toBe(1);
		const [code, verifier] = redeemed[0];
		expect(code).toBe("abc");
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		expect(sha256(verifier)).toBe(login.searchParams.get("code_challenge")!);

		// The port is closed once the code is in.
		await expect(answer("?code=abc")).rejects.toThrow();
	});

	test("shows the browser why a code was turned down", async () => {
		const browser = fakeBrowser();
		const signIn = browserSignIn(
			"http://gv.lan",
			browser.open,
			async () => {
				throw new Error("The login code is <invalid>.");
			},
			new AbortController().signal,
		);
		const { answer } = await browser.visit;
		// Not expect().rejects: Bun's waits for the promise on the spot, before the browser could answer.
		const failure = signIn.catch((error: Error) => error);
		const page = await (await answer("?code=old")).text();
		expect(page).toContain("couldn't sign you in");
		expect(page).toContain("The login code is &#60;invalid&#62;.");
		expect((await failure)?.message).toBe("The login code is <invalid>.");
	});

	test("stops listening when called off", async () => {
		const browser = fakeBrowser();
		const abort = new AbortController();
		const signIn = browserSignIn("http://gv.lan", browser.open, async () => {}, abort.signal);
		const { answer } = await browser.visit;
		abort.abort(new Error("Called off."));
		await expect(signIn).rejects.toThrow("Called off.");
		await expect(answer("?code=late")).rejects.toThrow();
	});

	test("says so when no browser opens", async () => {
		const signIn = browserSignIn("http://gv.lan", () => false, async () => {}, new AbortController().signal);
		await expect(signIn).rejects.toThrow("couldn't open your web browser");
	});
});
