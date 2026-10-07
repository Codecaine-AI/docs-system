import { InlineThreadBar, type DocEditRequest } from "@codecaine-ai/docs-viewer/lab";
import type { DocLabSessionResult } from "../../types";

export type ThreadBarsProps = { request: DocEditRequest; lab: DocLabSessionResult };

export function ThreadBars({ request, lab }: ThreadBarsProps) {
      const latestAgent = [...request.thread]
        .reverse()
        .find((message) => message.author === "agent");
      return (
        <div className="mb-2">
          <InlineThreadBar
            alias={request.alias}
            message={latestAgent?.body ?? request.body}
            onReply={(body) =>
              void lab.session.onReplyToRequest?.(request.alias, body)
            }
          />
        </div>
      );
}
