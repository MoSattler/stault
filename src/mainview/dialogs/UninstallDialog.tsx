import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { Dialog, dialogButton } from "../components/Dialog";
import { attempt, setUi, showToast } from "../state/store";

/** Asks before a game's files are deleted from this device. */
export function UninstallDialog({ game }: { game: GameSummary }) {
	const close = () => setUi({ uninstalling: null });

	async function uninstall() {
		close();
		if ((await attempt(api.uninstall({ gameId: game.id }).then(() => true))) === true) {
			showToast(`${game.title} uninstalled`, "It stays on the server");
		}
	}

	return (
		<Dialog labelledBy="d-uninstall" onClose={close} className="max-w-[440px]">
			<div className="flex flex-col gap-2 p-5">
				<h2 id="d-uninstall" className="stretch-125 text-xl font-extrabold uppercase leading-none">
					Uninstall {game.title}?
				</h2>
				<p className="text-[13px] text-muted">
					Its files are deleted from this device. The game stays on the server, and your playtime is kept.
				</p>
			</div>
			<div className="flex justify-end gap-2.5 border-t border-line px-5 py-4">
				<button type="button" onClick={close} className={dialogButton}>Cancel</button>
				<button type="button" onClick={uninstall} className="min-h-[42px] rounded-md bg-[#FF8A7E] px-[22px] font-[750] uppercase tracking-[0.04em] text-carbon hover:brightness-110">
					Uninstall
				</button>
			</div>
		</Dialog>
	);
}
