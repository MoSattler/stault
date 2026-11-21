import { useState } from "react";

function hash(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	}
	return h >>> 0;
}

/** A stable abstract cover for games the server has no art for. */
export function gradientFor(seed: string): string {
	const h = hash(seed);
	const hue = h % 360;
	const accent = (hue + 30 + ((h >> 9) % 120)) % 360;
	const x = 20 + ((h >> 4) % 60);
	const y = 18 + ((h >> 12) % 40);
	return (
		`radial-gradient(circle at ${x}% ${y}%, hsl(${accent} 85% 72% / 0.75) 0 8%, hsl(${accent} 85% 72% / 0) 26%), ` +
		`linear-gradient(${150 + ((h >> 16) % 50)}deg, hsl(${hue} 42% 26%) 0%, hsl(${(hue + 50) % 360} 48% 11%) 100%)`
	);
}

interface CoverProps {
	title: string;
	url: string | null;
	className?: string;
	/** Print the title on generated covers (for larger tiles). */
	labelled?: boolean;
}

export function Cover({ title, url, className = "", labelled = false }: CoverProps) {
	const [failed, setFailed] = useState(false);
	const showImage = url && !failed;
	return (
		<span
			aria-hidden="true"
			className={`relative block overflow-hidden ${className}`}
			style={{ background: gradientFor(title) }}
		>
			{showImage ? (
				<img
					src={url}
					alt=""
					loading="lazy"
					draggable={false}
					onError={() => setFailed(true)}
					className="absolute inset-0 h-full w-full object-cover"
				/>
			) : (
				labelled && (
					<span className="stretch-112 absolute inset-x-0 bottom-0 p-2.5 text-[13px] font-extrabold uppercase leading-[1.1] tracking-[0.04em] text-white/90">
						{title}
					</span>
				)
			)}
		</span>
	);
}
