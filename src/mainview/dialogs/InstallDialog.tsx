import { useEffect, useState } from "react";
import { canRun, PLATFORM_NAME, runnableFirst, typeLabel } from "../../shared/compat";
import type { GameDetail, GameSummary } from "../../shared/model";
import { api } from "../api";
import { Cover } from "../components/Cover";
import { Dialog, dialogButton, dialogPrimary } from "../components/Dialog";
import { formatBytes } from "../format";
import { attempt, setUi, useApp } from "../state/store";

function Radio({ on }: { on: boolean }) {
	return (
		<span aria-hidden="true" className={`grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${on ? "border-lime" : "border-edge"}`}>
			<span className={`block h-1.5 w-1.5 rounded-full ${on ? "bg-lime" : "bg-transparent"}`} />
		</span>
	);
}

const option = (on: boolean) =>
	`flex items-center gap-3 rounded-lg border bg-panel px-3.5 text-left disabled:opacity-45 ${on ? "border-lime" : "border-edge"}`;

interface Props {
	game: GameSummary;
	/** Version to preselect, when the dialog was opened from the version list. */
	versionId?: number;
}

export function InstallDialog({ game, versionId }: Props) {
	const platform = useApp((s) => s.platform);
	const folders = useApp((s) => s.folders);
	const installed = useApp((s) => s.installs.some((i) => i.gameId === game.id));
	const busy = useApp((s) => s.downloads.some((d) => !d.paused));
	const [detail, setDetail] = useState<GameDetail | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const [picked, setPicked] = useState<number | undefined>(versionId);
	const [folder, setFolder] = useState(folders[0]?.path ?? "");
	const [sending, setSending] = useState(false);

	useEffect(() => {
		api.getGame({ gameId: game.id }).then(
			(d) => {
				setDetail(d);
				// Default to the first version this OS can run.
				setPicked(
					(current) =>
						current ??
						// Prefer a build known to run here over one nobody can vouch for.
						(d.versions.find((v) => canRun(platform, v.type, v.version) === "yes") ??
							d.versions.find((v) => canRun(platform, v.type, v.version) === "maybe"))?.id,
				);
			},
			(e) => setFailed(e instanceof Error ? e.message : String(e)),
		);
	}, [game.id, platform]);

	const close = () => setUi({ installing: null });
	const version = detail?.versions.find((v) => v.id === picked);
	const free = folders.find((f) => f.path === folder)?.freeBytes ?? null;
	// The archive and the extracted files sit side by side until the archive is deleted.
	const needed = version ? version.sizeBytes * 2 : 0;
	const tight = free !== null && version !== undefined && free < needed;

	async function confirm() {
		if (!version) return;
		setSending(true);
		await attempt(api.install({ gameId: game.id, versionId: version.id, folder }));
		close();
	}

	return (
		<Dialog labelledBy="d-inst" onClose={close}>
			<div className="flex items-center gap-4 border-b border-line bg-panel p-5">
				<Cover title={game.title} url={game.coverUrl} className="h-[73px] w-[52px] flex-none rounded" />
				<div className="flex flex-col gap-1">
					<span className="font-mono text-[11px] tracking-[0.14em] text-lime">
						{installed ? "SWITCH VERSION" : "INSTALL"}
					</span>
					<h2 id="d-inst" className="stretch-125 text-[22px] font-extrabold uppercase leading-none">{game.title}</h2>
					<span className="font-mono text-[11.5px] text-muted">
						{version ? `${version.version ?? "Unversioned"} · ${typeLabel(version.type, version.version).os} · ${typeLabel(version.type, version.version).kind}` : " "}
					</span>
				</div>
			</div>

			<div className="flex flex-col gap-[18px] p-5">
				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2 font-[650]">Version</legend>
					{failed && <p className="text-[13px] text-amber">{failed}</p>}
					{!detail && !failed && <p className="text-[13px] text-muted">Loading versions…</p>}
					{detail && runnableFirst(platform, detail.versions).map((v) => {
						const fit = canRun(platform, v.type, v.version);
						const runnable = fit !== "no";
						const { os, kind } = typeLabel(v.type, v.version);
						return (
							<button key={v.id} type="button" onClick={() => setPicked(v.id)} aria-pressed={picked === v.id} disabled={!runnable} className={`${option(picked === v.id)} min-h-[52px] py-2`}>
								<Radio on={picked === v.id} />
								<span className="flex min-w-0 flex-auto flex-col gap-px">
									<span className="font-[650]">
										{v.version ?? "Unversioned"}
										{v.id === detail.versions[0].id && " · default"}
										{v.earlyAccess && " · early access"}
									</span>
									<span className="text-[12.5px] text-muted">
										{os} · {kind}
										{fit === "maybe" && " · Stault checks after extracting whether it can run here"}
									</span>
								</span>
								<span className="whitespace-nowrap font-mono text-xs text-muted">
									{runnable ? formatBytes(v.sizeBytes) : `Can't run on ${PLATFORM_NAME[platform]}`}
								</span>
							</button>
						);
					})}
				</fieldset>

				<fieldset className="flex flex-col gap-2">
					<legend className="mb-2 font-[650]">Install location</legend>
					{folders.map((f) => (
						<button key={f.path} type="button" onClick={() => setFolder(f.path)} aria-pressed={folder === f.path} className={`${option(folder === f.path)} min-h-12`}>
							<Radio on={folder === f.path} />
							<span className="min-w-0 flex-auto break-all font-mono text-[12.5px]">{f.path}</span>
							<span className="whitespace-nowrap text-xs text-muted">
								{f.freeBytes === null ? "Not available" : `${formatBytes(f.freeBytes)} free`}
							</span>
						</button>
					))}
				</fieldset>

				{version && (
					<div className={`flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs ${tight ? "text-amber" : "text-muted"}`}>
						<span>Download {formatBytes(version.sizeBytes)}</span>
						<span>
							Needs ≈ {formatBytes(needed)} while installing{tight && " · this folder is short on space"}
						</span>
					</div>
				)}

				{version?.type === "WINDOWS_SETUP" && (
					<p className="rounded-lg bg-panel px-3.5 py-3 text-[13px] text-soft">
						This build ships an installer. After extracting, Stault runs it and waits for it to finish before marking the game ready.
					</p>
				)}
			</div>

			<div className="flex justify-end gap-2.5 border-t border-line px-5 py-4">
				<button type="button" onClick={close} className={dialogButton}>Cancel</button>
				<button type="button" onClick={confirm} disabled={!version || !folder || sending} className={dialogPrimary}>
					{installed ? "Switch version" : busy ? "Add to queue" : "Install"}
				</button>
			</div>
		</Dialog>
	);
}
