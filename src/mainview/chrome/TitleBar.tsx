import { GearIcon, Logo } from "../components/icons";
import { serverHost } from "../state/derive";
import { go, useApp, useUi } from "../state/store";
import { WindowControls } from "./WindowControls";

const tab =
	"stretch-112 no-drag flex min-h-[46px] items-center gap-2 px-3.5 text-[12.5px] font-[650] uppercase tracking-[0.08em] hover:bg-hover";

export function TitleBar() {
	const platform = useApp((s) => s.platform);
	const session = useApp((s) => s.session);
	const online = useApp((s) => s.online);
	const downloads = useApp((s) => s.downloads.length);
	const view = useUi((s) => s.view.name);
	const onLibrary = view === "home" || view === "game";
	const host = session ? serverHost(session.serverUrl) : "";

	return (
		<header
			// On macOS the native traffic lights sit over the left edge.
			className={`drag flex min-h-[46px] flex-none items-center gap-x-[18px] border-b border-hover bg-carbon ${platform === "macos" ? "pl-[84px]" : "pl-4"}`}
		>
			<div className="flex items-center gap-2.5">
				<Logo size={22} className="text-lime" />
				<span className="stretch-125 text-[13px] font-extrabold tracking-[0.16em]">STAULT</span>
			</div>

			<nav aria-label="Sections" className="flex items-stretch gap-0.5 self-stretch">
				<button
					type="button"
					onClick={() => go({ name: "home" })}
					aria-pressed={onLibrary}
					className={`${tab} ${onLibrary ? "text-ink shadow-[inset_0_-2px_0_var(--color-lime)]" : "text-muted"}`}
				>
					Library
				</button>
				<button
					type="button"
					onClick={() => go({ name: "downloads" })}
					aria-pressed={view === "downloads"}
					className={`${tab} ${view === "downloads" ? "text-ink shadow-[inset_0_-2px_0_var(--color-lime)]" : "text-muted"}`}
				>
					Downloads
					{downloads > 0 && (
						<span className="rounded-[3px] bg-lime px-[5px] font-mono text-[11px] font-semibold tracking-normal text-carbon">
							{downloads}
						</span>
					)}
				</button>
			</nav>

			<div className="flex-1" />

			<div className="flex items-center gap-1.5 pr-2">
				<button
					type="button"
					onClick={() => go({ name: "settings" })}
					aria-label={`Server ${host}, ${online ? "connected" : "not reachable"}`}
					className="no-drag flex min-h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 font-mono text-[11.5px] text-muted hover:bg-hover"
				>
					<span aria-hidden="true" className={`block h-[7px] w-[7px] rounded-full ${online ? "bg-lime" : "bg-amber"}`} />
					<span>{online ? host : `${host} · offline`}</span>
				</button>
				<button
					type="button"
					onClick={() => go({ name: "settings" })}
					aria-label="Settings"
					aria-pressed={view === "settings"}
					className={`no-drag grid h-9 w-9 place-items-center rounded-md hover:bg-hover ${view === "settings" ? "text-ink" : "text-muted"}`}
				>
					<GearIcon size={18} />
				</button>
				<span
					title={session?.username}
					className="grid h-7 w-7 place-items-center rounded-md bg-line text-xs font-bold uppercase"
				>
					{session?.username.slice(0, 1)}
				</span>
			</div>

			<WindowControls />
		</header>
	);
}
