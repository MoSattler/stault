import type { ReactNode } from "react";

/** One setting: its name and what it does on the left, its control on the right. */
export function SettingRow({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-5 border-b border-hover py-3.5">
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="font-semibold">{title}</span>
				{help && <span className="text-[12.5px] text-muted">{help}</span>}
			</span>
			{children}
		</div>
	);
}

interface SwitchProps {
	/** The setting's name, read out with its state. */
	label: string;
	on: boolean;
	disabled?: boolean;
	onChange(on: boolean): void;
}

/** The control of an on/off setting. */
export function Switch({ label, on, disabled, onChange }: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!on)}
			className={`min-h-9 min-w-16 flex-none rounded-md border bg-raised px-3.5 text-[13px] font-semibold hover:bg-hover disabled:opacity-50 ${on ? "border-lime text-lime" : "border-edge text-muted"}`}
		>
			{on ? "On" : "Off"}
		</button>
	);
}
