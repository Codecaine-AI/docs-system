"use client";

import { useRef } from "react";

/** A compact request alias. Agent-authored aliases use the amber thread tone. */
export function AliasChip({
	alias,
	author,
}: {
	alias: string;
	author?: "user" | "agent";
}) {
	const agent = author === "agent";
	return (
		<span
			data-docs-lab-alias={alias}
			className="rounded-[var(--radius,0.375rem)] border px-1 text-[10px] font-bold"
			style={{
				color: agent
					? "var(--annotation-thread-accent,#d29922)"
					: "var(--annotation-accent,#58a6ff)",
				borderColor: agent
					? "color-mix(in srgb, var(--annotation-thread-accent,#d29922) 45%, transparent)"
					: "color-mix(in srgb, var(--annotation-accent,#58a6ff) 40%, transparent)",
			}}
		>
			{alias}
		</span>
	);
}

export interface ProposalActionBarProps {
	alias: string;
	author?: "user" | "agent";
	summary: string;
	/** Non-null disables Accept and is its tooltip. */
	acceptDisabledReason: string | null;
	/** Non-null disables Reject and is its tooltip. */
	rejectDisabledReason: string | null;
	onAccept: () => void;
	onReject: () => void;
}

/** Action furniture above a staged document region. */
export function ProposalActionBar({
	alias,
	author,
	summary,
	acceptDisabledReason,
	rejectDisabledReason,
	onAccept,
	onReject,
}: ProposalActionBarProps) {
	return (
		<div
			data-docs-lab-proposal-bar={alias}
			className="flex items-center gap-2.5 rounded-[var(--radius,0.5rem)] border px-2.5 py-1"
			style={{
				maxWidth: 560,
				background: "var(--docs-panel-raise,var(--background,#232323))",
				borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))",
			}}
		>
			<AliasChip alias={alias} author={author} />
			<span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]">
				{summary}
			</span>
			<button type="button" aria-label={`Reject ${alias}`} disabled={rejectDisabledReason !== null} title={rejectDisabledReason ?? `Reject ${alias}`} className="rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-transparent px-2 py-0.5 text-[12px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))] disabled:cursor-not-allowed disabled:opacity-40" onClick={onReject}>
				Reject
			</button>
			<button type="button" aria-label={`Accept ${alias}`} disabled={acceptDisabledReason !== null} title={acceptDisabledReason ?? `Accept ${alias}`} className="rounded-[var(--radius,0.375rem)] bg-[color:var(--annotation-accept,#3fb950)] px-3 py-0.5 text-[12px] font-semibold text-[#06210d] disabled:cursor-not-allowed disabled:opacity-40" onClick={onAccept}>
				Accept
			</button>
		</div>
	);
}

export interface InlineThreadBarProps {
	alias: string;
	author?: "user" | "agent";
	/** The latest agent question, or the request body. */
	message: string;
	onReply: (body: string) => void;
}

/** Amber waiting-on-human bar, rendered in document flow above its target. */
export function InlineThreadBar({ alias, author, message, onReply }: InlineThreadBarProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const send = () => {
		const body = inputRef.current?.value.trim() ?? "";
		if (!body) return;
		onReply(body);
		if (inputRef.current) inputRef.current.value = "";
	};
	return (
		<div data-docs-lab-thread-bar={alias} className="flex flex-col gap-1.5 rounded-[var(--radius,0.5rem)] border border-l-[3px] py-1.5 pl-2.5 pr-2.5" style={{ maxWidth: 560, background: "var(--docs-panel-raise,var(--background,#232323))", borderColor: "color-mix(in srgb, var(--annotation-thread-accent,#d29922) 45%, transparent)" }}>
			<div className="flex items-baseline gap-2">
				<AliasChip alias={alias} author={author} />
				<span className="min-w-0 flex-1 text-[12px] leading-snug text-[color:var(--foreground,#e4e4e7)]">{message}</span>
			</div>
			<div className="flex gap-1.5">
				<input ref={inputRef} placeholder={`Reply to ${alias}…`} aria-label={`Reply to ${alias}`} className="min-w-0 flex-1 rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-[color:var(--docs-panel-input-bg,var(--background,#141414))] px-2 py-1 text-[12px] text-[color:var(--foreground,#e4e4e7)] outline-none" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); send(); } event.stopPropagation(); }} />
				<button type="button" aria-label={`Send reply to ${alias}`} className="rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] px-2.5 py-0.5 text-[12px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]" onClick={send}>Reply</button>
			</div>
		</div>
	);
}
