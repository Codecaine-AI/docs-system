"use client";

import { ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DocRequestDisposition } from "../session/doc-edit-session";

export interface InlineComposerProps {
	onSubmit: (body: string, disposition: DocRequestDisposition) => void;
	onCancel: () => void;
	/** A document target queues a global request; all other targets queue batch work. */
	documentTarget?: boolean;
	initialValue?: string;
}

function ComposerTip({ label, keys, children }: { label: string; keys: string; children: ReactNode }) {
	const [show, setShow] = useState(false);
	return <span className="relative inline-flex shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
		{children}
		{show && <span data-docs-lab-composer-tip="" className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--docs-panel-bg,var(--background,#181818))] px-2 py-1 text-[11px] text-[color:var(--foreground,#e4e4e7)] shadow-lg">{label}<span className="text-[10px] tracking-[0.05em] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]">{keys}</span></span>}
	</span>;
}

/** One-box, in-flow composer. Enter files a batch or global request. */
export function InlineComposer({ onSubmit, onCancel, documentTarget = false, initialValue }: InlineComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const [closeHover, setCloseHover] = useState(false);
	const disposition: DocRequestDisposition = documentTarget ? "global" : "batch";
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.focus();
		if (textarea.value.length > 0) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}, []);
	const submit = () => {
		const body = textareaRef.current?.value.trim() ?? "";
		if (body) onSubmit(body, disposition);
	};
	return <div data-docs-lab-composer="" className="rounded-[var(--radius,0.5rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--docs-panel-bg,var(--background,#181818))] p-2.5 shadow-lg" style={{ width: "min(var(--docs-composer-width, 640px), 100%)" }}>
		<div className="flex items-start gap-2">
			<textarea ref={textareaRef} rows={2} defaultValue={initialValue} placeholder={documentTarget ? "Note about the whole document" : "What should change here?"} className="w-full flex-1 resize-none bg-transparent text-[13px] leading-[1.55] text-[color:var(--foreground,#e4e4e7)] outline-none" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
			<ComposerTip label="Close" keys="esc"><button type="button" aria-label="Cancel" className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius,0.375rem)] transition-colors" style={{ color: closeHover ? "var(--annotation-reject,#f85149)" : "var(--docs-muted-foreground,var(--muted-foreground,#71717a))" }} onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)} onClick={onCancel}><X aria-hidden size={14} /></button></ComposerTip>
		</div>
		<div className="mt-1.5 flex items-center justify-end"><ComposerTip label={documentTarget ? "Queue · document" : "Queue"} keys="⏎"><button type="button" aria-label="Queue" data-docs-lab-composer-action={disposition} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--annotation-accent-fill,rgba(138,122,176,.16))] text-[color:var(--annotation-accent,#a99af5)] transition-colors" onClick={submit}><ArrowUp aria-hidden size={13} /></button></ComposerTip></div>
	</div>;
}
