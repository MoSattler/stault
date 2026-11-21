import { useEffect, useState } from "react";
import { canRun, PLATFORM_NAME, typeLabel } from "../../shared/compat";
import type { GameDetail, GameSummary, GameVersion } from "../../shared/model";
import { api } from "../api";
import { Cover } from "../components/Cover";
import { Dialog, dialogButton } from "../components/Dialog";
import { Heading } from "../components/Heading";
import { BackIcon, BookmarkIcon } from "../components/icons";
import { PrimaryButton } from "../components/PrimaryButton";
import { StepList } from "../components/StepList";
import { formatBytes, formatHours, formatWhen } from "../format";
import { PROGRESS_LABEL, serverHost, useGameStatus } from "../state/derive";
import { attempt, go, setUi, showToast, useApp } from "../state/store";

const card = "rounded-lg border border-line bg-panel px-5 py-[18px]";

function versionKind(v: GameVersion): string {
	const { os, kind } = typeLabel(v.type);
	return `${os} · ${kind}${v.earlyAccess ? " · early access" : ""}`;
}

/** Loads the full record (description, versions). Refetches when the library changes. */
function useDetail(game: GameSummary): GameDetail | null {
	const [detail, setDetail] = useState<GameDetail | null>(null);
	useEffect(() => {
		let current = true;
		setDetail(null);
		api.getGame({ gameId: game.id }).then(
			(d) => current && setDetail(d),
			() => {}, // Offline: the page still shows what the list knows.
		);
		return () => {
			current = false;
		};
	}, [game.id]);
	return detail;
}

export function Game({ game }: { game: GameSummary }) {
	const platform = useApp((s) => s.platform);
	const session = useApp((s) => s.session);
	const status = useGameStatus(game);
	const detail = useDetail(game);
	const { install, download } = status;
	const host = session ? serverHost(session.serverUrl) : "the server";
	const versions = detail?.versions ?? [];

	const heroTag = install
		? `INSTALLED${install.version ? ` · ${install.version}` : ""}`
		: versions.length > 1
			? `${versions.length} VERSIONS ON SERVER`
			: `${game.version ?? "LATEST"} ON SERVER`;
	const facts = [game.developers.join(", "), game.releaseYear, game.genres.join(" · ")].filter(Boolean);

	const [confirming, setConfirming] = useState(false);

	async function uninstall() {
		setConfirming(false);
		if ((await attempt(api.uninstall({ gameId: game.id }).then(() => true))) === true) {
			showToast(`${game.title} uninstalled`, "It stays on the server");
		}
	}

	return (
		<div className="flex animate-rise flex-col">
			<div className="relative flex min-h-[340px] flex-col justify-between gap-6 px-8 pb-7 pt-5">
				<Cover title={game.title} url={game.backgroundUrl ?? game.coverUrl} className="!absolute inset-0" />
				<div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,16,19,.15)_0%,rgba(14,16,19,.35)_45%,rgba(14,16,19,.96)_100%),linear-gradient(90deg,rgba(14,16,19,.7)_0%,rgba(14,16,19,0)_65%)]" />
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
					<h1 className="stretch-125 text-balance text-[clamp(34px,5vw,60px)] font-extrabold uppercase leading-[0.98] tracking-[0.01em] text-white">
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
					].map(([term, value]) => (
						<div key={term} className="flex flex-col gap-0.5">
							<dt className="font-mono text-[10.5px] tracking-[0.12em] text-muted">{term}</dt>
							<dd className="font-semibold">{value}</dd>
						</div>
					))}
				</dl>
				<div className="flex-1" />
				<button
					type="button"
					onClick={() => attempt(api.setBookmark({ gameId: game.id, on: !game.bookmarked }))}
					aria-pressed={game.bookmarked}
					aria-label="Bookmark"
					className="grid h-11 w-11 place-items-center rounded-md border border-line bg-raised hover:bg-hover"
				>
					<BookmarkIcon size={18} filled={game.bookmarked} />
				</button>
			</div>

			<div className="flex max-w-[1320px] flex-wrap gap-7 px-8 pb-12 pt-7">
				<div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
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
							<p className="max-w-[62ch] select-text whitespace-pre-line text-pretty text-base leading-[1.6] text-[#D5D9DE]">
								{detail.description}
							</p>
						) : (
							<p className="max-w-[62ch] text-base leading-[1.6] text-muted">
								{detail ? "The server has no description for this game." : "Loading…"}
							</p>
						)}
						<p className="text-[12.5px] text-muted">
							Description, art and tags come from the server's metadata provider.
						</p>
					</section>
				</div>

				<aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
					<section aria-labelledby="h-det" className={card}>
						<h2 id="h-det" className="mb-3 text-sm font-bold">Details</h2>
						<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[18px] gap-y-[9px] text-[13px]">
							<dt className="text-muted">Developer</dt>
							<dd>{game.developers.join(", ") || "Unknown"}</dd>
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

					<section aria-labelledby="h-ver" className={`${card} flex flex-col`}>
						<h2 id="h-ver" className="mb-2.5 text-sm font-bold">Versions on {host}</h2>
						{versions.length === 0 && (
							<p className="border-t border-hover py-[9px] text-[12.5px] text-muted">
								{detail ? "No versions listed." : "Loading…"}
							</p>
						)}
						{versions.map((v, i) => {
							const current = install?.versionId === v.id;
							const runnable = canRun(platform, v.type) !== "no";
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
						<button type="button" onClick={() => setConfirming(true)} className="min-h-9 self-start rounded-md px-3.5 text-[13px] font-semibold text-[#FF8A7E] hover:bg-hover">
							Uninstall…
						</button>
					)}
				</aside>
			</div>

			{confirming && (
				<Dialog labelledBy="d-uninstall" onClose={() => setConfirming(false)} className="max-w-[440px]">
					<div className="flex flex-col gap-2 p-5">
						<h2 id="d-uninstall" className="stretch-125 text-xl font-extrabold uppercase leading-none">
							Uninstall {game.title}?
						</h2>
						<p className="text-[13px] text-muted">
							Its files are deleted from this device. The game stays on the server, and your playtime is kept.
						</p>
					</div>
					<div className="flex justify-end gap-2.5 border-t border-line px-5 py-4">
						<button type="button" onClick={() => setConfirming(false)} className={dialogButton}>Cancel</button>
						<button type="button" onClick={uninstall} className="min-h-[42px] rounded-md bg-[#FF8A7E] px-[22px] font-[750] uppercase tracking-[0.04em] text-carbon hover:brightness-110">
							Uninstall
						</button>
					</div>
				</Dialog>
			)}
		</div>
	);
}
