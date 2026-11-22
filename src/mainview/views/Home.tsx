import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { typeLabel } from "../../shared/compat";
import type { GameSummary } from "../../shared/model";
import { Cover } from "../components/Cover";
import { gameMenu } from "../components/GameMenu";
import { Heading } from "../components/Heading";
import { BackIcon, CheckIcon } from "../components/icons";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusLine } from "../components/StatusLine";
import { useRise } from "../components/useRise";
import { formatBytes, formatHours, formatWhen } from "../format";
import { useGameStatus } from "../state/derive";
import { go, setUi, type Sort, useApp, useUi } from "../state/store";

const open = (game: GameSummary) => go({ name: "game", gameId: game.id });

const playedLine = (game: GameSummary) =>
	`${formatHours(game.minutesPlayed)} · ${formatWhen(game.lastPlayedAt)}`;

function Featured({ game }: { game: GameSummary }) {
	const status = useGameStatus(game);
	return (
		<article onContextMenu={gameMenu(game.id)} className="relative flex min-h-[272px] flex-[1_0_clamp(480px,45cqw,760px)] flex-col justify-end overflow-hidden rounded-lg">
			<Cover title={game.title} url={game.backgroundUrl ?? game.coverUrl} className="!absolute inset-0" />
			<div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,12,14,.92)_0%,rgba(11,12,14,.55)_55%,rgba(11,12,14,0)_100%)]" />
			<div className="relative flex max-w-[520px] flex-col gap-3.5 p-7">
				<span className="font-mono text-[11px] uppercase tracking-[0.1em]">
					{formatHours(game.minutesPlayed)} played · last {formatWhen(game.lastPlayedAt)}
				</span>
				<button type="button" onClick={() => open(game)} className={`stretch-125 text-left font-extrabold uppercase leading-[1.02] tracking-[0.01em] text-white ${game.title.length <= 18 ? "text-[40px]" : game.title.length <= 34 ? "text-[30px]" : "text-[24px]"}`}>
					{game.title}
				</button>
				<div className="flex flex-wrap gap-2.5">
					<PrimaryButton primary={status.primary} size="card" />
					<button type="button" onClick={() => open(game)} className="min-h-[46px] rounded-md border border-ink/25 bg-carbon/40 px-[18px] text-[13px] font-semibold hover:bg-hover">
						Game details
					</button>
				</div>
			</div>
		</article>
	);
}

function RecentCard({ game }: { game: GameSummary }) {
	const status = useGameStatus(game);
	return (
		<article onContextMenu={gameMenu(game.id)} className="flex w-[280px] flex-none flex-col overflow-hidden rounded-lg border border-hover bg-raised transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-[0_14px_30px_rgba(0,0,0,.55)]">
			<Cover title={game.title} url={game.backgroundUrl ?? game.coverUrl} className="flex-[1_1_120px]" />
			<div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
				<button type="button" onClick={() => open(game)} className="text-left text-base font-bold">
					{game.title}
				</button>
				<div className="flex items-center justify-between gap-2.5">
					<span className="font-mono text-[11px] text-muted">{playedLine(game)}</span>
					<PrimaryButton primary={status.primary} size="compact" />
				</div>
			</div>
		</article>
	);
}

function Tile({ game, caption, className = "" }: { game: GameSummary; caption: "genres" | "status"; className?: string }) {
	const status = useGameStatus(game);
	return (
		<button type="button" onClick={() => open(game)} onContextMenu={gameMenu(game.id)} className={`flex flex-col gap-2 rounded text-left transition-transform duration-200 hover:-translate-y-[3px] ${className}`}>
			<span className="relative block w-full">
				<Cover title={game.title} url={game.coverUrl} labelled className="aspect-[5/7] w-full rounded" />
				{status.install && (
					<span className="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded bg-carbon/80">
						<CheckIcon size={12} strokeWidth={3} />
					</span>
				)}
				{status.download && (
					<span className="absolute inset-x-0 bottom-0 h-1 bg-carbon/70">
						<span className="block h-1 bg-lime" style={{ width: `${status.download.progress * 100}%` }} />
					</span>
				)}
			</span>
			<span className="text-[13px] font-semibold">{game.title}</span>
			{caption === "genres" ? (
				<span className="-mt-1.5 truncate text-xs text-muted">
					{game.genres.join(" · ") || `${typeLabel(game.type, game.version).os} · ${formatBytes(game.sizeBytes)}`}
				</span>
			) : (
				<span className="-mt-1.5 font-mono text-[10.5px] text-muted"><StatusLine status={status} /></span>
			)}
		</button>
	);
}

const SORTERS: Record<Sort, (a: GameSummary, b: GameSummary) => number> = {
	added: (a, b) => b.addedAt.localeCompare(a.addedAt),
	name: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
	played: (a, b) => b.minutesPlayed - a.minutesPlayed,
	size: (a, b) => b.sizeBytes - a.sizeBytes,
};

