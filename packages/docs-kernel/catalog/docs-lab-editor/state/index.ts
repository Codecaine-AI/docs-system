/**
 * Section ③ — the Docs Lab editor's live session aim.
 *
 * The docs-edit launcher supplies the active document path and optional task
 * note through sessionData. Document content and the request queue stay live
 * behind session tools rather than being cached in kernel state.
 */
import { defineState } from "@agent-kernel/kernel/agent-definition";
import type { SpawnContext } from "@agent-kernel/kernel/context";
import {
	kernelStateMessage,
	renderRollingWindow,
	type RenderContext,
	type RenderResult,
	type SessionEvent,
} from "@agent-kernel/kernel/state";

/** JSON-serializable state snapshotted by the kernel. */
export interface DocsLabEditorState {
	/** Document bundle path currently open in the Lab. */
	targetDocPath: string;
	/** Session instructions accumulated by the launcher, oldest first. */
	taskNotes: string[];
}

function seed(
	ctx: SpawnContext,
	prior?: DocsLabEditorState,
): DocsLabEditorState {
	if (prior) {
		return {
			targetDocPath: prior.targetDocPath,
			taskNotes: [...prior.taskNotes],
		};
	}
	const target = ctx.sessionData?.targetDocPath;
	const notes = ctx.sessionData?.taskNotes;
	return {
		targetDocPath:
			typeof target === "string" && target.length > 0 ? target : "(unset)",
		taskNotes: Array.isArray(notes)
			? notes.filter((note): note is string => typeof note === "string")
			: [],
	};
}

/** Session tools own queue/proposal mutations, so v1 state is pass-through. */
function update(
	state: DocsLabEditorState,
	_event: SessionEvent,
): DocsLabEditorState {
	return state;
}

function render(state: DocsLabEditorState, ctx: RenderContext): RenderResult {
	const notes =
		state.taskNotes.length > 0
			? state.taskNotes.map((note) => `- ${note}`).join("\n")
			: "(no notes yet)";
	const body = [
		`<docs_lab_editor_state target="${state.targetDocPath}">`,
		notes,
		"</docs_lab_editor_state>",
	].join("\n");
	const tail = renderRollingWindow(ctx);
	return {
		messages: [kernelStateMessage(body), ...tail.messages],
		stateMessageCount: 1 + (tail.stateMessageCount ?? 0),
	};
}

export const state = defineState<DocsLabEditorState>({ seed, update, render });
export default state;
