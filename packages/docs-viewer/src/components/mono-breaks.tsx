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
 * - A chip with spaces (`docs-cli code-theme import`) breaks only at its
 *   spaces; a word in it longer than CHIP_LONG_WORD also takes the
 *   separator breaks below, so a long path in a command can still fit.
 * - A one-word chip breaks after `/ . _ -` when a word character sits on
 *   both sides: `packages/` `docs-viewer/` `src`, `--docs-` `kind-*`, while
 *   a leading `--`, a `./` prefix and a trailing `-*` stay attached.
 *
 * Whitespace runs come back as their own pieces (they stay breakable).
 * A chip whose words are each one piece and hold no character the browser
 * could break after (`-`, `/`, `?`, brackets, ...) needs no wrapping at all:
 * `chipNeedsPieces` is false and the renderers keep its plain text.
 */
const CHIP_BREAK_AFTER = /(?<=[A-Za-z0-9][/._-])(?=[A-Za-z0-9<{[(~$@])/;
const CHIP_LONG_WORD = 20;

export function chipPieces(text: string): string[] {
  const words = text.split(/(\s+)/).filter((part) => part !== "");
  const spaced = words.some((part) => /^\s+$/.test(part));
  return words.flatMap((word) =>
    /^\s+$/.test(word) || (spaced && word.length <= CHIP_LONG_WORD)
      ? [word]
      : word.split(CHIP_BREAK_AFTER),
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
