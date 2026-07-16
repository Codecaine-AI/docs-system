import type { DocBlockDescriptor } from "../../render/block-registry";
import { calloutDescriptor } from "./callout";
import { dividerDescriptor } from "./divider";
import { headingDescriptor } from "./heading";
import { imageDescriptor } from "./image";
import { listItemDescriptor } from "./list-item";
import { paragraphDescriptor } from "./paragraph";
import { quoteDescriptor } from "./quote";
import { videoDescriptor } from "./video";

/**
 * Aggregator for the rich-text component's read-surface descriptors — each
 * sub-component lives in its own file (paragraph.tsx, heading.tsx, ...)
 * holding BOTH its descriptor and its editor node; this module only fixes
 * the registration order for the block registry.
 */
export const descriptors: DocBlockDescriptor[] = [
  paragraphDescriptor,
  headingDescriptor,
  listItemDescriptor,
  quoteDescriptor,
  dividerDescriptor,
  imageDescriptor,
  videoDescriptor,
  calloutDescriptor,
];
