import { readJson, writeJson } from "./json-file";

export interface Settings {
	/** Set while signed in. The refresh token itself lives in the secret store. */
	account: {
		serverUrl: string;
		serverVersion: string;
		userId: number;
		username: string;
	} | null;
	deviceName: string;
	libraryFolders: string[];
	speedLimitKib: number;
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
