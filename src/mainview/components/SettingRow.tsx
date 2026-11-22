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

/** The control of an on/off setting: a sliding toggle, as in design/Main.dc.html. */
export function Switch({ label, on, disabled, onChange }: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!on)}
			className={`relative h-[26px] w-11 flex-none rounded-full transition-colors enabled:hover:brightness-110 disabled:opacity-50 motion-reduce:transition-none ${on ? "bg-lime" : "bg-edge"}`}
		>
			<span
				aria-hidden="true"
				className={`absolute left-[3px] top-[3px] h-5 w-5 rounded-full transition-transform motion-reduce:transition-none ${on ? "translate-x-[18px] bg-carbon" : "bg-muted"}`}
			/>
		</button>
	);
}
