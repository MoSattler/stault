import type { GameStatus } from "../state/derive";
import { OsIcons } from "./icons";

/** A game's one-line status. A game with no build for this OS names the systems it is for, as logos. */
export function StatusLine({ status }: { status: GameStatus }) {
	const { systems } = status.primary;
	if (!systems) return status.line;
	return (
		<span className="inline-flex items-center gap-[5px] align-top">
			Available for
			<OsIcons systems={systems} size={11} />
		</span>
	);
}
