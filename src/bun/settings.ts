import { readJson, writeJson } from "./json-file";

export interface Settings {
	/** Set while signed in. The refresh token itself lives in the secret store. */
	account: {
		serverUrl: string;
		serverVersion: string;
		userId: number;
		username: string;
	} | null;
	/** Kept after sign-out, to prefill the Connect screen. */
	lastSignIn: { serverUrl: string; username: string } | null;
	deviceName: string;
	libraryFolders: string[];
	speedLimitKib: number;
	/** Keep game saves in step with the server. */
	saveSync: boolean;
}

export class SettingsFile {
	private value: Settings;

	constructor(
		private readonly path: string,
		defaults: Settings,
	) {
		this.value = { ...defaults, ...readJson<Partial<Settings>>(path, {}) };
	}

	get(): Settings {
		return this.value;
	}

	update(patch: Partial<Settings>) {
		this.value = { ...this.value, ...patch };
		writeJson(this.path, this.value);
	}
}
