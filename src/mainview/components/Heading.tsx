import type { ReactNode } from "react";

/** Small mono section label: "JUMP BACK IN". */
export function Heading({ id, children }: { id?: string; children: ReactNode }) {
	return (
		<h2 id={id} className="font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted">
			{children}
		</h2>
	);
}
