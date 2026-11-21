import { ApplicationMenu, BrowserWindow } from "electrobun/main";

/** The design's minimum: still fits half of a 1080p screen. */
const MIN_WIDTH = 940;
const MIN_HEIGHT = 600;

type Rpc = NonNullable<ConstructorParameters<typeof BrowserWindow>[0]>["rpc"];

export function createMainWindow(url: string, rpc: Rpc) {
	// Without an Edit menu, macOS has no copy/paste/undo shortcuts in text fields.
	ApplicationMenu.setApplicationMenu([
		{
			label: "Stault",
			submenu: [
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "showAll" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ role: "toggleFullScreen" },
				{ role: "close" },
			],
		},
	]);

	const win = new BrowserWindow({
		title: "Stault",
		url,
		rpc,
		frame: { width: 1280, height: 800 },
		// macOS keeps its traffic lights over our own title bar; Windows and Linux
		// get no system title bar at all and Stault draws the window buttons.
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
	});
	win.center();

	// Electrobun has no minimum-size option, so push the window back out.
	win.on("resize", (event) => {
		const { width, height } = (event as { data: { width: number; height: number } }).data;
		if (width < MIN_WIDTH || height < MIN_HEIGHT) {
			win.setSize(Math.max(width, MIN_WIDTH), Math.max(height, MIN_HEIGHT));
		}
	});

	return win;
}
