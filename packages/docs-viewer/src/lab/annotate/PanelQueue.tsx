// Slice: the AI panel's queue — a CHAT PANEL, same shape as prompt-kit's
// PanelQueue:
//
//   TOP BAR     pinned: Open/Done filters plus agent status.
//   TRANSCRIPT  scrolls: open TARGET/DOCUMENT notes or closed-loop ✓/✕
//               records, then any host-provided tail. Filing order holds
//               within each section.
//   DOCK        pinned at the very bottom, chat-composer position: the
//               whole-document input plus Run queue. Enter files a document
//               note; Run queue is click-only — a keystroke never starts the
//               batch by accident.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	undoDisabledReason,
	type DocEditSession,
	type DocEditTarget,
} from "../session/doc-edit-session";
import type { QueueEntry, RecordEntry, RequestQueueModel } from "../session/request-queue";

export interface PanelQueueProps {
	session: DocEditSession;
	queue: RequestQueueModel;
	applying: boolean;
	/** Current docs-agent connectivity/run state, always shown in the top bar. */
	agentStatus: "connected" | "offline" | "running";
	/** Session-level create/stream failure, already mapped for display by the host. */
	sessionError?: string | null;
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
	/** Transcript tail: host content (threads, errors) that scrolls WITH the
	 * chat — never below the composer dock. */
	children?: ReactNode;
}

/** Queue rail, chat-shaped: scrolling transcript (block notes, document
 * notes, closed-loop records, host tail) over a pinned composer dock
 * (whole-document input + Run queue). */
export function PanelQueue({ session, queue, applying, agentStatus, sessionError, applyDisabledReason, onApply, onFileGlobal, onFocusTarget, onHoverTarget, labelForTarget, children }: PanelQueueProps) {
	const docInputRef = useRef<HTMLInputElement | null>(null);
	const [view, setView] = useState<"open" | "done">("open");
	const sendDocMessage = () => {
		const body = docInputRef.current?.value.trim() ?? "";
		if (!body) return;
		if (onFileGlobal) onFileGlobal(body);
		else if (session.onFileRequest) void session.onFileRequest({ annotationId: newAnnotationId(), target: { kind: "doc" }, body, disposition: "global" });
		else return;
		setView("open");
		if (docInputRef.current) docInputRef.current.value = "";
	};
	const documentEntries = queue.queue.filter((entry) => entry.disposition === "global");
	const targetEntries = queue.queue.filter((entry) => entry.disposition !== "global");
	const documentRecords = queue.records.filter((record) => record.disposition === "global");
	const targetRecords = queue.records.filter((record) => record.disposition !== "global");
	const queuedCount = queue.queue.filter((entry) => !entry.staged).length;
	const runLabel = queuedCount > 0 ? `Run queue (${queuedCount})` : "Run queue";
	const renderRow = (entry: QueueEntry) => <QueueRow key={entry.request.alias} entry={entry} session={session} onFocusTarget={onFocusTarget} onHoverTarget={onHoverTarget} labelForTarget={labelForTarget} />;
	const showDocInput = Boolean(onFileGlobal ?? session.onFileRequest);
	return <div className="flex h-full min-h-0 flex-col" data-docs-lab-session-rail="">
		<div data-docs-lab-queue-top-bar="" className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-1.5 pb-2">
			<div className="flex gap-1">
				<FilterButton active={view === "open"} filter="open" onClick={() => setView("open")}>Open ({queue.queue.length})</FilterButton>
				<FilterButton active={view === "done"} filter="done" onClick={() => setView("done")}>Done ({queue.records.length})</FilterButton>
			</div>
			<AgentStatus status={agentStatus} />
		</div>
		{/* THE TRANSCRIPT — everything filed, top-down like a chat; the dock
		    stays put below while this scrolls. */}
		<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
			{view === "open" ? <>
				<GroupHeader label="Targets" />
				{targetEntries.length > 0 ? targetEntries.map(renderRow) : <EmptyGroup />}
				<GroupHeader label="Document" />
				{documentEntries.length > 0 ? documentEntries.map(renderRow) : <EmptyGroup />}
			</> : <>
				<GroupHeader label="Targets" />
				{targetRecords.length > 0 ? targetRecords.map((record) => <RecordRow key={record.request.alias} record={record} session={session} onFocusTarget={onFocusTarget} labelForTarget={labelForTarget} />) : <EmptyGroup />}
				<GroupHeader label="Document" />
				{documentRecords.length > 0 ? documentRecords.map((record) => <RecordRow key={record.request.alias} record={record} session={session} onFocusTarget={onFocusTarget} labelForTarget={labelForTarget} />) : <EmptyGroup />}
			</>}
			{sessionError ? <p data-docs-lab-session-error="" role="alert" className="px-1.5 py-1 text-xs text-[color:var(--destructive,#f85149)]">{sessionError}</p> : null}
			{children}
		</div>
		{/* THE DOCK — chat-composer position, pinned bottommost: the
		    whole-document input plus Run queue. Enter files a note; only a click
		    runs the batch. */}
		<div data-docs-lab-queue-dock="" className="mt-2 flex shrink-0 flex-col gap-2">
			<div data-docs-lab-queue-dock-input="" className="flex border-t border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] pt-2.5">
				{showDocInput && <input ref={docInputRef} aria-label="Message the whole document" placeholder="Note about the whole document…" className="min-w-0 w-full rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--background,#181818)] px-2 py-1.5 text-[13px] outline-none focus:border-[color:var(--annotation-accent,#a99af5)]" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); sendDocMessage(); } }} />}
			</div>
			<div data-docs-lab-queue-dock-run="" className="flex justify-end">
				<button type="button" aria-label="Apply queue" data-docs-lab-queue-apply="" disabled={applying || (applyDisabledReason !== null && applyDisabledReason !== undefined) || !queue.canApply} title={applyDisabledReason ?? (applying ? "The queue is running" : queue.canApply ? "Run the queued notes" : "Nothing queued")} className="shrink-0 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--annotation-accent-fill,rgba(138,122,176,.11))] px-2.5 py-1 text-[12px] tracking-[0.02em] text-[color:var(--annotation-accent,#a99af5)] transition-colors disabled:cursor-default disabled:opacity-50" onClick={onApply}>{applying ? "running…" : runLabel}</button>
			</div>
		</div>
	</div>;
}

