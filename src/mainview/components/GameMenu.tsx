import { type KeyboardEvent, type MouseEvent, useLayoutEffect, useRef } from "react";
import type { GameSummary } from "../../shared/model";
import { api } from "../api";
import { useGameStatus } from "../state/derive";
import { attempt, setUi, useApp, useUi } from "../state/store";
import { PrimaryButton } from "./PrimaryButton";

/** `onContextMenu` for anything that stands for a game: opens its menu at the pointer. */
export const gameMenu = (gameId: number) => (event: MouseEvent) => {
	event.preventDefault();
	setUi({ menu: { gameId, x: event.clientX, y: event.clientY } });
};

const close = () => setUi({ menu: null });
const item = "flex min-h-[34px] w-full items-center rounded-[5px] px-2.5 text-left text-[13px] font-semibold hover:bg-hover focus-visible:bg-hover focus-visible:outline-none";
const EDGE = 8;

function Menu({ game, x, y }: { game: GameSummary; x: number; y: number }) {
	const status = useGameStatus(game);
	const ref = useRef<HTMLDivElement>(null);

	// Keep the menu inside the window, and take focus so the keyboard works at once.
	useLayoutEffect(() => {
		const menu = ref.current;
		if (!menu) return;
		const { width, height } = menu.getBoundingClientRect();
		menu.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))}px`;
		menu.style.top = `${Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))}px`;
		const before = document.activeElement;
		menu.focus({ preventScroll: true });
		return () => {
			if (before instanceof HTMLElement) before.focus({ preventScroll: true });
		};
	}, [x, y]);

	// Like a native menu, it goes away as soon as attention moves elsewhere.
	useLayoutEffect(() => {
		const outside = (event: Event) => {
			if (!ref.current?.contains(event.target as Node)) close();
		};
		window.addEventListener("pointerdown", outside, true);
		window.addEventListener("scroll", outside, true);
		window.addEventListener("resize", close);
		window.addEventListener("blur", close);
		return () => {
			window.removeEventListener("pointerdown", outside, true);
			window.removeEventListener("scroll", outside, true);
			window.removeEventListener("resize", close);
			window.removeEventListener("blur", close);
		};
	}, []);

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === "Escape" || event.key === "Tab") {
			event.preventDefault();
			close();
			return;
		}
		const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const items = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
		const at = items.indexOf(document.activeElement as HTMLElement);
		items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]?.focus();
	}

	return (
		<div
			ref={ref}
			role="menu"
			aria-label={game.title}
			tabIndex={-1}
			// Every item is a one-shot action, so any click inside is also the end of the menu.
			onClick={close}
			onKeyDown={onKeyDown}
			onContextMenu={(event) => event.preventDefault()}
			className="fixed z-50 flex min-w-[200px] max-w-[280px] flex-col gap-0.5 rounded-lg border border-edge bg-raised p-1.5 shadow-[0_18px_40px_rgba(0,0,0,.6)] outline-none"
		>
			<PrimaryButton primary={status.primary} size="menu" />
			<button
				type="button"
				role="menuitem"
				onClick={() => attempt(api.setBookmark({ gameId: game.id, on: !game.bookmarked }))}
				className={`mt-1 ${item}`}
			>
				{game.bookmarked ? "Remove bookmark" : "Bookmark"}
			</button>
			{status.install && !status.running && (
				<>
					<hr className="mx-1 my-1 border-line" />
					<button
						type="button"
						role="menuitem"
						onClick={() => setUi({ uninstalling: { gameId: game.id } })}
						className={`${item} text-[#FF8A7E]`}
					>
						Uninstall…
					</button>
				</>
			)}
		</div>
	);
}

/** The right-click menu of a game, wherever in the app the game was clicked. */
export function GameMenu() {
	const menu = useUi((s) => s.menu);
	const games = useApp((s) => s.games);
	const game = menu && games.find((g) => g.id === menu.gameId);
	if (!menu || !game) return null;
	return <Menu game={game} x={menu.x} y={menu.y} />;
}
