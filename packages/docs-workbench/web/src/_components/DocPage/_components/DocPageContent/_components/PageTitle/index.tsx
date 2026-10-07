import type { RefObject } from "react";
import { docTitleFromPath } from "../../../../../../shared/doc-title";

export type PageTitleProps = {
  path: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  isStatic: boolean;
  revertTitleRef: RefObject<boolean>;
  commitTitleEdit: () => Promise<void>;
};

export function PageTitle({ path, titleRef, isStatic, revertTitleRef, commitTitleEdit }: PageTitleProps) {
  return (
            <div className="w-full max-w-[var(--style-content-width,var(--ds-layout-lane-text))] text-[length:var(--style-font-size,var(--ds-font-size-reading))]">
            <h1
              key={path}
              ref={titleRef}
              className="docs-page-title"
              contentEditable={!isStatic}
              suppressContentEditableWarning
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  revertTitleRef.current = true;
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => void commitTitleEdit()}
            >
              {docTitleFromPath(path)}
            </h1>
            </div>
  );
}
