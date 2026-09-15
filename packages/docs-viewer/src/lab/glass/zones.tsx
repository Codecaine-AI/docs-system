"use client";

import type { ReactNode } from "react";
import { cn } from "../../ui/cn";

export type LabView = "system" | "context" | "state";

export interface PanelViewEntry {
	id: LabView;
	tokens: number;
}

export type PanelOutlineSection = {
	key: string;
	label: string;
	depth: number;
};

const ACCENT = "var(--docs-lab-selection-accent, var(--annotation-accent, #8b5cf6))";

export function PanelZone({ id, label, action, children }: { id: string; label: string; action?: ReactNode; children: ReactNode }) {
	return (
		<section data-lab-zone={id} className="border-b border-[color:var(--docs-lab-zone-border,var(--border))] last:border-b-0">
			<div data-lab-zone-header="" className="flex items-center gap-2 pb-1.5 pt-2.5 text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--docs-lab-zone-header-fg,var(--muted-foreground))] transition-colors">
				<span>{label}</span>
				{action && <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">{action}</span>}
			</div>
			<div className="pb-3">{children}</div>
		</section>
	);
}

export function PanelViewSwitcher({ views, active, onSelect, rowSublines }: { views: PanelViewEntry[]; active: LabView; onSelect: (view: LabView) => void; rowSublines?: Partial<Record<LabView, React.ReactNode>> }) {
	return (
		<div className="flex flex-col">
			{views.map((entry) => {
				const current = entry.id === active;
				const subline = rowSublines?.[entry.id];
				return (
					<div key={entry.id} className="flex flex-col">
						<button type="button" data-lab-view={entry.id} aria-pressed={current} onClick={() => onSelect(entry.id)} className={cn("flex w-full items-baseline gap-2 border-l py-1 pl-3 pr-1 text-left text-[13px] tracking-[0.03em] transition-colors", current ? "text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} style={current ? { borderLeftColor: ACCENT } : undefined}>
							<span>{entry.id}</span>
							<span className="ml-auto text-[10px] tabular-nums text-muted-foreground/50" title={`Estimated tokens in the ${entry.id} view`}>{entry.tokens.toLocaleString()}</span>
						</button>
						{subline && <div data-lab-view-subline={entry.id} className="border-l border-transparent pb-1 pl-3 text-[10px] tracking-[0.06em]">{subline}</div>}
					</div>
				);
			})}
		</div>
	);
}

export function PanelOutlineList({ sections, activeRow, onSelect }: { sections: PanelOutlineSection[]; activeRow: number | null; onSelect: (section: PanelOutlineSection) => void }) {
	return (
		<nav aria-label="Document outline" className="flex flex-col">
			{sections.map((section, index) => {
				const current = index === activeRow;
				return (
					<button key={section.key} type="button" onClick={() => onSelect(section)} aria-current={current ? "location" : undefined} title={section.label} className={cn("border-l py-px pr-2 text-left text-[11px] leading-[1.9] transition-colors", section.depth > 0 ? "pl-6" : "pl-3", current ? "text-foreground" : "border-transparent text-[color:var(--docs-navigation-fg,var(--foreground))] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")} style={current ? { borderLeftColor: ACCENT } : undefined}>
						<span className="block truncate">{section.label}</span>
					</button>
				);
			})}
		</nav>
	);
}