function FilterButton({ active, filter, onClick, children }: { active: boolean; filter: "open" | "done"; onClick: () => void; children: ReactNode }) {
	return <button type="button" data-docs-lab-filter={filter} aria-pressed={active} className="rounded-[var(--radius,0.375rem)] border bg-[color:var(--background,#181818)] px-2 py-0.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))] transition-colors" style={active ? { borderColor: "var(--annotation-accent,#a99af5)", color: "var(--annotation-accent,#a99af5)" } : { borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))" }} onClick={onClick}>{children}</button>;
}

const AGENT_STATUS_COPY = {
	connected: { label: "connected", title: "Docs agent connected" },
	offline: { label: "not connected", title: "Docs agent not connected" },
	running: { label: "session running", title: "Docs agent session running" },
} as const;

function AgentStatus({ status }: { status: PanelQueueProps["agentStatus"] }) {
	const copy = AGENT_STATUS_COPY[status];
	const color = status === "offline"
		? "var(--docs-muted-foreground,var(--muted-foreground,#71717a))"
		: status === "running"
			? "var(--annotation-accent,#a99af5)"
			: "var(--annotation-accept,#3fb950)";
	return <span data-docs-lab-agent-status={status} title={copy.title} className="flex shrink-0 items-center gap-1 text-[10px] tracking-[0.03em]" style={{ color }}>
		<span aria-hidden className={`h-[5px] w-[5px] rounded-full bg-current ${status === "running" ? "animate-pulse" : ""}`} />
		{copy.label}
	</span>;
}

