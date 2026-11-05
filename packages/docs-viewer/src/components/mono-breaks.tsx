import { Fragment, type ReactNode } from "react";

/**
 * Mono values (names, types, paths) never break mid-word. Their cells use
 * `overflow-wrap: normal`, so a line may break only at a space or at a `<wbr>`
 * this helper inserts after each natural separator: `/ . - | ,`. A long path
 * `packages/docs-viewer/src` can then wrap after a slash, a dotted name after
 * a dot, while an identifier like `DocsChangeEvent` always stays whole.
 * `{ underscore: true }` also breaks after `_`, for names that must fit a
 * fixed column (field-ledger names): `commercial_` / `interpretation`. Type
 * text never takes it, so a literal like `"funding_change"` stays whole.
 */
const MONO_BREAK_AFTER = /([/.\-|,])/;
const MONO_NAME_BREAK_AFTER = /([/.\-_|,])/;
const CAMEL_HUMP = /(?<=[a-z0-9])(?=[A-Z])/;

export function monoBreaks(text: string, options?: { underscore?: boolean; camel?: boolean }): ReactNode {
  const pattern = options?.underscore ? MONO_NAME_BREAK_AFTER : MONO_BREAK_AFTER;
  // `camel` also breaks between camel humps (`Noncommercial|Topic`). Only for
  // a lone identifier (a type with no other break), where a hump break is
  // used solely when the whole word cannot fit its column.
  const split = (chunk: string) => options?.camel ? chunk.split(CAMEL_HUMP) : [chunk];
  if (!pattern.test(text) && !(options?.camel && CAMEL_HUMP.test(text))) return text;
  const pieces: string[] = [];
  text.split(pattern).forEach((part, index, parts) => {
    if (index % 2 === 1) pieces[pieces.length - 1] += part;
    else pieces.push(...split(part));
    if (index % 2 === 1 && (index === parts.length - 1 || parts[index + 1] === "")) pieces.push("");
  });
  const kept = pieces.filter((piece, index) => piece !== "" || index === 0);
  return kept.map((piece, index) => index < kept.length - 1 ? <Fragment key={index}>{piece}<wbr /></Fragment> : piece);
}

/**
 * Inline code chips never break mid-token. A chip's text is cut into
 * PIECES, each set `white-space: nowrap`, and a line may break only between
 * pieces (a `<wbr>` between two pieces, or a space). That also blocks the
 * browser's own break after a hyphen, so `--docs-kind-*` never splits as
 * `--` / `docs-kind-*`.
 *
 * - A word of CHIP_LONG_WORD (32) characters or fewer never breaks:
 *   `CODECAINE_DOCS_STATE_DIR`, `agent-kernel-viewer-core` and
 *   `../canvas/packages/text-measure` stay whole, and the chip moves to the
 *   next line instead.
 * - A chip with spaces (`docs-cli code-theme import`) breaks at its spaces.
 * - A longer path breaks only after `/`, and any other longer word after
 *   `. -`, when a word character sits on both sides: `packages/`
 *   `docs-viewer/` `src`, `--docs-` `kind-*`. `_` never breaks, while
 *   a leading `--`, a `./` prefix and a trailing `-*` stay attached. A piece
 *   of CHIP_SHORT_PIECE characters or fewer joins the piece before it, so a
 *   line never ends a chip on a lone `ts` or `src`.
 *
 * Whitespace runs come back as their own pieces (they stay breakable).
 * A chip whose words are each one piece and hold no character the browser
 * could break after (`-`, `/`, `?`, brackets, ...) needs no wrapping at all:
 * `chipNeedsPieces` is false and the renderers keep its plain text.
 */
const CHIP_BREAK_AFTER = /(?<=[A-Za-z0-9][/.-])(?=[A-Za-z0-9<{[(~$@])/;
const CHIP_BREAK_AFTER_SLASH = /(?<=[A-Za-z0-9]\/)(?=[A-Za-z0-9<{[(~$@])/;
const CHIP_LONG_WORD = 32;
const CHIP_SHORT_PIECE = 3;

/** A long word's separator pieces, each short piece joined to the one before it. A path breaks only after its slashes. */
function longWordPieces(word: string): string[] {
  const pieces: string[] = [];
  const at = CHIP_BREAK_AFTER_SLASH.test(word) ? CHIP_BREAK_AFTER_SLASH : CHIP_BREAK_AFTER;
  for (const piece of word.split(at)) {
    if (pieces.length > 0 && piece.length <= CHIP_SHORT_PIECE) pieces[pieces.length - 1] += piece;
    else pieces.push(piece);
  }
  return pieces;
}

export function chipPieces(text: string): string[] {
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  return words.flatMap((word) =>
    /^\s+$/.test(word) || word.length <= CHIP_LONG_WORD ? [word] : longWordPieces(word),
  );
}

/** Characters a browser may break after (or before) inside a word, per UAX #14. */
const NATIVE_BREAK = /[^\sA-Za-z0-9_.$#@:=<>"'`,;*&^]/;

/** Whether `chipPieces(text)` must be rendered as nowrap pieces (false: the plain text already cannot break mid-token). */
export function chipNeedsPieces(text: string): boolean {
  if (NATIVE_BREAK.test(text)) return true;
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  return chipPieces(text).length !== words.length;
}

const NOWRAP = { whiteSpace: "nowrap" } as const;

/** `chipPieces` as React: nowrap pieces, a `<wbr>` between two adjacent words' pieces. */
export function chipBreaks(text: string): ReactNode {
  if (!chipNeedsPieces(text)) return text;
  const pieces = chipPieces(text);
  return pieces.map((piece, index) => {
    if (/^\s+$/.test(piece)) return piece;
    const breakBefore = index > 0 && !/^\s+$/.test(pieces[index - 1]);
    return (
      <Fragment key={index}>
        {breakBefore && <wbr />}
        <span data-chip-piece="" style={NOWRAP}>{piece}</span>
      </Fragment>
    );
  });
}
