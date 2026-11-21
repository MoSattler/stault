const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function formatBytes(bytes: number): string {
	if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
	if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 100 * MB ? 0 : 1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatSpeed(bytesPerSecond: number): string {
	return `${(bytesPerSecond / MB).toFixed(1)} MB/s`;
}

export function formatHours(minutes: number): string {
	if (minutes <= 0) return "Not played";
	if (minutes < 60) return `${minutes} min`;
	return `${(minutes / 60).toFixed(1)} h`;
}

export function formatEta(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	if (seconds < 60) return "under a minute left";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `about ${minutes} min left`;
	return `about ${(minutes / 60).toFixed(1)} h left`;
}

const DAY = 86_400_000;

/** "Today", "Yesterday", "3 days ago", "Last week", then a date. */
export function formatWhen(iso: string | null, now = Date.now()): string {
	if (!iso) return "Never";
	const then = new Date(iso);
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const days = Math.ceil((startOfToday - then.getTime()) / DAY);
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 14) return "Last week";
	return then.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: then.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
	});
}

/** "Today, 09:12" style timestamp for the completed-downloads list. */
export function formatWhenTime(iso: string, now = Date.now()): string {
	const time = new Date(iso).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${formatWhen(iso, now)}, ${time}`;
}
