"use client";

import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { Pencil, Sparkles } from "lucide-react";

export type LabPanelTab = "edit" | "ai";

export const PANEL_GEOMETRY = {
	edit: { width: 300 },
	ai: { width: "var(--docs-action-pane-width, 520px)", heightFraction: 0.8 },
} as const;

export const PANEL_TOP_INSET = 12;
const PANEL_BOTTOM_GAP = 12;

export const DOCK_DEFAULT_WIDTH: number = PANEL_GEOMETRY.edit.width;

const TRANSITION_MS = 260;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const WIDE_TAB_FRACTION = 0.75;

const fadeIn: CSSProperties = {
	animation: `labFloatContentIn ${TRANSITION_MS}ms ${EASE}`,
};

const ANNOTATION_ACCENT = "var(--annotation-accent, #8b5cf6)";
const ANNOTATION_ACCENT_LIT = "var(--annotation-accent-lit, var(--annotation-accent, #8b5cf6))";
const ANNOTATION_BORDER = "var(--annotation-border, var(--border))";
const PANEL_BORDER = "var(--docs-lab-panel-border, var(--border))";

export interface GlassPanelProps {
	tab: LabPanelTab;
	onTabSelect: (tab: LabPanelTab) => void;
	busy?: boolean;
	topInset?: number;
	children: ReactNode;
	onWidthChange?: (width: number) => void;
}

