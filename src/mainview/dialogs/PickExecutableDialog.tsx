import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { Dialog, dialogButton } from "../components/Dialog";
import { play } from "../state/derive";
import { attempt, setUi } from "../state/store";

interface Props {
	game: GameSummary;
	candidates: string[];
}

/** Asked once per install when Stault can't tell which program starts the game. */
export function PickExecutableDialog({ game, candidates }: Props) {
	const close = () => setUi({ picking: null });

	async function choose(path: string) {
		close();
		await attempt(api.setExecutable({ gameId: game.id, path }));
		await play(game.id);
	}

	return (
		<Dialog labelledBy="d-pick" onClose={close} className="max-w-[520px]">
			<div className="flex flex-col gap-1.5 border-b border-line bg-panel p-5">
				<h2 id="d-pick" className="stretch-125 text-xl font-extrabold uppercase leading-none">
					Which one starts {game.title}?
				</h2>
				<p className="text-[13px] text-muted">
					Stault found several programs in this game's folder. It remembers your choice.
				</p>
			</div>
			<ul className="flex flex-col gap-2 p-5">
				{candidates.map((path) => (
					<li key={path}>
						<button type="button" onClick={() => choose(path)} className="flex min-h-11 w-full items-center rounded-lg border border-edge bg-panel px-3.5 text-left font-mono text-[12.5px] hover:border-lime">
							<span className="break-all">{path}</span>
						</button>
					</li>
				))}
			</ul>
			<div className="flex justify-end border-t border-line px-5 py-4">
				<button type="button" onClick={close} className={dialogButton}>Cancel</button>
			</div>
		</Dialog>
	);
}
