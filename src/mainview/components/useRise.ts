import { useState } from "react";

/**
 * The class for the short fade-in that views and dialogs open with.
 * A hidden window (covered, minimised, other Space) freezes CSS animations at
 * their first frame, which for a fade-in is invisible content, so anything
 * that opens while hidden simply appears.
 */
export function useRise(): string {
	const [rise] = useState(() => (document.hidden ? "" : "animate-rise"));
	return rise;
}
