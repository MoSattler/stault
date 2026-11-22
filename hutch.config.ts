// @hutch cli=0.30.0 cottontail=0.7.3
export default {
	scripts: {
		install: ["hutch", "install", "--frozen-lockfile"],
		start: "hutch dev/fetch-vendor.ts && hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch dev/fetch-vendor.ts && hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		"dev:hmr": ["hutch", "pm", "exec", "--", "concurrently", "hutch run hmr", "hutch run start"],
		hmr: "hutch electrobun prepare && hutch pm exec -- vite --port 5173",
		typecheck: "hutch electrobun prepare && hutch pm exec -- tsc",
		test: ["hutch", "test"],
		"build:dev": "hutch dev/fetch-vendor.ts && hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=dev",
		build: "hutch dev/fetch-vendor.ts && hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
		"build:canary": "hutch dev/fetch-vendor.ts && hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=canary",
	},
	electrobun: {
		version: "2.0.7",
	},
};
