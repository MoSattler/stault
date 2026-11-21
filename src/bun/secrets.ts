import { rmSync } from "node:fs";
import { readJson, writeJson } from "./json-file";

const SERVICE = "com.mosattler.stault";

export interface SecretStore {
	get(name: string): Promise<string | null>;
	set(name: string, value: string): Promise<void>;
	delete(name: string): Promise<void>;
}

/**
 * Keeps secrets in the OS keychain (Keychain, Credential Manager, libsecret).
 * Where no keychain service is running (possible in SteamOS Gaming Mode), it
 * falls back to a file only the current user can read.
 */
export function createSecretStore(fallbackPath: string): SecretStore {
	const file = {
		get: (name: string) => readJson<Record<string, string>>(fallbackPath, {})[name] ?? null,
		set(name: string, value: string) {
			const all = readJson<Record<string, string>>(fallbackPath, {});
			writeJson(fallbackPath, { ...all, [name]: value }, 0o600);
		},
		delete(name: string) {
			const all = readJson<Record<string, string>>(fallbackPath, {});
			if (!(name in all)) return;
			delete all[name];
			if (Object.keys(all).length) writeJson(fallbackPath, all, 0o600);
			else rmSync(fallbackPath, { force: true });
		},
	};

	return {
		async get(name) {
			try {
				const value = await Bun.secrets.get({ service: SERVICE, name });
				if (value) return value;
			} catch {
				// No keychain: use the file.
			}
			return file.get(name);
		},
		async set(name, value) {
			try {
				await Bun.secrets.set({ service: SERVICE, name, value });
				file.delete(name);
			} catch {
				file.set(name, value);
			}
		},
		async delete(name) {
			try {
				await Bun.secrets.delete({ service: SERVICE, name });
			} catch {
				// No keychain: nothing stored there.
			}
			file.delete(name);
		},
	};
}
