import type { Primary } from "../state/derive";
import { OsIcons, PauseIcon, PlayIcon, SpinnerIcon, StopIcon } from "./icons";

function Glyph({ icon, size }: { icon: Primary["icon"]; size: number }) {
	switch (icon) {
		case "play":
		case "resume":
			return <PlayIcon size={size} className="relative" />;
		case "stop":
			return <StopIcon size={size} className="relative" />;
		case "pause":
			return <PauseIcon size={size} className="relative" />;
		case "busy":
			return <SpinnerIcon size={size} className="relative" />;
		case "install":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="relative">
					<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
				</svg>
			);
		default:
			return null;
	}
}

/** The label, followed by system logos when the state has them ("Available for"). */
function Label({ primary, logo, className = "" }: { primary: Primary; logo: number; className?: string }) {
	return (
		<span className={`relative inline-flex items-center gap-[0.5em] ${className}`}>
			{primary.label}
			{primary.systems && <OsIcons systems={primary.systems} size={logo} />}
		</span>
	);
}

const TONE: Record<Primary["tone"], string> = {
	accent: "bg-lime text-carbon hover:brightness-110",
	neutral: "bg-hover text-ink hover:brightness-110",
	off: "bg-raised text-faint",
};

interface Props {
	primary: Primary;
	/** hero: game page. card: "Jump back in". compact: small tiles and lists. menu: top of a game's right-click menu. */
	size: "hero" | "card" | "compact" | "menu";
}

/** The one button that plays, installs, pauses or stops a game, depending on its state. */
export function PrimaryButton({ primary, size }: Props) {
	const disabled = primary.tone === "off";
	const fill = primary.fill > 0 && (
		<span aria-hidden="true" className="absolute inset-y-0 left-0 bg-lime opacity-30" style={{ width: `${primary.fill}%` }} />
	);

	if (size === "compact") {
		return (
			<button type="button" onClick={primary.act} disabled={disabled} className={`relative min-h-[34px] overflow-hidden rounded-[5px] px-3.5 text-xs font-[750] uppercase tracking-[0.06em] ${TONE[primary.tone]}`}>
				{fill}
				<Label primary={primary} logo={12} />
			</button>
		);
	}

	if (size === "menu") {
		return (
			<button type="button" role="menuitem" onClick={primary.act} disabled={disabled} className={`stretch-112 relative flex min-h-[38px] w-full items-center gap-2.5 overflow-hidden rounded-[5px] px-3 text-[13px] font-[750] uppercase tracking-[0.05em] ${TONE[primary.tone]}`}>
				{fill}
				<Glyph icon={primary.icon} size={14} />
				<Label primary={primary} logo={13} />
			</button>
		);
	}

	if (size === "card") {
		return (
			<button type="button" onClick={primary.act} disabled={disabled} className={`stretch-112 relative flex min-h-[46px] min-w-[168px] items-center gap-2.5 overflow-hidden rounded-md px-[22px] text-[15px] font-[750] uppercase tracking-[0.04em] ${TONE[primary.tone]}`}>
				{fill}
				<Glyph icon={primary.icon} size={16} />
				<Label primary={primary} logo={15} />
				{primary.icon === "stop" && (
					<span className="relative font-mono text-[11px] font-medium normal-case tracking-normal text-muted">{primary.sub}</span>
				)}
			</button>
		);
	}

	return (
		<button type="button" onClick={primary.act} disabled={disabled} className={`relative flex min-h-[54px] min-w-[220px] items-center gap-3 overflow-hidden rounded-md px-6 text-left ${TONE[primary.tone]}`}>
			{fill}
			<Glyph icon={primary.icon} size={20} />
			<span className="relative flex flex-col gap-px">
				<Label primary={primary} logo={18} className="stretch-112 text-base font-[750] uppercase tracking-[0.05em]" />
				{primary.sub && <span className="font-mono text-[11px] opacity-80">{primary.sub}</span>}
			</span>
		</button>
	);
}
