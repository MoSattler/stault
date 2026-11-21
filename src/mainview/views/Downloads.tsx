import type { Download, GameSummary } from "../../shared/model";
import { api } from "../api";
import { Cover } from "../components/Cover";
import { Heading } from "../components/Heading";
import { ArrowUpIcon, CloseIcon } from "../components/icons";
import { PrimaryButton } from "../components/PrimaryButton";
import { StepList } from "../components/StepList";
import { useRise } from "../components/useRise";
import { formatBytes, formatEta, formatSpeed, formatWhenTime } from "../format";
import { useGameStatus } from "../state/derive";
import { attempt, go, useApp } from "../state/store";

export const SPEED_LIMITS = [
	{ kib: 0, label: "Unlimited" },
	{ kib: 51_200, label: "50 MB/s" },
	{ kib: 20_480, label: "20 MB/s" },
	{ kib: 5_120, label: "5 MB/s" },
];

export function SpeedLimitSelect({ id }: { id?: string }) {
	const limit = useApp((s) => s.speedLimitKib);
	return (
		<select
			id={id}
			value={limit}
			onChange={(e) => attempt(api.setSpeedLimit({ kib: Number(e.target.value) }))}
			className="min-h-9 rounded-md border border-line bg-raised px-2 text-[13px] text-ink"
		>
			{SPEED_LIMITS.map((o) => (
				<option key={o.kib} value={o.kib}>
					{o.label}
				</option>
			))}
		</select>
	);
}

const PHASE_TITLE = { download: "Downloading", extract: "Extracting", setup: "Running setup" };
const iconButton = "grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-hover";
const row = "flex items-center gap-3.5 rounded-lg bg-panel px-3 py-2.5";

