import { BrowserWindow, Updater } from "electrobun/main";

const DEV_SERVER_URL = "http://localhost:5173";

// In dev builds, prefer the Vite dev server (`hutch run dev:hmr`) so the UI
// hot-reloads. Otherwise load the bundled view.
async function getMainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			// Dev server not running: fall through to the bundled view.
		}
	}
	return "views://mainview/index.html";
}

new BrowserWindow({
	title: "Stault",
	url: await getMainViewUrl(),
	frame: {
		width: 1280,
		height: 800,
	},
});
