import { useEffect, useRef } from "react";
import { Footer } from "./chrome/Footer";
import { Sidebar } from "./chrome/Sidebar";
import { TitleBar } from "./chrome/TitleBar";
import { Toast } from "./components/Toast";
import { InstallDialog } from "./dialogs/InstallDialog";
import { PickExecutableDialog } from "./dialogs/PickExecutableDialog";
import { go, useApp, useUi } from "./state/store";
import { Connect } from "./views/Connect";
import { Downloads } from "./views/Downloads";
import { Game } from "./views/Game";
import { Home } from "./views/Home";
import { Settings } from "./views/Settings";

function Main() {
	const view = useUi((s) => s.view);
	const games = useApp((s) => s.games);
	const scroller = useRef<HTMLElement>(null);
	const game = view.name === "game" ? games.find((g) => g.id === view.gameId) : undefined;

	// A game that vanished from the server (or a stale id) falls back to the library.
	useEffect(() => {
		if (view.name === "game" && !game) go({ name: "home" });
	}, [view, game]);

	// Each view starts at the top.
	const key = view.name === "game" ? `game-${view.gameId}` : view.name;
	useEffect(() => {
		scroller.current?.scrollTo(0, 0);
	}, [key]);

	return (
		<main ref={scroller} className="min-w-0 flex-1 overflow-y-auto bg-[#0E1013]">
			{view.name === "home" && <Home />}
			{game && <Game key={game.id} game={game} />}
			{view.name === "downloads" && <Downloads />}
			{view.name === "settings" && <Settings />}
		</main>
	);
}

function Dialogs() {
	const installing = useUi((s) => s.installing);
	const picking = useUi((s) => s.picking);
	const games = useApp((s) => s.games);
	const installGame = installing && games.find((g) => g.id === installing.gameId);
	const pickGame = picking && games.find((g) => g.id === picking.gameId);
	return (
		<>
			{installing && installGame && <InstallDialog game={installGame} versionId={installing.versionId} />}
			{picking && pickGame && <PickExecutableDialog game={pickGame} candidates={picking.candidates} />}
		</>
	);
}

export default function App() {
	const ready = useApp((s) => s.ready);
	const signedIn = useApp((s) => s.session !== null);

	if (!ready) return <div className="drag h-full" />;
	if (!signedIn) {
		return (
			<>
				<Connect />
				<Toast />
			</>
		);
	}
	return (
		<div className="flex h-full min-w-[940px] flex-col">
			<TitleBar />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<Main />
			</div>
			<Footer />
			<Dialogs />
			<Toast />
		</div>
	);
}
