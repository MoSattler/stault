import { api } from "../api";
import { useApp } from "../state/store";

const glyph = { stroke: "currentColor", fill: "none" } as const;

/** Minimize / maximize / close for Windows and Linux. macOS keeps its native traffic lights. */
export function WindowControls() {
	const platform = useApp((s) => s.platform);
	if (platform === "macos") return null;

	if (platform === "windows") {
		const button = "no-drag grid w-[46px] place-items-center text-muted hover:bg-hover";
		return (
			<div className="flex self-stretch">
				<button type="button" aria-label="Minimize" className={button} onClick={() => api.windowMinimize({})}>
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10" {...glyph} /></svg>
				</button>
				<button type="button" aria-label="Maximize" className={button} onClick={() => api.windowToggleMaximize({})}>
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" {...glyph} /></svg>
				</button>
				<button type="button" aria-label="Close" className={`${button} hover:bg-[#c42b1c] hover:text-white`} onClick={() => api.windowClose({})}>
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" {...glyph} /></svg>
				</button>
			</div>
		);
	}

	const button = "no-drag grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-hover";
	return (
		<div className="flex items-center gap-1.5 pr-2.5">
			<button type="button" aria-label="Minimize" className={button} onClick={() => api.windowMinimize({})}>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" strokeWidth="1.4" {...glyph} /></svg>
			</button>
			<button type="button" aria-label="Maximize" className={button} onClick={() => api.windowToggleMaximize({})}>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5L6 4l3.5 3.5" strokeWidth="1.4" {...glyph} /></svg>
			</button>
			<button type="button" aria-label="Close" className={`${button} bg-line text-ink`} onClick={() => api.windowClose({})}>
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" strokeWidth="1.4" {...glyph} /></svg>
			</button>
		</div>
	);
}
