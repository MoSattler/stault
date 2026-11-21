import { type ReactNode, useEffect, useRef } from "react";

interface Props {
	labelledBy: string;
	onClose(): void;
	children: ReactNode;
	className?: string;
}

/** A modal on the native <dialog>: focus trap, Esc and backdrop come for free. */
export function Dialog({ labelledBy, onClose, children, className = "max-w-[560px]" }: Props) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby={labelledBy}
			onClose={onClose}
			// A click on the backdrop lands on the dialog element itself.
			onClick={(event) => event.target === ref.current && ref.current?.close()}
			className={`m-auto max-h-[calc(100vh-48px)] w-[calc(100%-48px)] animate-rise overflow-auto rounded-xl border border-edge bg-raised p-0 text-ink shadow-[0_30px_80px_rgba(0,0,0,.6)] ${className}`}
		>
			{children}
		</dialog>
	);
}

export const dialogButton =
	"min-h-[42px] rounded-md border border-edge bg-raised px-[18px] font-semibold hover:bg-hover";
export const dialogPrimary =
	"min-h-[42px] rounded-md bg-lime px-[22px] font-[750] uppercase tracking-[0.04em] text-carbon hover:brightness-110 disabled:opacity-50";
