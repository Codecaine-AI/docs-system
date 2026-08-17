import { ApiError } from "../data/api";

export type ChangesetAction = "accept" | "reject" | "undo";

const FALLBACK_MESSAGES: Record<ChangesetAction, string> = {
	accept: "The change-set could not be accepted — try again.",
	reject: "The change-set could not be declined — try again.",
	undo: "The change-set could not be undone — refresh, then try again.",
};

/** Translate change-set wire failures into one actionable sentence for the card. */
export function changesetFailureMessage(error: unknown, action: ChangesetAction): string {
	if (!(error instanceof ApiError)) return FALLBACK_MESSAGES[action];

	const rolledBack = error.payload?.rolled_back === true;
	const unchanged = rolledBack ? " No documents were changed." : "";
	if (error.message === "stale-proposal") {
		return `One document changed since staging — refresh to restage.${unchanged}`;
	}
	if (error.status === 423) {
		return `A document is locked by another editing session — wait for it to finish, then try again.${unchanged}`;
	}
	if (error.status === 409) {
		return `This change-set is no longer open — refresh to see its current status.${unchanged}`;
	}
	if (action === "undo" && error.status === 404) {
		return "This change-set can no longer be undone — refresh to update its status.";
	}
	return FALLBACK_MESSAGES[action];
}