function Current({ download, game }: { download: Download; game?: GameSummary }) {
	const pct = Math.floor(download.progress * 100);
	const remaining = download.totalBytes - download.receivedBytes;
	const gameId = download.gameId;
	return (
		<section aria-label="Current download" className="flex flex-wrap gap-6 rounded-[10px] border border-line bg-panel p-[22px]">
			<Cover title={download.title} url={game?.coverUrl ?? null} labelled className="aspect-[5/7] w-32 flex-none rounded" />
			<div className="flex min-w-0 flex-[1_1_360px] flex-col justify-center gap-3.5">
				<span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${download.error ? "text-amber" : "text-lime"}`}>
					{download.error ? "Stopped" : download.paused ? "Paused" : PHASE_TITLE[download.phase]}
				</span>
				<div className="flex flex-wrap items-baseline justify-between gap-4">
					<h2 className="stretch-125 text-[26px] font-extrabold uppercase leading-none">{download.title}</h2>
					<span className="font-mono text-[28px] font-semibold">{pct}%</span>
				</div>
				<div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded bg-line">
					<div className="h-2 bg-lime transition-[width] duration-500 ease-linear" style={{ width: `${download.progress * 100}%` }} />
				</div>
				{download.error ? (
					<p className="text-[13px] text-amber">{download.error}</p>
				) : (
					<>
						<div className="flex flex-wrap gap-x-7 gap-y-2 font-mono text-xs text-muted">
							<span>
								{formatBytes(download.receivedBytes)} of {formatBytes(download.totalBytes)}
							</span>
							{download.phase === "download" && !download.paused && (
								<>
									<span>{formatSpeed(download.bytesPerSecond)}</span>
									<span>{formatEta(remaining / download.bytesPerSecond)}</span>
								</>
							)}
						</div>
						<StepList download={download} />
					</>
				)}
				<div className="flex flex-wrap gap-2.5">
					{(download.phase === "download" || download.error) && (
						<button
							type="button"
							onClick={() => attempt(api.setDownloadPaused({ gameId, paused: download.error ? false : !download.paused }))}
							className="min-h-[38px] rounded-md border border-edge bg-raised px-4 text-[13px] font-semibold hover:bg-hover"
						>
							{download.error ? "Try again" : download.paused ? "Resume" : "Pause"}
						</button>
					)}
					{download.phase === "download" && (
						<button type="button" onClick={() => attempt(api.removeDownload({ gameId }))} className="min-h-[38px] rounded-md px-4 text-[13px] font-semibold text-muted hover:bg-hover">
							Cancel
						</button>
					)}
					<button type="button" onClick={() => go({ name: "game", gameId })} className="min-h-[38px] rounded-md px-4 text-[13px] font-semibold text-muted hover:bg-hover">
						View game
					</button>
				</div>
			</div>
		</section>
	);
}

function Completed({ game, at, sizeBytes }: { game: GameSummary; at: string; sizeBytes: number }) {
	const status = useGameStatus(game);
	return (
		<li className={row}>
			<Cover title={game.title} url={game.coverUrl} className="h-[42px] w-[30px] rounded-[3px]" />
			<span className="flex min-w-0 flex-auto flex-col">
				<button type="button" onClick={() => go({ name: "game", gameId: game.id })} className="self-start font-semibold">
					{game.title}
				</button>
				<span className="font-mono text-[11px] text-muted">
					Installed · {formatWhenTime(at)} · {formatBytes(sizeBytes)}
				</span>
			</span>
			<PrimaryButton primary={status.primary} size="compact" />
		</li>
	);
}

export function Downloads() {
	const downloads = useApp((s) => s.downloads);
	const completed = useApp((s) => s.completed);
	const games = useApp((s) => s.games);
	const byId = new Map(games.map((g) => [g.id, g]));
	const [current, ...queue] = downloads;
	const allPaused = downloads.length > 0 && downloads.every((d) => d.paused);
	const rise = useRise();

	return (
		<div className={`flex w-full max-w-[1100px] flex-col gap-7 px-8 pb-12 pt-7 ${rise}`}>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
				<h1 className="stretch-125 text-[28px] font-extrabold uppercase tracking-[0.02em]">Downloads</h1>
				<div className="flex-1" />
				<label className="flex items-center gap-2 text-[13px] text-muted">
					Bandwidth
					<SpeedLimitSelect />
				</label>
				<button
					type="button"
					disabled={downloads.length === 0}
					onClick={() => attempt(api.setAllDownloadsPaused({ paused: !allPaused }))}
					className="min-h-9 rounded-md border border-edge bg-raised px-4 text-[13px] font-semibold hover:bg-hover disabled:opacity-50"
				>
					{allPaused ? "Resume all" : "Pause all"}
				</button>
			</div>

			{current ? (
				<Current download={current} game={byId.get(current.gameId)} />
			) : (
				<section className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-dashed border-edge p-7">
					<p className="text-[15px] text-muted">Nothing downloading. Installs from your library show up here.</p>
					<button type="button" onClick={() => go({ name: "home" })} className="min-h-10 rounded-md bg-lime px-[18px] text-[13px] font-bold text-carbon hover:brightness-110">
						Browse library
					</button>
				</section>
			)}

			{queue.length > 0 && (
				<section aria-labelledby="h-q" className="flex flex-col gap-2.5">
					<Heading id="h-q">Up next</Heading>
					<ul className="flex flex-col gap-1.5">
						{queue.map((d) => (
							<li key={d.gameId} className={row}>
								<Cover title={d.title} url={byId.get(d.gameId)?.coverUrl ?? null} className="h-[42px] w-[30px] rounded-[3px]" />
								<span className="flex min-w-0 flex-auto flex-col">
									<span className="font-semibold">{d.title}</span>
									<span className="font-mono text-[11px] text-muted">
										{d.error ? "Stopped" : d.paused ? "Paused" : "Queued"} · {Math.floor(d.progress * 100)}% · {formatBytes(d.totalBytes)}
									</span>
								</span>
								<button type="button" aria-label="Move up" onClick={() => attempt(api.moveDownloadUp({ gameId: d.gameId }))} className={iconButton}>
									<ArrowUpIcon />
								</button>
								<button type="button" aria-label="Remove from queue" onClick={() => attempt(api.removeDownload({ gameId: d.gameId }))} className={iconButton}>
									<CloseIcon />
								</button>
							</li>
						))}
					</ul>
				</section>
			)}

			{completed.length > 0 && (
				<section aria-labelledby="h-done" className="flex flex-col gap-2.5">
					<Heading id="h-done">Completed</Heading>
					<ul className="flex flex-col gap-1.5">
						{completed.map((c) => {
							const game = byId.get(c.gameId);
							return game ? <Completed key={`${c.gameId}-${c.at}`} game={game} at={c.at} sizeBytes={c.sizeBytes} /> : null;
						})}
					</ul>
				</section>
			)}
		</div>
	);
}
