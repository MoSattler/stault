import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			aria-hidden="true"
			{...rest}
		>
			{children}
		</svg>
	);
}

export const Logo = (p: IconProps) => (
	<Icon {...p}>
		<rect x="3" y="3" width="18" height="18" rx="4" />
		<circle cx="12" cy="12" r="4.2" />
		<path d="M12 5.8v2M12 16.2v2M5.8 12h2M16.2 12h2" />
	</Icon>
);

export const SearchIcon = (p: IconProps) => (
	<Icon {...p}>
		<circle cx="11" cy="11" r="6.5" />
		<path d="M20 20l-4.2-4.2" />
	</Icon>
);

export const GearIcon = (p: IconProps) => (
	<Icon strokeWidth={1.8} {...p}>
		<circle cx="12" cy="12" r="3.2" />
		<path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
	</Icon>
);

export const CheckIcon = (p: IconProps) => (
	<Icon strokeWidth={2.4} {...p}>
		<path d="M5 12.5l4.5 4.5L19 7.5" />
	</Icon>
);

export const PlayIcon = (p: IconProps) => (
	<Icon stroke="none" {...p}>
		<path d="M7 4.5v15l13-7.5z" fill="currentColor" />
	</Icon>
);

export const StopIcon = (p: IconProps) => (
	<Icon stroke="none" {...p}>
		<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
	</Icon>
);

export const PauseIcon = (p: IconProps) => (
	<Icon stroke="none" {...p}>
		<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
	</Icon>
);

export const DownloadIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} {...p}>
		<path d="M12 5v12M7.5 12.5L12 17l4.5-4.5" />
	</Icon>
);

export const SpinnerIcon = (p: IconProps) => (
	<Icon strokeWidth={2.4} {...p} className={`animate-spin ${p.className ?? ""}`}>
		<path d="M12 3a9 9 0 1 0 9 9" />
	</Icon>
);

export const BackIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} strokeLinejoin="round" {...p}>
		<path d="M14.5 6l-6 6 6 6" />
	</Icon>
);

export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
	<Icon strokeWidth={1.9} strokeLinejoin="round" {...p}>
		<path d="M7 4h10v16l-5-3.6L7 20z" fill={filled ? "currentColor" : "none"} />
	</Icon>
);

export const ArrowUpIcon = (p: IconProps) => (
	<Icon strokeWidth={2.2} {...p}>
		<path d="M12 19V7M7.5 11.5L12 7l4.5 4.5" />
	</Icon>
);

export const CloseIcon = (p: IconProps) => (
	<Icon {...p}>
		<path d="M6 6l12 12M18 6L6 18" />
	</Icon>
);

export const FolderIcon = (p: IconProps) => (
	<Icon strokeWidth={1.9} strokeLinejoin="round" {...p}>
		<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5H12L10 5H4.5A1.5 1.5 0 0 0 3 6.5z" />
	</Icon>
);
