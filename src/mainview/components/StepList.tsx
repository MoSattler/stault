import type { Download } from "../../shared/model";
import { PHASES } from "../state/derive";

/** Download → Extract → Run setup → Ready, with the current step highlighted. */
export function StepList({ download }: { download: Download }) {
	const steps = PHASES.filter((p) => p.key !== "setup" || download.type === "WINDOWS_SETUP");
	const at = steps.findIndex((p) => p.key === download.phase);
	return (
		<ol className="flex flex-wrap gap-x-[26px] gap-y-2.5">
			{steps.map((step, i) => (
				<li key={step.key} className={`flex items-center gap-2 text-[13px] ${i <= at ? "text-ink" : "text-faint"}`}>
					<span aria-hidden="true" className={`block h-[9px] w-[9px] rounded-full ${i < at ? "bg-lime" : i === at ? "bg-ink" : "bg-edge"}`} />
					{step.label}
				</li>
			))}
		</ol>
	);
}
