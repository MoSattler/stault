import type { GameSummary, SaveSync } from "../../shared/model";
import { api } from "../api";
import { formatWhenTime } from "../format";
import { serverHost } from "../state/derive";
import { attempt, go, setUi, useApp } from "../state/store";

const button =
	"min-h-[30px] rounded-[5px] border border-edge bg-raised px-3 text-xs font-semibold hover:bg-hover disabled:opacity-50";

function summary(save: SaveSync, host: string, online: boolean): { text: string; tone?: string } {
	switch (save.state) {
		case "unknown":
			return { text: "Looking up where this game keeps its saves…" };
		case "off":
			return { text: "Save sync is off for this game." };
		case "unsupported":
			return { text: "Stault doesn't know where this game keeps its saves, so they aren't synced." };
		case "syncing":
			return { text: "Syncing…" };
		case "pending":
			return {
				text: online
					? "Saves on this device are waiting to upload."
					: `Saves on this device upload when ${host} is back.`,
				tone: "text-amber",
			};
		case "conflict":
			return { text: "Saves changed on this device and on another one.", tone: "text-amber" };
		case "idle":
			return save.syncedAt
				? { text: `In step with ${host}. Last save uploaded ${formatWhenTime(save.syncedAt)}.` }
				: { text: `Nothing on ${host} yet. Saves upload after you play.` };
	}
}

/** Where an installed game's saves stand, and the controls to move them by hand. */
export function SavesCard({ game, running }: { game: GameSummary; running: boolean }) {
	const save = useApp((s) => s.saves.find((x) => x.gameId === game.id));
	const { enabled, serverOff } = useApp((s) => s.saveSync);
	const online = useApp((s) => s.online);
	const session = useApp((s) => s.session);
	const host = session ? serverHost(session.serverUrl) : "the server";

	let body: React.ReactNode;
	if (!enabled) {
		body = (
			<p className="text-[13px] text-muted">
				Save sync is off.{" "}
				<button type="button" onClick={() => go({ name: "settings" })} className="text-lime hover:text-lime-hi">
					Open settings
				</button>
			</p>
		);
	} else if (serverOff) {
		body = (
			<p className="text-[13px] text-muted">
				Save files are switched off on {host}. Whoever runs it can turn them on with{" "}
				<span className="select-text font-mono text-xs">SAVEFILES_ENABLED=true</span>.
			</p>
		);
	} else if (!save) {
		return null;
	} else {
		const { text, tone } = summary(save, host, online);
		const idle = save.state !== "syncing" && !running;
		const move = (direction: "upload" | "download") => attempt(api.syncSaves({ gameId: game.id, direction }));
		body = (
			<>
				<p className={`text-[13px] ${tone ?? "text-muted"}`}>{text}</p>
				{save.state === "off" ? (
					<button
						type="button"
						onClick={() => setUi({ properties: { gameId: game.id } })}
						className={`${button} self-start`}
					>
						Open properties
					</button>
				) : save.state === "conflict" ? (
					<button
						type="button"
						disabled={!idle}
						onClick={() => setUi({ saveConflict: { gameId: game.id, thenPlay: false } })}
						className={`${button} self-start`}
					>
						Choose which to keep…
					</button>
				) : (
					save.name && (
						<div className="flex flex-wrap gap-2">
							<button type="button" disabled={!idle || !online} onClick={() => move("upload")} className={button}>
								Upload now
							</button>
							<button type="button" disabled={!idle || !online} onClick={() => move("download")} className={button}>
								Fetch from server
							</button>
						</div>
					)
				)}
				{save.state !== "unknown" && save.state !== "off" && (
					<p className="flex flex-wrap items-baseline gap-x-2 border-t border-hover pt-2.5 text-[12.5px] text-muted">
						{save.paths ? (
							<span className="flex w-full flex-col gap-1">
								Save locations you chose
								{save.paths.map((path) => (
									<span key={path} className="select-text break-all font-mono text-xs text-ink">{path}</span>
								))}
							</span>
						) : save.name ? (
							<span>
								Save locations from Ludusavi's entry <span className="text-ink">{save.name}</span>
							</span>
						) : (
							<span>No Ludusavi entry chosen</span>
						)}
						<button
							type="button"
							disabled={!idle}
							onClick={() => setUi({ choosingSaveGame: { gameId: game.id } })}
							className="text-lime hover:text-lime-hi disabled:opacity-50"
						>
							{save.name ? "Change" : "Choose…"}
						</button>
					</p>
				)}
			</>
		);
	}

	return (
		<section aria-labelledby="h-saves" className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel px-5 py-[18px]">
			<h2 id="h-saves" className="text-sm font-bold">Saves</h2>
			{body}
		</section>
	);
}