/*
 * Widths follow Steam's library: nothing scales with the window. Covers keep
 * roughly one size and a wider window fits more of them, in the grid as more
 * columns and in a shelf as more of its one row.
 */
const grid = "grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-[18px] gap-y-[22px]";

/** One row of cards that runs off the right edge and pages sideways, with arrows shown only when it overflows. */
function Shelf({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
	const row = useRef<HTMLDivElement>(null);
	const [back, setBack] = useState(false);
	const [forward, setForward] = useState(false);
	const measure = () => {
		const el = row.current;
		if (!el) return;
		setBack(el.scrollLeft > 1);
		setForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
	};
	// Cards come and go without the row changing size, so this runs after every render as well as on resize.
	useEffect(measure);
	useEffect(() => {
		const observer = new ResizeObserver(measure);
		if (row.current) observer.observe(row.current);
		return () => observer.disconnect();
	}, []);
	const page = (direction: 1 | -1) =>
		row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: "smooth" });
	const arrow = "grid h-7 w-7 place-items-center rounded text-muted hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

	return (
		<section aria-labelledby={id} className="flex flex-col gap-3.5">
			<div className="flex min-h-7 items-center gap-3">
				<Heading id={id}>{title}</Heading>
				{note && <span className="text-[12.5px] text-muted">{note}</span>}
				<div className="flex-1" />
				{(back || forward) && (
					<div className="flex gap-1">
						<button type="button" onClick={() => page(-1)} disabled={!back} aria-label="Scroll back" className={arrow}>
							<BackIcon />
						</button>
						<button type="button" onClick={() => page(1)} disabled={!forward} aria-label="Scroll forward" className={arrow}>
							<BackIcon className="rotate-180" />
						</button>
					</div>
				)}
			</div>
			{/* The row bleeds through the page padding to the window edge; the vertical padding leaves room for the hover lift and shadow. */}
			<div ref={row} onScroll={measure} className="-mx-8 -mb-8 -mt-1 flex gap-4 overflow-x-auto px-8 pb-8 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{children}
			</div>
		</section>
	);
}

export function Home() {
	const games = useApp((s) => s.games);
	const loaded = useApp((s) => s.gamesLoaded);
	const installs = useApp((s) => s.installs);
	const downloads = useApp((s) => s.downloads);
	const running = useApp((s) => s.running);
	const sort = useUi((s) => s.sort);
	const rise = useRise();

	const { recent, fresh, all } = useMemo(() => {
		const here = new Set([...installs.map((i) => i.gameId), ...downloads.map((d) => d.gameId)]);
		// Jump back in: installed games, the running one first, then most recently played.
		const recent = games
			.filter((g) => installs.some((i) => i.gameId === g.id))
			.sort(
				(a, b) =>
					Number(running?.gameId === b.id) - Number(running?.gameId === a.id) ||
					(b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? ""),
			)
			.slice(0, 12);
		const fresh = games.filter((g) => !here.has(g.id)).sort(SORTERS.added).slice(0, 24);
		return { recent, fresh, all: [...games].sort(SORTERS[sort]) };
	}, [games, installs, downloads, running, sort]);

	if (!loaded) {
		return <p className="p-8 text-muted">Loading your library…</p>;
	}
	if (games.length === 0) {
		return (
			<div className="flex max-w-[60ch] flex-col gap-2 p-8">
				<h1 className="stretch-125 text-[28px] font-extrabold uppercase">No games yet</h1>
				<p className="text-muted">Games added to the server show up here.</p>
			</div>
		);
	}

	return (
		<div className={`flex w-full flex-col gap-10 px-8 pb-12 pt-7 ${rise}`}>
			{recent.length > 0 && (
				<Shelf id="h-cont" title="Jump back in">
					<Featured game={recent[0]} />
					{recent.slice(1).map((game) => (
						<RecentCard key={game.id} game={game} />
					))}
				</Shelf>
			)}

			{fresh.length > 0 && (
				<Shelf id="h-new" title="Recently added" note="Not installed on this device yet">
					{fresh.map((game) => (
						<Tile key={game.id} game={game} caption="genres" className="w-[190px] flex-none" />
					))}
				</Shelf>
			)}

			<section aria-labelledby="h-all" className="flex flex-col gap-3.5">
				<div className="flex flex-wrap items-center gap-3">
					<Heading id="h-all">All games · {games.length}</Heading>
					<div className="flex-1" />
					<label className="flex items-center gap-2 text-[12.5px] text-muted">
						Sort
						<select value={sort} onChange={(e) => setUi({ sort: e.target.value as Sort })} className="min-h-8 rounded-md border border-line bg-raised pl-2 pr-7 text-[12.5px] text-ink">
							<option value="added">Recently added</option>
							<option value="name">Name</option>
							<option value="played">Most played</option>
							<option value="size">Size on server</option>
						</select>
					</label>
				</div>
				<div className={grid}>
					{all.map((game) => (
						<Tile key={game.id} game={game} caption="status" />
					))}
				</div>
			</section>
		</div>
	);
}
