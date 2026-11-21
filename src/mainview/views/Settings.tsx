import { type ReactNode, useState } from "react";
import { PLATFORM_NAME } from "../../shared/compat";
import { api } from "../api";
import { CloseIcon, FolderIcon } from "../components/icons";
import { formatBytes } from "../format";
import { useRise } from "../components/useRise";
import { serverHost } from "../state/derive";
import { attempt, useApp } from "../state/store";
import { SpeedLimitSelect } from "./Downloads";

const TABS = [
	["library", "Library folders"],
	["downloads", "Downloads"],
	["saves", "Saves"],
	["account", "Account"],
] as const;
type Tab = (typeof TABS)[number][0];

const button = "min-h-9 rounded-md border border-edge bg-raised px-3.5 text-[13px] font-semibold hover:bg-hover";

function Row({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-5 border-b border-hover py-3.5">
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="font-semibold">{title}</span>
				{help && <span className="text-[12.5px] text-muted">{help}</span>}
			</span>
			{children}
		</div>
	);
}

function LibraryFolders() {
	const folders = useApp((s) => s.folders);
	const installs = useApp((s) => s.installs);
	const platform = useApp((s) => s.platform);
	return (
		<>
			<p className="mb-3 text-muted">Where installed games live on this {PLATFORM_NAME[platform]} device.</p>
			{folders.map((folder) => {
				const inUse = installs.some((i) => i.path.startsWith(folder.path));
				return (
					<div key={folder.path} className="flex items-center gap-3 border-b border-hover py-3.5">
						<FolderIcon size={18} className="flex-none text-muted" />
						<span className="min-w-0 flex-auto select-text break-all font-mono text-[12.5px]">{folder.path}</span>
						<span className="whitespace-nowrap text-[12.5px] text-muted">
							{folder.freeBytes === null ? "Not available" : `${formatBytes(folder.freeBytes)} free`}
						</span>
						{folders.length > 1 && !inUse && (
							<button
								type="button"
								aria-label={`Remove ${folder.path}`}
								onClick={() => attempt(api.removeLibraryFolder({ path: folder.path }))}
								className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted hover:bg-hover"
							>
								<CloseIcon size={14} />
							</button>
						)}
					</div>
				);
			})}
			<button type="button" onClick={() => attempt(api.addLibraryFolder({}))} className={`${button} mt-3.5 self-start`}>
				Add folder…
			</button>
		</>
	);
}

function Saves() {
	const { enabled, serverOff } = useApp((s) => s.saveSync);
	const session = useApp((s) => s.session);
	const host = session ? serverHost(session.serverUrl) : "the server";
	return (
		<>
			<Row
				title="Sync game saves"
				help={`Fetches a newer save from ${host} before a game starts, and uploads yours after you quit.`}
			>
				<button
					type="button"
					role="switch"
					aria-checked={enabled}
					aria-label="Sync game saves"
					onClick={() => attempt(api.setSaveSync({ on: !enabled }))}
					className={`${button} min-w-16 ${enabled ? "border-lime text-lime" : "text-muted"}`}
				>
					{enabled ? "On" : "Off"}
				</button>
			</Row>
			{serverOff && (
				<p className="pt-3.5 text-[13px] text-amber">
					Save files are switched off on {host}. Whoever runs it can turn them on with{" "}
					<span className="select-text font-mono text-xs">SAVEFILES_ENABLED=true</span>.
				</p>
			)}
			<p className="pt-3.5 text-[12.5px] text-muted">
				Save locations come from Ludusavi, so only games it knows are synced. A save made by a Mac build can't be
				used by a Windows or Linux build of the same game, or the other way round.
			</p>
		</>
	);
}

function Account() {
	const session = useApp((s) => s.session);
	const online = useApp((s) => s.online);
	const deviceName = useApp((s) => s.deviceName);
	const [name, setName] = useState(deviceName);
	if (!session) return null;
	return (
		<>
			<Row title="Server" help={`GameVault ${session.serverVersion} · ${online ? "connected" : "not reachable"}`}>
				<span className="select-text font-mono text-[12.5px] text-muted">{serverHost(session.serverUrl)}</span>
			</Row>
			<Row title="Signed in as">
				<span className="font-mono text-[12.5px] text-muted">{session.username}</span>
			</Row>
			<Row title="Device name" help="Shown in Stault, so you can tell your devices apart.">
				<input
					aria-label="Device name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => name.trim() && name !== deviceName && attempt(api.setDeviceName({ name }))}
					className="min-h-9 w-56 rounded-md border border-line bg-raised px-2.5 text-[13px]"
				/>
			</Row>
			<button type="button" onClick={() => attempt(api.signOut({}))} className={`${button} mt-3.5 self-start`}>
				Sign out
			</button>
		</>
	);
}

export function Settings() {
	const [tab, setTab] = useState<Tab>("library");
	const rise = useRise();
	return (
		<div className={`flex w-full max-w-[1100px] flex-col gap-6 px-8 pb-12 pt-7 ${rise}`}>
			<h1 className="stretch-125 text-[28px] font-extrabold uppercase tracking-[0.02em]">Settings</h1>
			<div className="flex flex-wrap items-start gap-7">
				<nav aria-label="Settings sections" className="flex flex-[1_1_200px] flex-col gap-0.5">
					{TABS.map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							aria-pressed={tab === key}
							className={`min-h-[38px] rounded-md px-3 text-left text-[13.5px] font-semibold hover:bg-hover ${tab === key ? "bg-hover text-ink shadow-[inset_2px_0_0_var(--color-lime)]" : "text-muted"}`}
						>
							{label}
						</button>
					))}
				</nav>
				<div className="flex min-w-0 flex-[999_1_480px] flex-col">
					{tab === "library" && <LibraryFolders />}
					{tab === "downloads" && (
						<Row title="Bandwidth limit" help="Applies to all downloads.">
							<SpeedLimitSelect />
						</Row>
					)}
					{tab === "saves" && <Saves />}
					{tab === "account" && <Account />}
				</div>
			</div>
		</div>
	);
}
