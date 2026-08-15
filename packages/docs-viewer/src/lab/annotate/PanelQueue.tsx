"use client";

import { useRef } from "react";
import {
	undoDisabledReason,
	type DocEditRequest,
	type DocEditSession,
	type DocEditTarget,
} from "../session/doc-edit-session";
import type { QueueEntry, RecordEntry, RequestQueueModel } from "../session/request-queue";

const STATUS_LABEL: Record<DocEditRequest["status"], string> = {
	open: "open",
	working: "working",
	waiting: "waiting on you",
	ready: "proposal ready",
	applied: "applied",
	declined: "declined",
	resolved: "resolved",
	failed: "failed",
};

export interface PanelQueueProps {
	session: DocEditSession;
	queue: RequestQueueModel;
	applying: boolean;
	/** Host-level reason Apply is unavailable, independent of the queue model. */
	applyDisabledReason?: string | null;
	/** Starts the batch over the queue's current open requests. */
	onApply: () => void;
	/** Files a document-level note from the rail input. */
	onFileGlobal?: (body: string) => void;
	/** Select a target in the document surface. */
	onFocusTarget?: (target: DocEditTarget) => void;
	/** Light a target in the document surface; null clears the light. */
	onHoverTarget?: (target: DocEditTarget | null) => void;
	/** Human-readable target label; raw ids are intentionally never needed here. */
	labelForTarget: (target: DocEditTarget) => string;
}

/** Queue rail: block notes, document notes, closed-loop records, then one Apply dock. */
export function PanelQueue({ session, queue, applying, applyDisabledReason, onApply, onFileGlobal, onFocusTarget, onHoverTarget, labelForTarget }: PanelQueueProps) {
	const docInputRef = useRef<HTMLInputElement | null>(null);
	const sendDocMessage = () => {
		const body = docInputRef.current?.value.trim() ?? "";
		if (!body) return;
		if (onFileGlobal) onFileGlobal(body);
		else if (session.onFileRequest) void session.onFileRequest({ annotationId: newAnnotationId(), target: { kind: "doc" }, body, disposition: "global" });
		else return;
		if (docInputRef.current) docInputRef.current.value = "";
	};
	const documentEntries = queue.queue.filter((entry) => entry.disposition === "global");
	const targetEntries = queue.queue.filter((entry) => entry.disposition !== "global");
	const renderRow = (entry: QueueEntry) => <QueueRow key={entry.request.alias} entry={entry} session={session} onFocusTarget={onFocusTarget} onHoverTarget={onHoverTarget} labelForTarget={labelForTarget} />;
	return <div className="flex h-full min-h-0 flex-col" data-docs-lab-session-rail="">
		<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
			<GroupHeader label="Targets" />
			{targetEntries.length === 0 ? <p className="px-1.5 py-1 text-[13px] leading-relaxed text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]">Nothing queued — Enter in a composer files here.</p> : targetEntries.map(renderRow)}
			{(documentEntries.length > 0 || Boolean(onFileGlobal ?? session.onFileRequest)) && <>
				<GroupHeader label="Document" />
				{documentEntries.map(renderRow)}
				{Boolean(onFileGlobal ?? session.onFileRequest) && <input ref={docInputRef} aria-label="Message the whole document" placeholder="Note about the whole document…" className="mx-1.5 mb-1.5 mt-0.5 min-w-0 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--background,#181818)] px-2 py-1.5 text-[13px] outline-none focus:border-[color:var(--annotation-accent,#a99af5)]" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); sendDocMessage(); } }} />}
			</>}
			{queue.records.length > 0 && <><div aria-hidden className="mx-1.5 mb-1 mt-2 h-px shrink-0 bg-[color:var(--docs-panel-border,var(--border,#2b2b2b))]" />{queue.records.map((record) => <RecordRow key={record.request.alias} record={record} session={session} onFocusTarget={onFocusTarget} labelForTarget={labelForTarget} />)}</>}
		</div>
		<div className="mt-2 flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] pt-2.5">
			<button type="button" aria-label="Apply queue" data-docs-lab-queue-apply="" disabled={applyDisabledReason !== null && applyDisabledReason !== undefined ? true : !queue.canApply} title={applyDisabledReason ?? (queue.canApply ? "Run the queued notes" : applying ? "The queue is running" : "Nothing queued")} className="shrink-0 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--annotation-accent-fill,rgba(138,122,176,.11))] px-2.5 py-1 text-[12px] tracking-[0.02em] text-[color:var(--annotation-accent,#a99af5)] transition-colors disabled:cursor-default disabled:opacity-50" onClick={onApply}>{applying ? "running…" : "Apply"}</button>
		</div>
	</div>;
}

