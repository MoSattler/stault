import { useEffect, useState } from "react";
import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { Dialog, dialogButton, dialogPrimary } from "../components/Dialog";
import { attempt, setUi, useApp } from "../state/store";

const field = "min-h-10 min-w-0 flex-auto rounded-md border border-line bg-panel px-3 text-[13px]";

/**
 * Lets the user say which Ludusavi entry a game is, when Stault matched none
 * or the wrong one. Ludusavi's names follow PCGamingWiki, not the server.
 * A game it doesn't list can have its save files named by hand instead.
 */
export function SaveGameDialog({ game }: { game: GameSummary }) {
	const save = useApp((s) => s.saves.find((x) => x.gameId === game.id));
	const current = save?.paths ? null : (save?.name ?? null);
	const [byHand, setByHand] = useState(!!save?.paths);
	const close = () => setUi({ choosingSaveGame: null });

	return (
		<Dialog labelledBy="d-savegame" onClose={close} className="max-w-[560px]">
			<div className="flex flex-col gap-1.5 border-b border-line bg-panel p-5">
				<h2 id="d-savegame" className="stretch-125 text-xl font-extrabold uppercase leading-none">
					{byHand ? `Where does ${game.title} save?` : `Which game is ${game.title}?`}
				</h2>
				<p className="text-[13px] text-muted">
					{byHand
						? "Add the files or folders the game saves to on this device. Stault syncs exactly these."
						: "Save locations come from Ludusavi, which lists games under their PCGamingWiki names. Pick this game's entry."}
				</p>
			</div>
			{byHand ? (
				<SaveFiles game={game} initial={save?.paths ?? []} back={() => setByHand(false)} close={close} />
			) : (
				<SearchEntries game={game} current={current} byHand={() => setByHand(true)} close={close} />
			)}
		</Dialog>
	);
}

function SearchEntries({
	game,
	current,
	byHand,
	close,
}: {
	game: GameSummary;
	current: string | null;
	byHand(): void;
	close(): void;
}) {
	const [query, setQuery] = useState(game.title);
	const [results, setResults] = useState<string[] | null>(null);

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
		<>
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
					className={field}
				/>
				<button type="submit" className={dialogButton}>Search</button>
			</form>
			<ul className="flex min-h-[120px] flex-col gap-2 p-5 pb-3">
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
			<p className="px-5 pb-5 text-[13px] text-muted">
				Not listed?{" "}
				<button type="button" onClick={byHand} className="text-lime hover:text-lime-hi">
					Choose the save files yourself
				</button>
			</p>
			<div className="flex justify-between gap-2.5 border-t border-line px-5 py-4">
				<button type="button" onClick={() => choose(null)} className={dialogButton}>Don't sync this game</button>
				<button type="button" onClick={close} className={dialogButton}>Cancel</button>
			</div>
		</>
	);
}

function SaveFiles({
	game,
	initial,
	back,
	close,
}: {
	game: GameSummary;
	initial: string[];
	back(): void;
	close(): void;
}) {
	// The last row is always empty, for typing a new path.
	const [paths, setPaths] = useState<string[]>([...initial, ""]);
	const [saving, setSaving] = useState(false);
	const kept = paths.map((path) => path.trim()).filter(Boolean);

	function edit(index: number, value: string) {
		const next = paths.map((path, i) => (i === index ? value : path));
		setPaths(next.at(-1) ? [...next, ""] : next);
	}
	function remove(index: number) {
		setPaths(paths.filter((_, i) => i !== index));
	}
	async function pick(folder: boolean) {
		const picked = await attempt(api.pickSavePath({ gameId: game.id, folder }));
		// Goes in above the empty row, which `edit` keeps last.
		if (picked && !paths.includes(picked)) setPaths((now) => [...now.slice(0, -1), picked, now.at(-1)!]);
	}
	async function use() {
		setSaving(true);
		// Stays open on an error, so what was typed isn't lost.
		const done = await attempt(api.setSavePaths({ gameId: game.id, paths: kept }).then(() => true));
		setSaving(false);
		if (done) close();
	}

	return (
		<>
			<ul className="flex min-h-[120px] flex-col gap-2 px-5 pt-5">
				{paths.map((path, index) => {
					const last = index === paths.length - 1;
					return (
						<li key={index} className="flex gap-2">
							<input
								aria-label={last ? "New save path" : `Save path ${index + 1}`}
								value={path}
								placeholder={last ? "Type a path, or add one below" : undefined}
								spellCheck={false}
								onChange={(event) => edit(index, event.target.value)}
								className={`${field} font-mono text-xs`}
							/>
							{!last && (
								<button
									type="button"
									aria-label={`Remove ${path}`}
									onClick={() => remove(index)}
									className={`${dialogButton} px-3.5`}
								>
									✕
								</button>
							)}
						</li>
					);
				})}
			</ul>
			<div className="flex flex-wrap items-center gap-2 px-5 pt-3">
				<button type="button" onClick={() => pick(false)} className={dialogButton}>Add file…</button>
				<button type="button" onClick={() => pick(true)} className={dialogButton}>Add folder…</button>
			</div>
			<p className="px-5 pt-3 pb-5 text-[12.5px] text-muted">
				A folder includes everything in it. Use * to match several files, as in{" "}
				<span className="font-mono text-xs">saves/*.sav</span>.
			</p>
			<div className="flex justify-between gap-2.5 border-t border-line px-5 py-4">
				<button type="button" onClick={back} className={dialogButton}>Back to search</button>
				<div className="flex gap-2.5">
					<button type="button" onClick={close} className={dialogButton}>Cancel</button>
					<button type="button" disabled={!kept.length || saving} onClick={use} className={dialogPrimary}>Use these</button>
				</div>
			</div>
		</>
	);
}
