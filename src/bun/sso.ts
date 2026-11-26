import { createHash, randomBytes } from "node:crypto";

/**
 * Single sign-on in the system browser, the way RFC 8252 has native apps do
 * it (GameVault 17.3 and newer). Stault listens on a loopback port and opens
 * the server's login page; after the login, the server sends the browser back
 * to that port with a one-time code. The code is worth nothing without the
 * PKCE verifier, which never leaves Stault.
 *
 * Resolves once `redeem` has traded the code for tokens. Rejects with the
 * signal's reason when the sign-in is called off.
 */
export function browserSignIn(
	serverUrl: string,
	open: (url: string) => boolean,
	redeem: (code: string, verifier: string) => Promise<void>,
	signal: AbortSignal,
): Promise<void> {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");

	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		let answered = false;
		const listener = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				const url = new URL(request.url);
				const code = url.searchParams.get("code");
				// Only the first code counts. Anything else, such as the tab asking for an icon, gets nothing.
				if (url.pathname !== "/" || !code || answered) return new Response(null, { status: 404 });
				answered = true;
				try {
					await redeem(code, verifier);
					resolve();
					return page("You're signed in", "Head back to Stault. You can close this tab.");
				} catch (error) {
					reject(error);
					return page("Stault couldn't sign you in", `${(error as Error).message} Try again in Stault.`);
				} finally {
					stop();
				}
			},
		});
		const cancel = () => {
			stop();
			reject(signal.reason);
		};
		// Takes no more requests. One already in hand still gets its answer.
		const stop = () => {
			signal.removeEventListener("abort", cancel);
			void listener.stop();
		};
		signal.addEventListener("abort", cancel);

		const login = new URL(`${serverUrl}/api/auth/oauth2/login`);
		login.search = new URLSearchParams({
			client_origin: `http://127.0.0.1:${listener.port}`,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}).toString();
		if (!open(login.href)) {
			stop();
			reject(new Error("Stault couldn't open your web browser."));
		}
	});
}

/** What the browser tab shows once Stault has heard back. */
function page(title: string, text: string): Response {
	const escape = (value: string) => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
	return new Response(
		`<!doctype html><html lang="en"><meta charset="utf-8"><title>Stault</title>
<body style="margin:0;min-height:100vh;display:grid;place-content:center;gap:12px;padding:24px;text-align:center;background:#0b0c0e;color:#eceef0;font:16px/1.5 system-ui,sans-serif">
<h1 style="margin:0;font-size:24px">${escape(title)}</h1>
<p style="margin:0;color:#a9b0b8">${escape(text)}</p>`,
		{ headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
	);
}
