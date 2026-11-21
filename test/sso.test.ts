import { expect, test } from "bun:test";
import { ssoLoginUrl, watchForTokens } from "../src/bun/sso";

const SERVER = "http://nas.local:8080";
const IDP = "https://id.example.com/authorize?client_id=gamevault&state=abc";

/** Feeds a login window's addresses to a watcher and returns what the last one gave. */
function visit(serverUrl: string, addresses: string[]) {
	const tokensIn = watchForTokens(serverUrl);
	return addresses.map(tokensIn).at(-1);
}

test("the login starts at the server's OAuth2 endpoint", () => {
	expect(ssoLoginUrl(SERVER)).toBe("http://nas.local:8080/api/auth/oauth2/login");
});

test("takes the tokens from the server's last redirect", () => {
	const callback = encodeURIComponent(`${SERVER}/api/auth/oauth2/login`);
	expect(
		visit(SERVER, [
			ssoLoginUrl(SERVER),
			`${IDP}&redirect_uri=${callback}`,
			"https://id.example.com/login?step=2",
			`${SERVER}/api/auth/oauth2/login?code=xyz&state=abc`,
			`${SERVER}/?access_token=a%2B1&refresh_token=r1`,
		]),
	).toEqual({ access_token: "a+1", refresh_token: "r1" });
});

test("accepts the form older servers use, without the slash", () => {
	expect(visit(SERVER, [`${SERVER}?access_token=a1&refresh_token=r1`])).toEqual({
		access_token: "a1",
		refresh_token: "r1",
	});
});

test("says nothing until both tokens are there", () => {
	expect(visit(SERVER, [ssoLoginUrl(SERVER)])).toBeNull();
	expect(visit(SERVER, [`${SERVER}/?access_token=a1`])).toBeNull();
	expect(visit(SERVER, ["about:blank"])).toBeNull();
	expect(visit(SERVER, ["not an address"])).toBeNull();
});

test("ignores tokens offered by any other site", () => {
	expect(visit(SERVER, [IDP, "https://id.example.com/?access_token=a1&refresh_token=r1"])).toBeNull();
	expect(visit(SERVER, ["http://nas.local:9999/?access_token=a1&refresh_token=r1"])).toBeNull();
});

test("trusts the address the server names for the way back, when it differs from the one typed", () => {
	const callback = encodeURIComponent("https://vault.example.com/api/auth/oauth2/login");
	const tokens = "https://vault.example.com/?access_token=a1&refresh_token=r1";
	expect(visit(SERVER, [ssoLoginUrl(SERVER), `${IDP}&redirect_uri=${callback}`, tokens])).toEqual({
		access_token: "a1",
		refresh_token: "r1",
	});
	// Only the server's own first redirect can name it.
	const later = `https://id.example.com/next?redirect_uri=${callback}`;
	expect(visit(SERVER, [ssoLoginUrl(SERVER), IDP, later, tokens])).toBeNull();
});
