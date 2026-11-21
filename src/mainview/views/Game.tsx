import { useEffect, useState } from "react";
import { canRun, PLATFORM_NAME, typeLabel } from "../../shared/compat";
import type { GameDetail, GameSummary, GameVersion } from "../../shared/model";
import { api } from "../api";
import { Cover } from "../components/Cover";
import { Heading } from "../components/Heading";
import { BackIcon, BookmarkIcon } from "../components/icons";
import { PrimaryButton } from "../components/PrimaryButton";
import { SavesCard } from "../components/SavesCard";
import { StepList } from "../components/StepList";
import { useRise } from "../components/useRise";
import { formatBytes, formatHours, formatWhen } from "../format";
import { PROGRESS_LABEL, saveLabel, useGameStatus } from "../state/derive";
import { attempt, go, setUi, useApp } from "../state/store";

const card = "rounded-lg border border-line bg-panel px-5 py-[18px]";

function versionKind(v: GameVersion): string {
	const { os, kind } = typeLabel(v.type, v.version);
	return `${os} · ${kind}${v.earlyAccess ? " · early access" : ""}`;
}

/**
 * Loads the full record (description, versions). "unavailable" when the server
 * can't be reached; the page then shows what the list already knows.
 */
function useDetail(game: GameSummary): GameDetail | "unavailable" | null {
	const online = useApp((s) => s.online);
	const [detail, setDetail] = useState<GameDetail | "unavailable" | null>(null);
	// Refetch when the connection comes back.
	useEffect(() => {
		let current = true;
		api.getGame({ gameId: game.id }).then(
			(d) => current && setDetail(d),
			() => current && setDetail((had) => had ?? "unavailable"),
		);
		return () => {
			current = false;
		};
	}, [game.id, online]);
	return detail;
}

