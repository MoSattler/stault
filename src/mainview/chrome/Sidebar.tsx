import { useEffect, useMemo, useRef } from "react";
import type { GameSummary } from "../../shared/model";
import { Cover } from "../components/Cover";
import { gameMenu } from "../components/GameMenu";
import { SearchIcon } from "../components/icons";
import { useGameStatus } from "../state/derive";
import { go, setUi, useApp, useUi } from "../state/store";

function Row({ game, selected }: { game: GameSummary; selected: boolean }) {
	const status = useGameStatus(game);
	const menuOpen = useUi((s) => s.menu?.gameId === game.id);
	const here = status.running || !!status.install || !!status.download;
	// Playing is green and a download blue; otherwise brightness says whether the game is on this device.
	const tone = status.running
		? "text-green"
		: status.download
			? status.download.error ? "text-amber" : "text-sky"
			: null;
	return (
		<li>
			<button
				type="button"
				onClick={() => go({ name: "game", gameId: game.id })}
				onContextMenu={gameMenu(game.id)}
				className={`flex w-full items-center gap-2.5 rounded-md py-[5px] pl-1.5 pr-2 text-left hover:bg-hover ${selected || menuOpen ? "bg-hover" : ""}`}
			>
				<Cover
					title={game.title}
					url={game.coverUrl}
					className={`h-9 w-[26px] flex-none rounded-[3px] ${here ? "" : "opacity-40 grayscale-[.6]"}`}
				/>
				<span className="flex min-w-0 flex-auto flex-col gap-px">
					<span className={`truncate text-[13px] font-semibold ${tone ?? (here ? "text-ink" : "text-faint")}`}>{game.title}</span>
					<span className={`whitespace-nowrap font-mono text-[10.5px] ${tone ?? "text-faint"}`}>{status.line}</span>
				</span>
			</button>
		</li>
	);
}

export function Sidebar() {
	const games = useApp((s) => s.games);
	const installs = useApp((s) => s.installs);
	const downloads = useApp((s) => s.downloads);
	const platform = useApp((s) => s.platform);
	const query = useUi((s) => s.query);
	const filter = useUi((s) => s.filter);
	const view = useUi((s) => s.view);
	const search = useRef<HTMLInputElement>(null);

	// ⌘K / Ctrl+K jumps to the search field.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				search.current?.focus();
				search.current?.select();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const here = useMemo(
		() => new Set([...installs.map((i) => i.gameId), ...downloads.map((d) => d.gameId)]),
		[installs, downloads],
	);
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return games
			.filter((g) => (filter === "all" || here.has(g.id)) && (!q || g.title.toLowerCase().includes(q)))
			.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
	}, [games, here, query, filter]);

	const pill = (on: boolean) =>
		`min-h-[30px] rounded text-[12.5px] font-semibold ${on ? "bg-line text-ink" : "text-muted"}`;

	return (
		<aside aria-label="Game list" className="flex w-[264px] flex-none flex-col gap-3 border-r border-hover bg-panel py-3.5 pl-3 pr-2.5">
			<label className="flex min-h-[38px] items-center gap-2 rounded-md border border-line bg-raised pl-2.5 pr-2 text-muted">
				<SearchIcon />
				<input
					ref={search}
					type="search"
					value={query}
					onChange={(e) => setUi({ query: e.target.value })}
					placeholder={`Search ${games.length} games`}
					aria-label="Search library"
					className="min-w-0 flex-auto bg-transparent py-2 text-[13px] text-ink outline-none"
				/>
				<kbd className="rounded border border-edge px-[5px] py-px font-mono text-[10.5px]">
					{platform === "macos" ? "⌘K" : "Ctrl K"}
				</kbd>
			</label>

			<div role="group" aria-label="Show" className="grid grid-cols-2 gap-0.5 rounded-md bg-raised p-0.5">
				<button type="button" onClick={() => setUi({ filter: "all" })} aria-pressed={filter === "all"} className={pill(filter === "all")}>
					All · {games.length}
				</button>
				<button type="button" onClick={() => setUi({ filter: "installed" })} aria-pressed={filter === "installed"} className={pill(filter === "installed")}>
					Installed · {installs.length}
				</button>
			</div>

			<ul className="-mr-1.5 flex min-h-0 flex-auto flex-col gap-0.5 overflow-y-auto pr-1.5">
				{shown.map((game) => (
					<Row key={game.id} game={game} selected={view.name === "game" && view.gameId === game.id} />
				))}
				{shown.length === 0 && (
					<p className="mx-2 my-1 text-[13px] text-muted">
						{query.trim()
							? `No games match “${query.trim()}”.`
							: filter === "installed"
								? "Nothing installed on this device yet."
								: "This server has no games yet."}
					</p>
				)}
			</ul>

			<p className="mx-2 pt-1 font-mono text-[10.5px] leading-[1.6] text-faint">
				New games appear when they land in the server's /files folder.
			</p>
		</aside>
	);
}
