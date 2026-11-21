import { useUi } from "../state/store";

export function Toast() {
	const toast = useUi((s) => s.toast);
	if (!toast) return null;
	return (
		<div
			key={toast.id}
			role="status"
			aria-live="polite"
			className="fixed bottom-[52px] right-5 z-[60] flex max-w-[380px] animate-rise items-start gap-3 rounded-[10px] border border-edge bg-hover px-4 py-3.5 shadow-[0_18px_40px_rgba(0,0,0,.5)]"
		>
			<span aria-hidden="true" className="mt-1.5 block h-2 w-2 flex-none rounded-full bg-lime" />
			<span className="flex flex-col gap-0.5">
				<span className="text-[13.5px] font-[650]">{toast.text}</span>
				{toast.sub && <span className="text-[12.5px] text-muted">{toast.sub}</span>}
			</span>
		</div>
	);
}
