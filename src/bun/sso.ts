import type { ApiTokens } from "./gamevault/types";

/** Where single sign-on starts. The server sends the browser on to its identity provider. */
export function ssoLoginUrl(serverUrl: string): string {
	return `${serverUrl}/api/auth/oauth2/login`;
}

/**
 * Follows the login window from address to address and picks the tokens out
 * of the last one: after a login the server sends the browser to
 * "<its address>/?access_token=…&refresh_token=…".
 *
 * Tokens count only when that address belongs to the server. Behind a proxy
 * the server can be known to its identity provider under another address than
 * the one typed into Stault, so the address it names for the way back (the
 * `redirect_uri` of its first redirect) is trusted too.
 */
export function watchForTokens(serverUrl: string): (address: string) => ApiTokens | null {
	const loginUrl = ssoLoginUrl(serverUrl);
	const trusted = new Set([new URL(serverUrl).origin]);
	let leftServer = false;

	return (address) => {
		if (!URL.canParse(address)) return null;
		const url = new URL(address);

		if (!leftServer && address !== loginUrl) {
			leftServer = true;
			const callback = url.searchParams.get("redirect_uri");
			if (callback && URL.canParse(callback)) trusted.add(new URL(callback).origin);
		}

		const access_token = url.searchParams.get("access_token");
		const refresh_token = url.searchParams.get("refresh_token");
		if (!trusted.has(url.origin) || !access_token || !refresh_token) return null;
		return { access_token, refresh_token };
	};
}
