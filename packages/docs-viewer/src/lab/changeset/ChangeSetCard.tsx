"use client";

// Slice: changeset

import {
	acceptDisabledReason,
	changesetDocRows,
	changesetEntryChip,
	changesetProgressLabel,
	changesetTreeOpRows,
	rejectDisabledReason,
	undoAvailable,
	type DocChangeSetView,
} from "./changeset-model";

export interface ChangeSetCardProps {
	changeset: DocChangeSetView;
	/** The document currently open in the host viewer. */
	openDocPath?: string;
	busy?: "accepting" | "rejecting" | "undoing" | null;
	error?: string | null;
	onAccept?: () => void | Promise<void>;
	onReject?: () => void | Promise<void>;
	onUndo?: () => void | Promise<void>;
	onOpenDoc?: (docPath: string) => void;
}

const actionClassName = "rounded-[var(--radius,0.375rem)] border border-[color:var(--docs-panel-border,var(--border,#2b2b2b))] bg-transparent px-2 py-0.5 text-[12px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))] disabled:cursor-not-allowed disabled:opacity-40";

/** A compact, host-wired summary of a proposed multi-document change. */
export function ChangeSetCard({
	changeset,
	openDocPath,
	busy = null,
	error = null,
	onAccept,
	onReject,
	onUndo,
	onOpenDoc,
}: ChangeSetCardProps) {
	const docRows = changesetDocRows(changeset);
	const treeOpRows = changesetTreeOpRows(changeset);
	const progressLabel = changesetProgressLabel(changeset);
	const acceptReason = acceptDisabledReason(changeset);
	const rejectReason = rejectDisabledReason(changeset);
	const isOpen = changeset.status === "open";
	const isBusy = busy !== null;
	const acceptLabel = busy === "accepting" ? "Accepting…" : "Accept";
	const rejectLabel = busy === "rejecting" ? "Rejecting…" : "Reject";
	const undoLabel = busy === "undoing" ? "Undoing…" : "Undo change-set";

	return (
		<section
			data-docs-lab-changeset={changeset.id}
			className="flex flex-col gap-2 rounded-[var(--radius,0.5rem)] border px-2.5 py-2"
			style={{
				maxWidth: 560,
				background: "var(--docs-panel-raise,var(--background,#232323))",
				borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))",
			}}
		>
			<header className="flex min-w-0 items-center gap-2">
				<span
					data-docs-lab-changeset-status={changeset.status}
					className="shrink-0 rounded-[var(--radius,0.375rem)] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
					style={{
						color: changeset.status === "applied" ? "var(--annotation-accept,#3fb950)" : changeset.status === "declined" ? "var(--annotation-reject,#f85149)" : "var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))",
						borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))",
					}}
				>
					{changeset.status}
				</span>
				<span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--foreground,#e4e4e7)]">{changeset.summary}</span>
				{progressLabel && <span className="shrink-0 text-[10px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]">{progressLabel}</span>}
			</header>

			{docRows.length > 0 && <div className="flex flex-col gap-1" aria-label="Changed documents">
				{docRows.map((row) => {
					const chip = changesetEntryChip(row);
					const chipTone = chip?.state === "stale"
						? "border-[color:var(--annotation-thread-accent,#d29922)] text-[color:var(--annotation-thread-accent,#d29922)]"
						: chip?.state === "accepted"
							? "border-[color:var(--annotation-accept,#3fb950)] text-[color:var(--annotation-accept,#3fb950)]"
							: "border-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]";
					return <button
					key={row.proposalId}
					type="button"
					data-docs-lab-changeset-row={row.docPath}
					aria-current={row.docPath === openDocPath ? "true" : undefined}
					className="flex min-w-0 items-center gap-1.5 rounded-[var(--radius,0.375rem)] border px-2 py-1 text-left text-[11px] hover:bg-[color:var(--docs-panel-hover,rgba(127,127,127,.12))]"
					style={{ borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))" }}
					onClick={() => onOpenDoc?.(row.docPath)}
				>
					<span className="min-w-0 flex-1 truncate text-[color:var(--foreground,#e4e4e7)]">{row.displayName}</span>
					<span className="shrink-0" style={{ color: "var(--annotation-accept,#3fb950)" }}>+{row.addCount}</span>
					<span className="shrink-0" style={{ color: "var(--annotation-reject,#f85149)" }}>−{row.delCount}</span>
					{chip && <span data-docs-lab-changeset-entry-state={chip.state} data-docs-lab-changeset-stale={chip.state === "stale" ? "" : undefined} title={chip.title} className={`shrink-0 rounded-[var(--radius,0.375rem)] border px-1 text-[10px] ${chipTone}`}>{chip.label}</span>}
				</button>;
				})}
			</div>}

			{treeOpRows.length > 0 && <div className="flex flex-col gap-0.5 border-t pt-1.5 text-[11px] text-[color:var(--docs-muted-foreground,var(--muted-foreground,#a1a1aa))]" style={{ borderColor: "var(--docs-panel-border,var(--border,#2b2b2b))" }}>
				{treeOpRows.map((row) => <div key={row.key} data-docs-lab-changeset-treeop>{row.label}</div>)}
			</div>}

			{error && <p data-docs-lab-changeset-error className="text-[11px]" style={{ color: "var(--annotation-reject,#f85149)" }}>{error}</p>}

			{isOpen && <footer className="flex justify-end gap-1.5">
				<button type="button" aria-label="Reject change-set" disabled={isBusy || rejectReason !== null} title={isBusy ? "Change-set action in progress" : rejectReason ?? "Reject change-set"} className={actionClassName} onClick={() => void onReject?.()}>{rejectLabel}</button>
				<button type="button" aria-label="Accept change-set" disabled={isBusy || acceptReason !== null} title={isBusy ? "Change-set action in progress" : acceptReason ?? "Accept change-set"} className="rounded-[var(--radius,0.375rem)] bg-[color:var(--annotation-accept,#3fb950)] px-3 py-0.5 text-[12px] font-semibold text-[color:var(--docs-action-on-accept,#06210d)] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => void onAccept?.()}>{acceptLabel}</button>
			</footer>}
			{undoAvailable(changeset) && <footer className="flex justify-end"><button type="button" data-docs-lab-changeset-undo aria-label="Undo change-set" disabled={isBusy} title={isBusy ? "Change-set action in progress" : "Undo change-set"} className={actionClassName} onClick={() => void onUndo?.()}>{undoLabel}</button></footer>}
		</section>
	);
}
