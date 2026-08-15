// Slice: the inline annotation composer — spawns IN the document flow,
// directly above the clicked target (Cursor ⌘K feel, ported from
// prompt-kit's lab). No scope breadcrumb, no target label: what you clicked
// is the target, and the pinned ring already shows it.
//
// ONE gesture: Enter files the note into the queue. Node targets queue as
// `batch`, a document target queues as `global`. Esc cancels — handled by
// the lab's targeting container, which this bubbles to.
//
// Presentation matches prompt-kit's InlineComposer, painted with the docs
// annotation var family (--annotation-surface/-text/-muted/-border and the
// violet --annotation-accent set) so the box reads as the annotate layer's
// own violet identity, not the workbench panel chrome.
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

/**
 * Cursor-style tooltip: a small bubble ABOVE the control, instantly on
 * hover. Label first, then the key in muted small caps — `Close esc`,
 * `Queue ⏎`. Centered over the control.
 */
function ComposerTip({ label, keys, children }: { label: string; keys: string; children: ReactNode }) {
	const [show, setShow] = useState(false);
	return <span className="relative inline-flex shrink-0" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
		{children}
		{show && <span data-docs-lab-composer-tip="" className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap rounded-[var(--radius,0.375rem)] border border-[color:var(--annotation-border,rgba(173,157,208,.3))] bg-[color:var(--annotation-surface,#1c1c20)] px-2 py-1 text-[11px] text-[color:var(--annotation-text,#e4e4e7)] shadow-lg">{label}<span className="text-[10px] tracking-[0.05em] text-[color:var(--annotation-muted,#a1a1aa)]">{keys}</span></span>}
	</span>;
}

/**
 * One box (Cursor-style): the container IS the input — no inner bordered
 * field, no footer line. × top-right cancels, the circular ↑ bottom-right
 * queues, and the hotkeys live in tooltips. Enter files a batch or global
 * request; Escape bubbles to the targeting container.
 */
export function InlineComposer({ onSubmit, onCancel, documentTarget = false, initialValue }: InlineComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	// Hover state instead of a hover: class — the base color is a theme var
	// set inline, which a utility class cannot override.
	const [closeHover, setCloseHover] = useState(false);
	const disposition: DocRequestDisposition = documentTarget ? "global" : "batch";
	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.focus();
		// Editing: caret at the end of the prefilled note, ready to append.
		if (textarea.value.length > 0) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}, []);
	const submit = () => {
		const body = textareaRef.current?.value.trim() ?? "";
		if (body) onSubmit(body, disposition);
	};
	return <div data-docs-lab-composer="" className="rounded-[var(--radius,0.5rem)] border border-[color:var(--annotation-border,rgba(173,157,208,.3))] bg-[color:var(--annotation-surface,#1c1c20)] px-3 py-2.5 shadow-lg" style={{ width: "min(var(--docs-composer-width, 640px), 100%)" }}>
		<div className="flex items-start gap-2">
			<textarea ref={textareaRef} rows={2} defaultValue={initialValue} placeholder={documentTarget ? "Note about the whole document" : "What should change here?"} className="w-full flex-1 resize-none bg-transparent text-[13px] leading-[1.55] text-[color:var(--annotation-text,#e4e4e7)] outline-none placeholder:text-[color:var(--annotation-muted,#a1a1aa)]" onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				// Every Enter queues — modifiers included, so ⌘Enter/⇧Enter
				// muscle memory still files instead of silently doing nothing.
				event.preventDefault();
				submit();
				// Escape bubbles to the targeting container, which clears the
				// pinned target (and with it this composer).
			}} />
			<ComposerTip label="Close" keys="esc"><button type="button" aria-label="Cancel" className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius,0.375rem)] transition-colors" style={{ color: closeHover ? "var(--annotation-danger,#f87171)" : "var(--annotation-muted,#a1a1aa)" }} onMouseEnter={() => setCloseHover(true)} onMouseLeave={() => setCloseHover(false)} onClick={onCancel}><X aria-hidden size={14} /></button></ComposerTip>
		</div>
		<div className="mt-1.5 flex items-center justify-end"><ComposerTip label={documentTarget ? "Queue · document" : "Queue"} keys="⏎"><button type="button" aria-label="Queue" data-docs-lab-composer-action={disposition} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--annotation-active-bg,rgba(138,122,176,.16))] text-[color:var(--annotation-accent-lit,var(--annotation-accent,#ad9dd0))] transition-colors" onClick={submit}><ArrowUp aria-hidden size={13} /></button></ComposerTip></div>
	</div>;
}
