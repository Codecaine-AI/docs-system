/**
 * linked-panels — the shared layer under the state-shape,
 * interaction-surface, and code doc blocks: one linking engine
 * (LinkGroup / useLinkTarget / LinkTarget), numbered code panels
 * (CodeLines / NumberedLine), the L#–# range chip (RangeChip), the
 * uppercase-mono card frame (CardShell), and hairline-divided prose rows
 * (ProseRows). Class constants and consumed theme tokens live in
 * ./classes.
 */

export {
  LinkGroup,
  LinkTarget,
  useLinkTarget,
  type LinkTargetDomProps,
  type LinkTargetProps,
  type UseLinkTargetResult,
} from "./LinkGroup";
export { CodeLines, NumberedLine, type LinkedCodeLine } from "./CodeLines";
export { RangeChip, formatLineRange } from "./RangeChip";
export { CardShell } from "./CardShell";
export { ProseRows } from "./ProseRows";
export * from "./classes";
