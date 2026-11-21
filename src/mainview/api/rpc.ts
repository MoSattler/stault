import { Electroview } from "electrobun/view";
import type { AppRPC, Pushes } from "../../shared/rpc";
import type { StaultApi } from "./index";

/** Requests that wait on the user (a native dialog) and so must not time out. */
const NO_TIMEOUT = new Set(["addLibraryFolder"]);

export function createRpcApi(): StaultApi {
	const handlers: { [K in keyof Pushes]?: (payload: Pushes[K]) => void } = {};

	const rpc = Electroview.defineRPC<AppRPC>({
		maxRequestTime: 30_000,
		handlers: {
			requests: {},
			messages: {
				patch: (payload) => handlers.patch?.(payload),
				toast: (payload) => handlers.toast?.(payload),
			},
		},
	});
	new Electroview({ rpc });

	const request = rpc.request as unknown as Record<
		string,
		(params: unknown, options?: { maxRequestTime: number }) => Promise<unknown>
	>;

	return new Proxy({} as StaultApi, {
		get(_target, name: string) {
			if (name === "onPush") {
				return <K extends keyof Pushes>(type: K, handler: (payload: Pushes[K]) => void) => {
					(handlers as Record<K, typeof handler>)[type] = handler;
				};
			}
			return (params: unknown) =>
				request[name](
					params,
					NO_TIMEOUT.has(name) ? { maxRequestTime: Infinity } : undefined,
				);
		},
	});
}
