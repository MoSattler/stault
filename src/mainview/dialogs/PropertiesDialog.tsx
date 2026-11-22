import { type ReactNode, useEffect, useState } from "react";
import { typeLabel } from "../../shared/compat";
import type { Executables, GameSummary, Install } from "../../shared/model";
import { api } from "../api";
import { Cover } from "../components/Cover";
import { Dialog, dialogButton } from "../components/Dialog";
import { SettingRow, Switch } from "../components/SettingRow";
import { serverHost } from "../state/derive";
import { attempt, setUi, useApp } from "../state/store";

const button =
	"min-h-9 flex-none rounded-md border border-edge bg-raised px-3.5 text-[13px] font-semibold hover:bg-hover disabled:opacity-50";

/** The program Play starts: one Stault found in the game's files, or any file picked by hand. */
function Program({ gameId }: { gameId: number }) {
	const [found, setFound] = useState<Executables | null>(null);
	const [failed, setFailed] = useState<string | null>(null);

	useEffect(() => {
		api.getExecutables({ gameId }).then(setFound, (e) => setFailed(e instanceof Error ? e.message : String(e)));
	}, [gameId]);

	async function choose(path: string) {
		const before = found;
		setFound((f) => f && { ...f, current: path });
		const saved = await attempt(api.setExecutable({ gameId, path }).then(() => true));
		if (!saved) setFound(before);
	}

	async function browse() {
		const path = await attempt(api.browseExecutable({ gameId }));
		if (path) {
			setFound((f) => f && { current: path, candidates: f.candidates.includes(path) ? f.candidates : [path, ...f.candidates] });
		}
	}

	return (
		<div className="flex flex-col gap-2.5 border-b border-hover py-3.5">
			<span className="flex flex-col gap-0.5">
				<span id="props-program" className="font-semibold">Program</span>
				<span className="text-[12.5px] text-muted">
					What Play starts. Pick another program from the game's folder, or browse for one elsewhere.
				</span>
			</span>
			{failed ? (
				<p className="text-[13px] text-amber">{failed}</p>
			) : (
				<div className="flex gap-2">
					<select
						aria-labelledby="props-program"
						value={found?.current ?? ""}
						disabled={!found?.candidates.length}
						onChange={(event) => choose(event.target.value)}
						className="min-h-9 min-w-0 flex-auto rounded-md border border-line bg-raised pl-2 pr-7 font-mono text-[12.5px] text-ink disabled:text-muted"
					>
						{!found?.current && (
							<option value="" disabled>
								{!found ? "Looking for programs…" : found.candidates.length ? "Not chosen yet" : "None found"}
							</option>
						)}
						{found?.candidates.map((path) => (
							<option key={path} value={path}>
								{path}
							</option>
						))}
					</select>
					<button type="button" onClick={browse} disabled={!found} className={button}>
						Browse…
					</button>
				</div>
			)}
		</div>
	);
}

/** Whether the game's saves sync, and which Ludusavi entry says where they are. */
function Saves({ gameId }: { gameId: number }) {
	const save = useApp((s) => s.saves.find((x) => x.gameId === gameId));
	const { enabled, serverOff } = useApp((s) => s.saveSync);
	const running = useApp((s) => s.running?.gameId === gameId);
	const session = useApp((s) => s.session);
	const host = session ? serverHost(session.serverUrl) : "the server";
	const usable = enabled && !serverOff;
	const on = save?.state !== "off";

	let help = `Fetches a newer save from ${host} before the game starts, and uploads yours after you quit.`;
	if (!enabled) help = "Save sync is turned off for all games in Settings.";
	else if (serverOff) help = "Save files are switched off on the server.";

	let where: ReactNode = "Stault doesn't know where this game keeps its saves.";
	if (save?.state === "unknown") where = "Looking up where this game keeps its saves…";
	else if (save?.paths) where = "From the save files you chose.";
	else if (save?.name) where = <>From Ludusavi's entry <span className="text-ink">{save.name}</span>.</>;

	return (
		<>
			<SettingRow title="Sync saves" help={help}>
				<Switch
					label="Sync saves"
					// Shown as it works out: off while nothing can sync, whatever the game's own choice.
					on={usable && on}
					disabled={!usable || !save}
					onChange={(next) => attempt(api.setGameSaveSync({ gameId, on: next }))}
				/>
			</SettingRow>
			{usable && save && on && (
				<SettingRow title="Save locations" help={where}>
					<button
						type="button"
						aria-label={`${save.name ? "Change" : "Choose"} save locations`}
						disabled={save.state === "unknown" || save.state === "syncing" || running}
						onClick={() => setUi({ choosingSaveGame: { gameId } })}
						className={button}
					>
						{save.name ? "Change…" : "Choose…"}
					</button>
				</SettingRow>
			)}
		</>
	);
}

/** An installed game's settings on this device. Each change applies at once. */
export function PropertiesDialog({ game, install }: { game: GameSummary; install: Install }) {
	const close = () => setUi({ properties: null });
	const { os, kind } = typeLabel(install.type, install.version);

	return (
		<Dialog labelledBy="d-props" onClose={close} className="max-w-[560px]">
			<div className="flex items-center gap-4 border-b border-line bg-panel p-5">
				<Cover title={game.title} url={game.coverUrl} className="h-[73px] w-[52px] flex-none rounded" />
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-mono text-[11px] tracking-[0.14em] text-lime">PROPERTIES</span>
					<h2 id="d-props" className="stretch-125 text-[22px] font-extrabold uppercase leading-none">{game.title}</h2>
					<span className="font-mono text-[11.5px] text-muted">
						{install.version ?? "Unversioned"} · {os} · {kind}
					</span>
				</div>
			</div>
			<div className="flex flex-col px-5 py-1.5 [&>:last-child]:border-b-0">
				<Program gameId={game.id} />
				<Saves gameId={game.id} />
			</div>
			<div className="flex justify-end border-t border-line px-5 py-4">
				<button type="button" onClick={close} className={dialogButton}>Close</button>
			</div>
		</Dialog>
	);
}