function newAnnotationId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `docs-lab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function GroupHeader({ label }: { label: string }) {
	return <div className="px-1.5 pb-0.5 pt-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))] first:pt-0.5">{label}</div>;
}

function QueueRow({ entry, session, onFocusTarget, onHoverTarget, labelForTarget }: { entry: QueueEntry; session: DocEditSession; onFocusTarget?: (target: DocEditTarget) => void; onHoverTarget?: (target: DocEditTarget | null) => void; labelForTarget: (target: DocEditTarget) => string }) {
	const { request } = entry;
	const replyRef = useRef<HTMLInputElement | null>(null);
	const target = request.target.kind === "doc" ? null : request.target;
	const waiting = request.status === "waiting";
	const stateLabel = entry.staged ? "staged" : entry.processing ? "processing" : waiting ? STATUS_LABEL.waiting : "";
	const sendReply = () => {
		const body = replyRef.current?.value.trim() ?? "";
		if (!body || !session.onReplyToRequest) return;
		void session.onReplyToRequest(request.alias, body);
		if (replyRef.current) replyRef.current.value = "";
	};
	return <div data-docs-lab-session-card={request.alias} className={`group rounded-[var(--radius,0.375rem)] border-l-2 px-1.5 py-1 transition-colors ${entry.processing || waiting ? "border-transparent" : "border-transparent hover:bg-white/[0.03]"} ${target ? "cursor-pointer" : ""}`} style={entry.processing ? { borderLeftColor: "var(--annotation-accent,#8a7ab0)", background: "var(--annotation-accent-fill,rgba(138,122,176,.11))" } : waiting ? { borderLeftColor: "color-mix(in srgb, var(--annotation-thread-accent,#f59e0b) 60%, transparent)" } : undefined} onMouseEnter={() => { if (target) onHoverTarget?.(target); }} onMouseLeave={() => onHoverTarget?.(null)} onClick={(event) => { if (event.target instanceof HTMLElement && event.target.closest("button, input")) return; if (target) onFocusTarget?.(target); }}>
		<div className="flex items-baseline gap-2">
			<span data-docs-lab-card-target={request.alias} className="min-w-0 truncate text-[12px] text-[color:var(--annotation-accent,#a99af5)]">{request.target.kind === "doc" ? "document" : labelForTarget(request.target)}</span>
			{entry.processing && <span aria-hidden className="h-[5px] w-[5px] shrink-0 self-center rounded-full bg-[color:var(--annotation-accent,#8a7ab0)]" />}
			<span data-docs-lab-card-state={request.alias} className="ml-auto shrink-0 text-[10px] tracking-[0.04em]" style={{ color: entry.staged ? "var(--annotation-accept,#3fb950)" : entry.processing ? "var(--annotation-accent,#a99af5)" : waiting ? "var(--annotation-thread-accent,#f59e0b)" : undefined }}>{stateLabel}</span>
			{session.onDismissRequest && !entry.processing && !entry.staged && <button type="button" aria-label={`Dismiss ${request.alias}`} title={`Dismiss ${request.alias} — removes it from the queue`} className="shrink-0 text-[12px] leading-none text-[color:transparent] transition-colors group-hover:text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))] hover:!text-[color:var(--annotation-reject,#f85149)]" onClick={() => void session.onDismissRequest?.(request.id)}>✕</button>}
		</div>
		<p className="mt-0.5 pl-4 text-[13px] leading-[1.55] text-[color:var(--foreground,#e4e4e7)]">{request.body}</p>
		{entry.conflict && <p data-docs-lab-card-conflict={request.alias} title="An accepted change touched this block after the note was filed." className="mt-0.5 text-[11px] text-[color:var(--annotation-thread-accent,#f59e0b)]">target changed since filed</p>}
		{request.thread.length > 0 && <div className="mt-1 border-l-2 border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] pl-2">{request.thread.map((message) => <p key={message.id} className="mb-0.5 text-[12px] leading-[1.5]"><span className={message.author === "agent" ? "text-teal-400 text-[11px]" : "text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]"}>{message.author} · </span><span className="text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]">{message.body}</span></p>)}</div>}
		{waiting && session.onReplyToRequest && <div className="mt-1 flex gap-1.5"><input ref={replyRef} aria-label={`Reply to unblock ${request.alias}`} placeholder={`Reply to unblock ${request.alias}…`} className="min-w-0 flex-1 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--background,#181818)] px-2 py-1 text-[12px] outline-none focus:border-[color:var(--annotation-thread-accent,#f59e0b)]" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); sendReply(); } }} /><button type="button" aria-label={`Rail reply to ${request.alias}`} className="rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-2 py-0.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]" onClick={sendReply}>Reply</button></div>}
	</div>;
}

function RecordRow({ record, session, onFocusTarget, labelForTarget }: { record: RecordEntry; session: DocEditSession; onFocusTarget?: (target: DocEditTarget) => void; labelForTarget: (target: DocEditTarget) => string }) {
	const { request } = record;
	const target = request.target.kind === "doc" ? null : request.target;
	const undoReason = undoDisabledReason(session, request.alias);
	return <div data-docs-lab-session-record={request.alias} data-docs-lab-record-state={record.stateLabel} className={`flex items-baseline gap-2 px-1.5 py-0.5 text-[12px] leading-[1.55] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))] ${target ? "cursor-pointer hover:text-[color:var(--foreground,#e4e4e7)]" : ""}`} title={request.body} onClick={(event) => { if (event.target instanceof HTMLElement && event.target.closest("button")) return; if (target) onFocusTarget?.(target); }}>
		<span aria-hidden style={{ color: record.ok ? "var(--annotation-accept,#3fb950)" : "var(--annotation-reject,#f85149)" }}>{record.ok ? "✓" : "✕"}</span><span>{request.alias}</span><span className="opacity-40">·</span><span className="min-w-0 truncate">{target ? labelForTarget(target) : "document"}</span><span className="opacity-40">·</span><span className="text-[11px] opacity-60">{record.stateLabel}</span>
		{request.status === "applied" && session.onUndo && <button type="button" aria-label={`Undo ${request.alias}`} disabled={undoReason !== null} title={undoReason ?? `Undo ${request.alias}`} data-docs-lab-record-undo={request.id} className="ml-auto rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void session.onUndo?.(request.alias)}>Undo</button>}
	</div>;
}
