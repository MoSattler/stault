import { type FormEvent, useState } from "react";
import type { ServerCheck } from "../../shared/model";
import { api } from "../api";
import { WindowControls } from "../chrome/WindowControls";
import { gradientFor } from "../components/Cover";
import { CheckIcon, Logo } from "../components/icons";
import { useApp } from "../state/store";

const WALL = Array.from({ length: 20 }, (_, i) => gradientFor(`wall-${i * 7}`));

const label = "text-sm font-semibold";
const field =
	"min-h-[46px] min-w-0 rounded-md border border-edge bg-raised px-3.5 disabled:opacity-60";

/** First run: find the server, sign in, name this device. */
export function Connect() {
	const defaultDevice = useApp((s) => s.deviceName);
	const last = useApp((s) => s.lastSignIn);
	const [url, setUrl] = useState(last?.serverUrl ?? "");
	const [username, setUsername] = useState(last?.username ?? "");
	const [password, setPassword] = useState("");
	const [device, setDevice] = useState(defaultDevice);
	const [check, setCheck] = useState<ServerCheck | "checking" | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function runCheck() {
		if (!url.trim()) return;
		setCheck("checking");
		const result = await api.checkServer({ url });
		setCheck(result);
		// Show the address that actually answered (scheme filled in).
		if (result.serverUrl) setUrl(result.serverUrl);
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await api.signIn({ serverUrl: url, username, password, deviceName: device });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	}

	return (
		<div className="relative flex h-full text-[15px]">
			<div className="drag absolute inset-x-0 top-0 z-10 flex h-[46px] justify-end">
				<WindowControls />
			</div>

			<div aria-hidden="true" className="relative min-w-0 flex-[1_1_520px] overflow-hidden bg-panel">
				<div className="absolute -inset-10 grid rotate-[-8deg] scale-[1.15] grid-cols-5 gap-4 opacity-55">
					{WALL.map((background, i) => (
						<span key={i} className="block aspect-[5/7] rounded-md" style={{ background }} />
					))}
				</div>
				<div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,12,14,.2)_0%,rgba(11,12,14,.85)_85%,#0B0C0E_100%),linear-gradient(0deg,rgba(11,12,14,.9)_0%,rgba(11,12,14,0)_50%)]" />
				<div className="absolute bottom-12 left-12 flex flex-col gap-3">
					<span className="flex items-center gap-3">
						<Logo size={34} className="text-lime" />
						<span className="stretch-125 text-[22px] font-extrabold tracking-[0.16em]">STAULT</span>
					</span>
					<span className="max-w-[26ch] text-lg text-[#D5D9DE]">
						Your GameVault library on every screen you play on.
					</span>
				</div>
			</div>

			<main className="flex flex-[1_1_440px] items-center justify-center overflow-y-auto px-6 py-12">
				<form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-[22px]">
					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[11.5px] tracking-[0.14em] text-muted">FIRST RUN · SERVER</span>
						<h1 className="stretch-125 text-[30px] font-extrabold uppercase leading-[1.05]">
							Connect to GameVault
						</h1>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="srv" className={label}>Server address</label>
						<div className="flex gap-2">
							<input
								id="srv"
								value={url}
								onChange={(e) => {
									setUrl(e.target.value);
									setCheck(null);
								}}
								onBlur={runCheck}
								placeholder="https://vault.lan"
								autoComplete="url"
								autoCapitalize="off"
								spellCheck={false}
								autoFocus
								disabled={busy}
								className={`${field} flex-auto font-mono text-sm`}
							/>
							<button
								type="button"
								onClick={runCheck}
								disabled={busy || check === "checking"}
								className="min-h-[46px] rounded-md border border-edge bg-hover px-4 text-sm font-semibold"
							>
								Check
							</button>
						</div>
						{check === "checking" ? (
							<p className="text-[13px] text-muted">Looking for the server…</p>
						) : check?.ok ? (
							<p role="status" className="flex items-center gap-2 text-[13px] text-lime">
								<CheckIcon size={15} />
								GameVault server found · version {check.version}
							</p>
						) : check ? (
							<p role="alert" className="text-[13px] text-amber">{check.error}</p>
						) : (
							<p className="text-[13px] text-muted">
								Include the port if it isn't 443, e.g. http://nas.local:8080
							</p>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3.5">
						<div className="flex flex-col gap-2">
							<label htmlFor="usr" className={label}>Username</label>
							<input id="usr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} disabled={busy} className={field} />
						</div>
						<div className="flex flex-col gap-2">
							<label htmlFor="pwd" className={label}>Password</label>
							<input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} className={field} />
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<label htmlFor="dev" className={label}>Name this device</label>
						<input id="dev" value={device} onChange={(e) => setDevice(e.target.value)} disabled={busy} className={field} />
						<span className="text-[13px] text-muted">
							Shown in Stault, so you can tell your devices apart.
						</span>
					</div>

					{error && <p role="alert" className="text-[13px] text-amber">{error}</p>}

					<button
						type="submit"
						disabled={busy || !url.trim() || !username.trim() || !password}
						className="stretch-112 flex min-h-[50px] items-center justify-center rounded-md bg-lime text-[15px] font-[750] uppercase tracking-[0.05em] text-carbon hover:brightness-110 disabled:opacity-50"
					>
						{busy ? "Signing in…" : "Sign in"}
					</button>
					<p className="text-[13px] text-muted">
						Stault stores the session token in the system keychain, never the password.
					</p>
				</form>
			</main>
		</div>
	);
}
