import { useCallback } from "react";
import type { AnnotationTarget } from "@codecaine-ai/docs-model/annotations-schema";
import type { DocEditSession } from "@codecaine-ai/docs-viewer/lab";
import { addAnnotation, addAnnotationReply, resolveAnnotation } from "../../../data/api";
import { errorMessage } from "./error-message";
import type { DocLabActionContext } from "./types";

export function useDocLabRequestActions(context: DocLabActionContext) {
	const { options, path, doc, requestsRef, clearAliasError, setAliasError, annotationsHashRef, refreshBundleRef, refetchProposalsRef } = context;
	const onFileRequest = useCallback(async (filing: Parameters<NonNullable<DocEditSession["onFileRequest"]>>[0]) => {
		const target: AnnotationTarget = filing.target.kind === "doc"
			? (() => {
				if (!doc?.root) {
					throw new Error("Cannot file a document-level request without a loaded document.");
				}
				return { kind: "block", blockId: doc.root } as const;
			})()
			: filing.target.kind === "block"
				? { kind: "block", blockId: filing.target.blockId }
				: { ...filing.target };
		try {
			await addAnnotation(path, {
				target,
				body: filing.body,
				intent: "agent-request",
				author: "you",
				expectedHash: annotationsHashRef.current,
			});
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			await refreshBundleRef.current();
			void refetchProposalsRef.current();
			throw error;
		}
	}, [path, doc?.root]);

	const onReplyToRequest = useCallback(async (alias: string, body: string) => {
		const request = requestsRef.current.find((row) => row.alias === alias);
		if (!request?.annotationId) throw new Error(`Request ${alias} has no annotation.`);
		if (options.kernelSession?.live()) {
			const result = await options.kernelSession.reply(request.annotationId, body);
			if (result.ok) {
				clearAliasError(alias);
				await refreshBundleRef.current();
				await refetchProposalsRef.current();
				return;
			}
			if (!result.miss) {
				setAliasError(alias, result.message);
				return;
			}
		}
		try {
			await addAnnotationReply(path, request.annotationId, body, annotationsHashRef.current);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			await refreshBundleRef.current();
			void refetchProposalsRef.current();
			throw error;
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	const onDismissRequest = useCallback(async (requestId: string) => {
		const request = requestsRef.current.find((row) => row.id === requestId);
		if (!request?.annotationId) return;
		const { alias, annotationId } = request;
		if (options.kernelSession?.live()) {
			const status = options.kernelSession.statusOverlay().get(annotationId);
			if (
				status !== undefined &&
				status !== "applied" &&
				status !== "declined" &&
				status !== "resolved" &&
				status !== "failed"
			) {
				setAliasError(alias, "This note is part of the running session — it can't be removed right now.");
				return;
			}
		}
		try {
			await resolveAnnotation(path, annotationId, undefined, "Dismissed from the queue.");
			clearAliasError(alias);
			await refreshBundleRef.current();
			await refetchProposalsRef.current();
		} catch (error) {
			setAliasError(alias, errorMessage(error));
		}
	}, [path, options.kernelSession, clearAliasError, setAliasError]);

	return { onFileRequest, onReplyToRequest, onDismissRequest };
}
