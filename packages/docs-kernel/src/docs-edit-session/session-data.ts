/**
 * Session data consumed by the docs-lab-editor bundle.
 *
 * The bundle deliberately seeds only the target path and task notes; document
 * content and the live queue are served by the host-bound session tools.
 */
export interface DocsEditSessionData {
  targetDocPath: string;
  taskNotes: string[];
}

export interface DocsEditSessionDataSource {
  path: string;
  instruction?: string;
}

export function sessionDataForDocsEditSession(
  session: DocsEditSessionDataSource,
): DocsEditSessionData {
  return {
    targetDocPath: session.path,
    taskNotes: session.instruction ? [session.instruction] : [],
  };
}
