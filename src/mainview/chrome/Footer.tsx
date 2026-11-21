import { PLATFORM_NAME } from "../../shared/compat";
import { DownloadIcon } from "../components/icons";
import { formatSpeed } from "../format";
import { go, useApp } from "../state/store";

export function Footer() {
	const downloads = useApp((s) => s.downloads);
	const platform = useApp((s) => s.platform);
	const deviceName = useApp((s) => s.deviceName);

	const active = downloads.find((d) => !d.paused && !d.error);
	let summary = "No downloads";
	if (active) {
		const pct = Math.floor(active.progress * 100);
		summary =
			active.phase === "download"
				? `Downloading ${active.title} · ${pct}% · ${formatSpeed(active.bytesPerSecond)}`
				: active.phase === "extract"
					? `Extracting ${active.title} · ${pct}%`
					: `Installing ${active.title}`;
		if (downloads.length > 1) summary += ` · ${downloads.length - 1} queued`;
	} else if (downloads.length) {
		summary = `${downloads.length} paused`;
	}

	return (
		<footer className="flex min-h-[34px] flex-none items-center gap-x-4 border-t border-hover bg-carbon px-2.5 font-mono text-[11.5px] text-muted">
			<button type="button" onClick={() => go({ name: "downloads" })} className="flex min-h-[30px] items-center gap-2 rounded px-2 hover:bg-hover">
				<DownloadIcon size={14} />
				{summary}
			</button>
			<div className="flex-1" />
			<span className="px-2">
				{PLATFORM_NAME[platform]} · {deviceName}
			</span>
		</footer>
	);
}
