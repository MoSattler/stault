// The parts of the GameVault 17.x REST API that Stault reads.
// Checked against a live 17.2.0 server; see /api/docs on any server.

import type { GameType, ProgressState } from "../../shared/model";

export interface ApiStatus {
	status: "HEALTHY" | "UNHEALTHY";
	version: string;
	server_uuid?: string;
	available_authentication_methods?: string[];
}

export interface ApiTokens {
	access_token: string;
	refresh_token: string;
}

export interface ApiMedia {
	id: number;
}

export interface ApiNamed {
	name: string;
}

export interface ApiMetadata {
	title: string | null;
	description: string | null;
	release_date: string | null;
	cover: ApiMedia | null;
	background: ApiMedia | null;
	launch_executable: string | null;
	launch_parameters: string | null;
	installer_executable: string | null;
	installer_parameters: string | null;
	umu_game_id: string | null;
	umu_store: string | null;
	umu_proton_path: string | null;
	genres?: ApiNamed[];
	developers?: ApiNamed[];
	publishers?: ApiNamed[];
}

export interface ApiVersion {
	id: number;
	/** Path of the archive on the server. */
	file_path: string;
	version: string | null;
	/** Bytes, as a decimal string. */
	size: string;
	early_access: boolean;
	type: GameType;
}

export interface ApiGame {
	id: number;
	created_at: string;
	title: string;
	sort_title: string | null;
	version: string | null;
	size: string;
	release_date: string | null;
	early_access: boolean;
	type: GameType;
	metadata: ApiMetadata | null;
	/** Filled on the detail endpoint only; the list returns an empty array. */
	versions?: ApiVersion[];
}

export interface ApiProgress {
	minutes_played: number;
	state: ProgressState;
	last_played_at: string | null;
	game?: { id: number };
}

export interface ApiUser {
	id: number;
	username: string;
	progresses?: ApiProgress[];
	bookmarked_games?: { id: number }[];
}

export interface ApiPage<T> {
	data: T[];
	meta: { currentPage: number; totalPages: number };
}