export function GlassPanel({
	tab,
	onTabSelect,
	busy = false,
	topInset = PANEL_TOP_INSET,
	children,
	onWidthChange,
}: GlassPanelProps) {
	const [entered, setEntered] = useState(false);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const headerRef = useRef<HTMLElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const innerRef = useRef<HTMLDivElement | null>(null);
	const [regionHeight, setRegionHeight] = useState<number | null>(null);
	const [contentHeight, setContentHeight] = useState<number | null>(null);

	const ai = tab === "ai";
	const geometry = PANEL_GEOMETRY[tab];

	useEffect(() => {
		const frame = requestAnimationFrame(() => setEntered(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	useEffect(() => {
		const width = ai
			? Number.parseFloat(
					window
						.getComputedStyle(panelRef.current ?? document.documentElement)
						.getPropertyValue("--docs-action-pane-width"),
				) || 520
			: PANEL_GEOMETRY.edit.width;
		onWidthChange?.(width);
	}, [ai, geometry.width, onWidthChange]);

	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const region = panelRef.current?.parentElement;
		if (!region) return;
		const measure = () => setRegionHeight(region.getBoundingClientRect().height);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(region);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (typeof ResizeObserver === "undefined" || tab !== "edit") return;
		const inner = innerRef.current;
		if (!inner) return;
		const measure = () => {
			const scroll = scrollRef.current;
			const header = headerRef.current;
			if (!scroll || !header) return;
			const scrollStyle = window.getComputedStyle(scroll);
			const padding =
				(Number.parseFloat(scrollStyle.paddingTop) || 0) +
				(Number.parseFloat(scrollStyle.paddingBottom) || 0);
			setContentHeight(inner.offsetHeight + padding + header.offsetHeight + 2);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(inner);
		return () => observer.disconnect();
	}, [tab]);

	const cap = regionHeight === null ? null : regionHeight - topInset - PANEL_BOTTOM_GAP;
	const height: CSSProperties["height"] = ai
		? cap === null
			? `${PANEL_GEOMETRY.ai.heightFraction * 100}%`
			: Math.round(Math.min(PANEL_GEOMETRY.ai.heightFraction * regionHeight!, cap))
		: contentHeight === null || cap === null
			? "auto"
			: Math.min(contentHeight, cap);

	const tabStyle = (active: boolean): CSSProperties => ({
		color: active
			? ai
				? ANNOTATION_ACCENT_LIT
				: "var(--docs-lab-foreground, var(--foreground))"
			: "var(--docs-lab-muted-foreground, var(--muted-foreground))",
	});

	return (
		<div
			ref={panelRef}
			data-lab-dock=""
			data-lab-float-mode={ai ? "annotate" : "dock"}
			{...(ai ? { "data-lab-annotate-panel": "" } : {})}
			role="complementary"
			aria-label={ai ? "AI workspace" : "Lab panel"}
			className="absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius)] border"
			style={{
				top: topInset,
				right: "var(--docs-lab-panel-right, 24px)",
				width: geometry.width,
				height,
				maxWidth: "92%",
				transformOrigin: "top right",
				transform: entered ? "scale(1)" : "scale(0.985)",
				opacity: entered ? 1 : 0,
				transition: `opacity ${TRANSITION_MS}ms ${EASE}, transform ${TRANSITION_MS}ms ${EASE}, width ${TRANSITION_MS}ms ${EASE}, height ${TRANSITION_MS}ms ${EASE}`,
				background: "var(--docs-lab-glass-bg, var(--background))",
				backdropFilter: "blur(var(--docs-lab-glass-blur, 13px))",
				WebkitBackdropFilter: "blur(var(--docs-lab-glass-blur, 13px))",
				borderColor: ai ? ANNOTATION_BORDER : PANEL_BORDER,
				boxShadow: "var(--docs-lab-panel-shadow, none)",
			}}
		>
			<header
				ref={headerRef}
				data-lab-annotate-panel-header=""
				className="relative flex shrink-0 select-none border-b"
				style={{ borderColor: ai ? ANNOTATION_BORDER : PANEL_BORDER }}
			>
				<span
					aria-hidden
					data-lab-panel-tab-indicator=""
					className="absolute bottom-0 h-px"
					style={{
						left: ai ? `${(1 - WIDE_TAB_FRACTION) * 100}%` : 0,
						width: `${WIDE_TAB_FRACTION * 100}%`,
						background: ai ? ANNOTATION_ACCENT : "var(--docs-lab-selection-accent, var(--annotation-accent, #8b5cf6))",
						transition: `left ${TRANSITION_MS}ms ${EASE}, background ${TRANSITION_MS}ms ${EASE}`,
					}}
				/>
				<button type="button" data-lab-panel-tab="edit" data-docs-mode="edit" aria-label="Edit" aria-pressed={!ai} title="Edit" onClick={() => onTabSelect("edit")} className="flex items-center justify-center gap-1.5 py-2 text-[10px] uppercase tracking-[0.14em] transition-all hover:text-foreground" style={{ width: ai ? `${(1 - WIDE_TAB_FRACTION) * 100}%` : `${WIDE_TAB_FRACTION * 100}%`, transition: `width ${TRANSITION_MS}ms ${EASE}, color 150ms ease`, ...tabStyle(!ai) }}>
					{ai ? <Pencil key="icon" size={12} aria-hidden style={fadeIn} /> : <span key="label" style={fadeIn}>Edit</span>}
				</button>
				<button type="button" data-lab-panel-tab="ai" data-docs-mode="ai" aria-label="AI" aria-pressed={ai} title={ai ? "AI workspace — esc to finish" : "AI workspace"} onClick={() => onTabSelect("ai")} className="flex items-center justify-center gap-1.5 border-l py-2 text-[10px] uppercase tracking-[0.14em] transition-all hover:text-foreground" style={{ width: ai ? `${WIDE_TAB_FRACTION * 100}%` : `${(1 - WIDE_TAB_FRACTION) * 100}%`, transition: `width ${TRANSITION_MS}ms ${EASE}, color 150ms ease`, borderColor: ai ? ANNOTATION_BORDER : PANEL_BORDER, ...tabStyle(ai) }}>
					{ai && <span data-lab-annotate-dot={busy ? "fast" : "slow"} aria-hidden className="h-[5px] w-[5px] rounded-full" style={{ background: ANNOTATION_ACCENT, animation: `docs-annotation-breathe ${busy ? "0.72s" : "2.6s"} ease-in-out infinite` }} />}
					{ai ? <span key="label" style={fadeIn}>Annotations</span> : <Sparkles key="icon" size={12} aria-hidden style={fadeIn} />}
				</button>
			</header>
			<div key={tab} ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2" style={{ animation: `labFloatContentIn ${TRANSITION_MS}ms ${EASE}` }}>
				<div ref={innerRef} className={ai ? "h-full" : undefined}>{children}</div>
			</div>
			<style>{`@keyframes labFloatContentIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
		</div>
	);
}
