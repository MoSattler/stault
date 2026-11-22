import { ApplicationMenu, BrowserWindow, Screen } from "electrobun/main";

/** The design's minimum: still fits half of a 1080p screen. */
const MIN_WIDTH = 940;
const MIN_HEIGHT = 600;

/**
 * A size, or as much of it as the screen has room for. Windows opens a window
 * larger than the screen as it is, with its buttons out of reach.
 */
function fitScreen(width: number, height: number) {
	const { workArea } = Screen.getPrimaryDisplay();
	// Zero means the screen's size is not known.
	return {
		width: Math.min(width, workArea.width || width),
		height: Math.min(height, workArea.height || height),
	};
}

type Rpc = NonNullable<ConstructorParameters<typeof BrowserWindow>[0]>["rpc"];

export function createMainWindow(url: string, rpc: Rpc) {
	// Without an Edit menu, macOS has no copy/paste/undo shortcuts in text fields.
	// Windows needs none, and would attach it to the window as a real menu bar.
	if (process.platform === "darwin") setApplicationMenu();

	const min = fitScreen(MIN_WIDTH, MIN_HEIGHT);
	const win = new BrowserWindow({
		title: "Stault",
		url,
		rpc,
		frame: fitScreen(1280, 800),
		// macOS keeps its traffic lights over our own title bar; Windows and Linux
		// get no system title bar at all and Stault draws the window buttons.
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
	});
	win.center();

	// Electrobun has no minimum-size option, so push the window back out.
	win.on("resize", (event) => {
		const { width, height } = (event as { data: { width: number; height: number } }).data;
		if (width < min.width || height < min.height) {
			win.setSize(Math.max(width, min.width), Math.max(height, min.height));
		}
	});

	return win;
}

function setApplicationMenu() {
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
}
