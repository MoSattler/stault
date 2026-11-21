import { useEffect, useState } from "react";
import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { Dialog, dialogButton } from "../components/Dialog";
import { attempt, setUi, useApp } from "../state/store";

/**
 * Lets the user say which Ludusavi entry a game is, when Stault matched none
 * or the wrong one. Ludusavi's names follow PCGamingWiki, not the server.
 */
export function SaveGameDialog({ game }: { game: GameSummary }) {
	const current = useApp((s) => s.saves.find((x) => x.gameId === game.id)?.name ?? null);
	const [query, setQuery] = useState(game.title);
	const [results, setResults] = useState<string[] | null>(null);
	const close = () => setUi({ choosingSaveGame: null });

	async function search(text: string) {
		setResults(null);
		setResults((await attempt(api.findSaveGames({ gameId: game.id, query: text }))) ?? []);
	}
	// Start with what the game's own title finds.
	useEffect(() => {
		void search(game.title);
	}, [game.id]);

	async function choose(name: string | null) {
		close();
		await attempt(api.setSaveGame({ gameId: game.id, name }));
	}

	return (
		<Dialog labelledBy="d-savegame" onClose={close} className="max-w-[520px]">
			<div className="flex flex-col gap-1.5 border-b border-line bg-panel p-5">
				<h2 id="d-savegame" className="stretch-125 text-xl font-extrabold uppercase leading-none">
					Which game is {game.title}?
				</h2>
				<p className="text-[13px] text-muted">
					Save locations come from Ludusavi, which lists games under their PCGamingWiki names. Pick this game's entry.
				</p>
			</div>
			<form
				className="flex gap-2 px-5 pt-5"
				onSubmit={(event) => {
					event.preventDefault();
					void search(query);
				}}
			>
				<input
					aria-label="Search Ludusavi's games"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="min-h-10 min-w-0 flex-auto rounded-md border border-line bg-panel px-3 text-[13px]"
				/>
				<button type="submit" className={dialogButton}>Search</button>
			</form>
			<ul className="flex min-h-[120px] flex-col gap-2 p-5">
				{results === null && <li className="text-[13px] text-muted">Searching…</li>}
				{results?.length === 0 && (
					<li className="text-[13px] text-muted">Nothing found. Try the game's full official name.</li>
				)}
				{results?.map((name) => (
					<li key={name}>
						<button
							type="button"
							onClick={() => choose(name)}
							className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-edge bg-panel px-3.5 text-left text-[13px] hover:border-lime"
						>
							<span>{name}</span>
							{name === current && <span className="font-mono text-[10.5px] tracking-[0.1em] text-lime">CURRENT</span>}
						</button>
					</li>
				))}
			</ul>
			<div className="flex justify-between gap-2.5 border-t border-line px-5 py-4">
				<button type="button" onClick={() => choose(null)} className={dialogButton}>Don't sync this game</button>
				<button type="button" onClick={close} className={dialogButton}>Cancel</button>
			</div>
		</Dialog>
	);
}
