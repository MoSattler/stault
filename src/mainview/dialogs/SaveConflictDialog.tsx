import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { Dialog, dialogButton } from "../components/Dialog";
import { formatWhenTime } from "../format";
import { play, serverHost } from "../state/derive";
import { attempt, setUi, useApp } from "../state/store";

interface Props {
	game: GameSummary;
	/** Asked on the way into the game: start it once the choice is made. */
	thenPlay: boolean;
}

const choice =
	"flex min-h-11 w-full flex-col gap-0.5 rounded-lg border border-edge bg-panel px-3.5 py-2.5 text-left hover:border-lime";

/** Asked when saves changed on this device and on the server since they were last in step. */
export function SaveConflictDialog({ game, thenPlay }: Props) {
	const conflict = useApp((s) => s.saves.find((x) => x.gameId === game.id)?.conflict);
	const deviceName = useApp((s) => s.deviceName);
	const session = useApp((s) => s.session);
	const host = session ? serverHost(session.serverUrl) : "the server";
	const close = () => setUi({ saveConflict: null });

	async function choose(direction: "upload" | "download") {
		close();
		const done = await attempt(api.syncSaves({ gameId: game.id, direction }).then(() => true));
		if (done && thenPlay) await play(game.id);
	}

	return (
		<Dialog labelledBy="d-saves" onClose={close} className="max-w-[520px]">
			<div className="flex flex-col gap-1.5 border-b border-line bg-panel p-5">
				<h2 id="d-saves" className="stretch-125 text-xl font-extrabold uppercase leading-none">
					Which saves for {game.title}?
				</h2>
				<p className="text-[13px] text-muted">
					Saves changed on this device and on another one since they were last in step. Stault can't merge them.
				</p>
			</div>
			<div className="flex flex-col gap-2 p-5">
				<button type="button" onClick={() => choose("download")} className={choice}>
					<span className="font-semibold">Use the save on {host}</span>
					{conflict && (
						<span className="font-mono text-[11.5px] text-soft">
							Uploaded {formatWhenTime(conflict.serverAt)} · from {conflict.serverDevice ?? "another device"}
						</span>
					)}
					<span className="text-[12.5px] text-muted">
						This device's saves are replaced; a copy stays in the game's folder.
					</span>
				</button>
				<button type="button" onClick={() => choose("upload")} className={choice}>
					<span className="font-semibold">Keep the saves on {deviceName || "this device"}</span>
					{conflict?.localAt && (
						<span className="font-mono text-[11.5px] text-soft">Last changed {formatWhenTime(conflict.localAt)}</span>
					)}
					<span className="text-[12.5px] text-muted">
						They are uploaded and become the newest on {host}, for your other devices too.
					</span>
				</button>
			</div>
			<div className="flex justify-end border-t border-line px-5 py-4">
				<button type="button" onClick={close} className={dialogButton}>
					{thenPlay ? "Don't start" : "Decide later"}
				</button>
			</div>
		</Dialog>
	);
}