export function Game({ game }: { game: GameSummary }) {
	const platform = useApp((s) => s.platform);
	const saves = saveLabel(
		useApp((s) => s.saves.find((x) => x.gameId === game.id)),
		useApp((s) => s.saveSync),
	);
	const loaded = useDetail(game);
	const detail = typeof loaded === "object" ? loaded : null;
	const status = useGameStatus(game, detail?.versions);
	// The list from the server leaves out developers and genres; the detail has them.
	const developers = detail?.developers ?? game.developers;
	const genres = detail?.genres ?? game.genres;
	const pending = loaded === "unavailable" ? "Not available while the server can't be reached." : "Loading…";
	const { install, download } = status;
	const versions = detail?.versions ?? [];

	const heroTag = install
		? `INSTALLED${install.version ? ` · ${install.version}` : ""}`
		: versions.length > 1
			? `${versions.length} VERSIONS ON SERVER`
			: `${game.version ?? "LATEST"} ON SERVER`;
	const facts = [developers.join(", "), game.releaseYear, genres.join(" · ")].filter(Boolean);
	// Long titles get smaller type, so the hero stays within about two lines.
	const titleSize =
		game.title.length <= 16
			? "text-[clamp(32px,4.4vw,56px)]"
			: game.title.length <= 32
				? "text-[clamp(28px,3.4vw,42px)]"
				: "text-[clamp(24px,2.7vw,34px)]";

	const rise = useRise();

	return (
		<div className={`flex flex-col ${rise}`}>
			<div className="relative flex min-h-[clamp(300px,28vh,420px)] flex-col justify-between gap-6 px-8 pb-7 pt-5">
				{/* Art is darkened with a filter, which keeps its contrast; a flat veil turns pale art into grey haze. */}
				<Cover
					title={game.title}
					url={game.backgroundUrl ?? game.coverUrl}
					className="!absolute inset-0 [&>img]:brightness-[.62] [&>img]:contrast-125 [&>img]:saturate-[1.3]"
				/>
				{/* The scrim sits only behind the title and fades into the panel below. */}
				<div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,16,19,0)_40%,rgba(14,16,19,.6)_78%,rgba(14,16,19,.96)_100%),radial-gradient(ellipse_75%_85%_at_0%_100%,rgba(14,16,19,.8)_0%,rgba(14,16,19,0)_70%)]" />
				<button type="button" onClick={() => go({ name: "home" })} className="relative flex min-h-[34px] items-center gap-1.5 self-start rounded-md bg-carbon/55 pl-2 pr-3 text-[13px] font-semibold hover:bg-hover">
					<BackIcon />
					Library
				</button>
				<div className="relative flex flex-col gap-3">
					<div className="flex flex-wrap gap-2">
						<span className="rounded-[3px] bg-ink px-[7px] py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-carbon">
							{heroTag}
						</span>
					</div>
					<h1 className={`stretch-125 max-w-[22em] text-balance font-extrabold uppercase leading-[1.02] tracking-[0.01em] text-white ${titleSize}`}>
						{game.title}
					</h1>
					{facts.length > 0 && <p className="text-sm text-[#D5D9DE]">{facts.join(" · ")}</p>}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-x-8 gap-y-[18px] border-b border-hover bg-panel px-8 py-[18px]">
				<PrimaryButton primary={status.primary} size="hero" />
				<dl className="flex flex-wrap gap-x-8 gap-y-3">
					{[
						["LAST PLAYED", formatWhen(game.lastPlayedAt)],
						["PLAYTIME", game.minutesPlayed ? formatHours(game.minutesPlayed) : "—"],
						["PROGRESS", PROGRESS_LABEL[game.progressState]],
						// Saves only exist for a game that is installed here.
						...(install ? [["SAVES", saves.text, saves.alert ? "text-amber" : ""]] : []),
					].map(([term, value, tone]) => (
						<div key={term} className="flex flex-col gap-0.5">
							<dt className="font-mono text-[10.5px] tracking-[0.12em] text-muted">{term}</dt>
							<dd className={`font-semibold ${tone ?? ""}`}>{value}</dd>
						</div>
					))}
				</dl>
				<button
					type="button"
					onClick={() => attempt(api.setBookmark({ gameId: game.id, on: !game.bookmarked }))}
					aria-pressed={game.bookmarked}
					aria-label="Bookmark"
					className="ml-auto grid h-11 w-11 place-items-center rounded-md border border-line bg-raised hover:bg-hover"
				>
					<BookmarkIcon size={18} filled={game.bookmarked} />
				</button>
			</div>

			{/* As in Steam's library: two columns that share the full width two to one, and a single column on a narrow window. */}
			<div className="grid gap-7 px-8 pb-12 pt-7 @min-[820px]:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
				<div className="flex min-w-0 flex-col gap-6">
					{download && (
						<section aria-label="Install progress" className="flex flex-col gap-3.5 rounded-lg border border-line bg-panel px-5 py-[18px]">
							<div className="flex items-center justify-between gap-3">
								<h2 className="text-[15px] font-bold">
									{download.error ? "Install stopped" : `Installing ${download.title}`}
								</h2>
								<button type="button" onClick={() => go({ name: "downloads" })} className="text-[13px] text-lime hover:text-lime-hi">
									Open downloads
								</button>
							</div>
							{download.error ? (
								<p className="text-[13px] text-amber">{download.error}</p>
							) : (
								<StepList download={download} />
							)}
							<div className="h-1.5 overflow-hidden rounded-[3px] bg-line">
								<div className="h-1.5 bg-lime" style={{ width: `${download.progress * 100}%` }} />
							</div>
						</section>
					)}

					<section aria-labelledby="h-about" className="flex flex-col gap-2.5">
						<Heading id="h-about">About</Heading>
						{detail?.description ? (
							<p className="max-w-[72ch] select-text whitespace-pre-line text-pretty text-base leading-[1.6] text-[#D5D9DE]">
								{detail.description}
							</p>
						) : (
							<p className="max-w-[72ch] text-base leading-[1.6] text-muted">
								{detail ? "The server has no description for this game." : pending}
							</p>
						)}
						<p className="text-[12.5px] text-muted">
							Description, art and tags come from the server's metadata provider.
						</p>
					</section>
				</div>

				<aside className="flex min-w-0 flex-col gap-4">
					<section aria-labelledby="h-det" className={card}>
						<h2 id="h-det" className="mb-3 text-sm font-bold">Details</h2>
						<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] gap-y-[9px] text-[13px]">
							<dt className="text-muted">Developer</dt>
							<dd>{developers.join(", ") || (detail ? "Unknown" : "…")}</dd>
							{detail && detail.publishers.length > 0 && (
								<>
									<dt className="text-muted">Publisher</dt>
									<dd>{detail.publishers.join(", ")}</dd>
								</>
							)}
							<dt className="text-muted">Released</dt>
							<dd>{game.releaseYear ?? "Unknown"}</dd>
							{install && (
								<>
									<dt className="text-muted">Installed in</dt>
									<dd className="select-text break-all font-mono text-xs">{install.path}</dd>
									<dt className="text-muted">Size on disk</dt>
									<dd>{formatBytes(install.sizeBytes)}</dd>
								</>
							)}
						</dl>
					</section>

					{install && <SavesCard game={game} running={status.running} />}

					<section aria-labelledby="h-ver" className={`${card} flex flex-col`}>
						<h2 id="h-ver" className="mb-2.5 text-sm font-bold">Versions</h2>
						{versions.length === 0 && (
							<p className="border-t border-hover py-[9px] text-[12.5px] text-muted">
								{detail ? "No versions listed." : pending}
							</p>
						)}
						{versions.map((v, i) => {
							const current = install?.versionId === v.id;
							const runnable = canRun(platform, v.type, v.version) !== "no";
							return (
								<div key={v.id} className="flex items-center gap-3 border-t border-hover py-[9px]">
									<span className="flex min-w-0 flex-auto flex-col gap-px">
										<span className="font-mono text-[12.5px] font-semibold">
											{v.version ?? "Unversioned"}
											{i === 0 && <span className="font-medium text-muted"> · default</span>}
										</span>
										<span className="text-[12.5px] text-muted">
											{versionKind(v)} · {formatBytes(v.sizeBytes)}
										</span>
									</span>
									{current ? (
										<span className="font-mono text-[10.5px] tracking-[0.1em] text-lime">INSTALLED</span>
									) : !runnable ? (
										<span className="whitespace-nowrap text-xs text-faint">Can't run on {PLATFORM_NAME[platform]}</span>
									) : (
										!download && (
											<button
												type="button"
												onClick={() => setUi({ installing: { gameId: game.id, versionId: v.id } })}
												className="min-h-[30px] rounded-[5px] border border-edge bg-raised px-3 text-xs font-semibold hover:bg-hover"
											>
												{install ? "Switch" : "Install"}
											</button>
										)
									)}
								</div>
							);
						})}
					</section>

					{install && !status.running && (
						<button type="button" onClick={() => setUi({ uninstalling: { gameId: game.id } })} className="min-h-9 self-start rounded-md px-3.5 text-[13px] font-semibold text-[#FF8A7E] hover:bg-hover">
							Uninstall…
						</button>
					)}
				</aside>
			</div>
		</div>
	);
}