function newAnnotationId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `docs-lab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function GroupHeader({ label }: { label: string }) {
	return <div className="px-1.5 pb-0.5 pt-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))] first:pt-0.5">{label}</div>;
}

function EmptyGroup() {
	return <div className="px-1.5 py-0.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]">empty</div>;
}

function QueueRow({ entry, session, onFocusTarget, onHoverTarget, labelForTarget }: { entry: QueueEntry; session: DocEditSession; onFocusTarget?: (target: DocEditTarget) => void; onHoverTarget?: (target: DocEditTarget | null) => void; labelForTarget: (target: DocEditTarget) => string }) {
	const { request } = entry;
	const replyRef = useRef<HTMLInputElement | null>(null);
	const target = request.target.kind === "doc" ? null : request.target;
	const waiting = request.status === "waiting";
	const [threadOpen, setThreadOpen] = useState(waiting);
	const previousWaitingRef = useRef(waiting);
	useEffect(() => {
		if (!previousWaitingRef.current && waiting) setThreadOpen(true);
		previousWaitingRef.current = waiting;
	}, [waiting]);
	const stateLabel = entry.staged ? "staged" : entry.processing ? "processing" : "";
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
		<div className="mt-1"><MessageBubble author="user" body={request.body} /></div>
		{entry.conflict && <p data-docs-lab-card-conflict={request.alias} title="An accepted change touched this block after the note was filed." className="mt-0.5 text-[11px] text-[color:var(--annotation-thread-accent,#f59e0b)]">target changed since filed</p>}
		<ReplyDisclosure alias={request.alias} thread={request.thread} open={threadOpen} onToggle={() => setThreadOpen((open) => !open)} />
		{waiting && session.onReplyToRequest && <div className="mt-1 flex gap-1.5"><input ref={replyRef} aria-label={`Reply to unblock ${request.alias}`} placeholder={`Reply to unblock ${request.alias}…`} className="min-w-0 flex-1 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--background,#181818)] px-2 py-1 text-[12px] outline-none focus:border-[color:var(--annotation-thread-accent,#f59e0b)]" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); sendReply(); } }} /><button type="button" aria-label={`Rail reply to ${request.alias}`} className="rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-2 py-0.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]" onClick={sendReply}>Reply</button></div>}
	</div>;
}

function RecordRow({ record, session, onFocusTarget, labelForTarget }: { record: RecordEntry; session: DocEditSession; onFocusTarget?: (target: DocEditTarget) => void; labelForTarget: (target: DocEditTarget) => string }) {
	const { request } = record;
	const target = request.target.kind === "doc" ? null : request.target;
	const undoReason = undoDisabledReason(session, request.alias);
	const [threadOpen, setThreadOpen] = useState(false);
	return <div data-docs-lab-session-record={request.alias} data-docs-lab-record-state={record.stateLabel} className={`rounded-[var(--radius,0.375rem)] px-1.5 py-1 text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))] ${target ? "cursor-pointer hover:bg-white/[0.03]" : ""}`} onClick={(event) => { if (event.target instanceof HTMLElement && event.target.closest("button")) return; if (target) onFocusTarget?.(target); }}>
		<div className="flex items-baseline gap-2 text-[12px] leading-[1.55]">
			<span className="min-w-0 truncate text-[color:var(--annotation-accent,#a99af5)]">{target ? labelForTarget(target) : "document"}</span>
			<span className="ml-auto shrink-0" style={{ color: record.ok ? "var(--annotation-accept,#3fb950)" : "var(--annotation-reject,#f85149)" }}><span aria-hidden>{record.ok ? "✓" : "✕"}</span> {record.stateLabel}</span>
			{request.status === "applied" && session.onUndo && <button type="button" aria-label={`Undo ${request.alias}`} disabled={undoReason !== null} title={undoReason ?? `Undo ${request.alias}`} data-docs-lab-record-undo={request.id} className="shrink-0 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void session.onUndo?.(request.alias)}>Undo</button>}
		</div>
		<div className="mt-1"><MessageBubble author="user" body={request.body} /></div>
		{request.note?.trim() ? <p data-docs-lab-record-note={request.alias} className="mt-0.5 truncate text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]">{request.note}</p> : null}
		<ReplyDisclosure alias={request.alias} thread={request.thread} open={threadOpen} onToggle={() => setThreadOpen((open) => !open)} />
	</div>;
}

function ReplyDisclosure({ alias, thread, open, onToggle }: { alias: string; thread: RecordEntry["request"]["thread"]; open: boolean; onToggle: () => void }) {
	if (thread.length === 0) return null;
	return <div className="mt-1">
		<button type="button" data-docs-lab-thread-toggle={alias} aria-expanded={open} className="px-0.5 py-0.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#71717a))]" onClick={onToggle}>{open ? "▾" : "▸"} {thread.length} {thread.length === 1 ? "reply" : "replies"}</button>
		{open && <div className="mt-1 flex flex-col gap-1.5">{thread.map((message) => <MessageBubble key={message.id} author={message.author} body={message.body} />)}</div>}
	</div>;
}

function MessageBubble({ author, body }: { author: "user" | "agent"; body: string }) {
	const user = author === "user";
	return <div data-docs-lab-msg={author} className={`flex flex-col ${user ? "ml-auto items-end" : "mr-auto items-start"} max-w-[85%]`} aria-label={user ? `you: ${body}` : undefined}>
		{user ? <span className="sr-only">you</span> : <span className="mb-0.5 px-1 text-[10px] tracking-[0.08em] text-[color:var(--annotation-agent-accent,#2dd4bf)]">agent</span>}
		<div className={`rounded-[var(--radius,0.375rem)] px-2.5 py-1.5 text-[13px] leading-[1.45] text-[color:var(--foreground,#e4e4e7)] ${user ? "bg-[color:var(--annotation-accent-fill,rgba(138,122,176,.11))]" : "bg-[color:var(--docs-panel-raise,var(--background,#232323))]"}`}>{body}</div>
	</div>;
}
