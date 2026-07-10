/**
 * Ported (not verbatim) from BlockSuite.
 *
 * Upstream sources:
 *   - packages/affine/widgets/slash-menu/src/types.ts
 *   - packages/affine/widgets/slash-menu/src/utils.ts
 *       (`isActionItem`, `isSubMenuItem`, `parseGroup`, `itemCompareFn`,
 *       `buildSlashMenuItems`, `mergeSlashMenuConfigs`)
 *   - packages/affine/shared/src/utils/string.ts
 *       (`isFuzzyMatch`, `substringMatchScore`)
 *   - packages/affine/widgets/slash-menu/src/slash-menu-popover.ts
 *       (`_updateFilteredItems`'s layered-search + sort algorithm, extracted
 *       as the pure function `filterSlashMenuItems` below)
 * License: MPL-2.0 (see ./NOTICE for details)
 *
 * This is a framework-free TypeScript port of BlockSuite's slash-menu
 * DATA MODEL only — no Lit, no `@blocksuite/std`/`BlockStdScope`, no
 * `@blocksuite/store`/`BlockModel`, no rendering/DOM/keyboard-event code.
 * `SlashMenuContext` is generic (`TContext`) instead of the upstream
 * `{ std, model }` shape, since this repo has no BlockSuite host/model —
 * callers (SlashMenu.tsx) supply whatever context their `when`/`items`
 * predicates need (e.g. the current TipTap editor). The group-based sort
 * (`parseGroup`/itemCompareFn), the two-layer fuzzy search + submenu
 * expansion, and the substring-match relevance scoring are all preserved
 * verbatim in algorithm/control-flow terms — only the surrounding types
 * were generalized and the config-merging helper simplified for a single
 * fixed v1 command set (no dynamic multi-package config registry).
 */

export type SlashMenuItemBase = {
  name: string;
  description?: string;
  /**
   * Sorting/grouping key, VSCode-menu-contribution style:
   * `${groupIndex}_${groupName}@${itemIndex}`. Items with no `group` sort
   * before any grouped item (see `itemCompareFn`).
   */
  group?: `${number}_${string}@${number}`;
  /** Extra strings to fuzzy-match against, besides `name`. */
  searchAlias?: string[];
  /** Show this item only when the predicate returns true (or is absent). */
  when?: (ctx: unknown) => boolean;
};

export type SlashMenuActionItem<TContext = unknown> = SlashMenuItemBase & {
  action: (ctx: TContext) => void;
};

export type SlashMenuSubMenu<TContext = unknown> = SlashMenuItemBase & {
  subMenu: SlashMenuItem<TContext>[];
};

export type SlashMenuItem<TContext = unknown> =
  | SlashMenuActionItem<TContext>
  | SlashMenuSubMenu<TContext>;

export function isActionItem<TContext>(
  item: SlashMenuItem<TContext>,
): item is SlashMenuActionItem<TContext> {
  return "action" in item;
}

export function isSubMenuItem<TContext>(
  item: SlashMenuItem<TContext>,
): item is SlashMenuSubMenu<TContext> {
  return "subMenu" in item;
}

/** Parses a `group` string into `[groupIndex, groupName, itemIndex]`. */
export function parseGroup(group: NonNullable<SlashMenuItemBase["group"]>) {
  return [
    parseInt(group.split("_")[0], 10),
    group.split("_")[1].split("@")[0],
    parseInt(group.split("@")[1], 10),
  ] as const;
}

function itemCompareFn<TContext>(a: SlashMenuItem<TContext>, b: SlashMenuItem<TContext>): number {
  if (a.group === undefined && b.group === undefined) return 0;
  if (a.group === undefined) return -1;
  if (b.group === undefined) return 1;

  const [aGroupIndex, aGroupName, aItemIndex] = parseGroup(a.group);
  const [bGroupIndex, bGroupName, bItemIndex] = parseGroup(b.group);
  if (isNaN(aGroupIndex)) return -1;
  if (isNaN(bGroupIndex)) return 1;
  if (aGroupIndex < bGroupIndex) return -1;
  if (aGroupIndex > bGroupIndex) return 1;

  if (aGroupName !== bGroupName) return aGroupName.localeCompare(bGroupName);

  if (isNaN(aItemIndex)) return -1;
  if (isNaN(bItemIndex)) return 1;

  return aItemIndex - bItemIndex;
}

/**
 * Filters items by their (optional) `when` predicate and sorts by group,
 * recursing into submenus. Mirrors upstream `buildSlashMenuItems`.
 */
export function buildSlashMenuItems<TContext>(
  items: SlashMenuItem<TContext>[],
  context: TContext,
): SlashMenuItem<TContext>[] {
  return items
    .filter((item) => (item.when ? item.when(context) : true))
    .sort(itemCompareFn)
    .map((item) =>
      isSubMenuItem(item)
        ? { ...item, subMenu: buildSlashMenuItems(item.subMenu, context) }
        : { ...item },
    );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fuzzy-matches `query` against `name` letter-by-letter, in order, allowing
 * gaps (e.g. "js" matches "John Smith"). Ported verbatim (algorithm-wise)
 * from `isFuzzyMatch`.
 */
export function isFuzzyMatch(name: string, query: string): boolean {
  const pureName = name
    .trim()
    .toLowerCase()
    .split("")
    .filter((char) => char !== " ")
    .join("");

  const regex = new RegExp(
    query
      .split("")
      .filter((char) => char !== " ")
      .map((item) => `${escapeRegExp(item)}.*`)
      .join(""),
    "i",
  );
  return regex.test(pureName);
}

/**
 * Scores how well `query` matches `name` for search-result ordering:
 * highest when `query` is a literal substring of `name` (longer relative
 * match = higher score), lower for a non-contiguous common substring, 0 for
 * no match. Ported verbatim (algorithm-wise) from `substringMatchScore`.
 */
export function substringMatchScore(name: string, query: string): number {
  if (query.length === 0) return 0;
  if (name.length === 0) return 0;
  if (query.length > name.length) return 0;

  const q = query.toLowerCase();
  const n = name.toLocaleLowerCase();

  let score: number;
  if (n.includes(q)) {
    score = 1 + q.length / n.length;
  } else {
    let maxMatchLength = 0;
    for (let i = 0; i < q.length; i += 1) {
      for (let j = 0; j < n.length; j += 1) {
        let matchLength = 0;
        while (
          i + matchLength < q.length &&
          j + matchLength < n.length &&
          q[i + matchLength] === n[j + matchLength]
        ) {
          matchLength += 1;
        }
        maxMatchLength = Math.max(maxMatchLength, matchLength);
      }
    }
    score = maxMatchLength / n.length;
  }

  return 0.5 * score;
}

/**
 * Filters a (already group-sorted) item list against a search string,
 * expanding into submenus layer-by-layer until a non-empty result is found
 * at depth >= 1 (mirrors `_updateFilteredItems`'s "search first and second
 * layer" behavior), then re-sorts the matches by substring relevance.
 *
 * An empty `query` returns `items` unchanged (menu shows the full grouped
 * list, matching the upstream "off" query state).
 */
export function filterSlashMenuItems<TContext>(
  items: SlashMenuItem<TContext>[],
  query: string,
): SlashMenuItem<TContext>[] {
  const searchStr = query.toLowerCase();
  if (searchStr === "") return items;

  let filtered: SlashMenuItem<TContext>[] = [];
  let queue = items;
  let depth = 0;

  while (queue.length !== 0) {
    filtered = filtered.filter((item) => !isSubMenuItem(item));
    filtered = filtered.concat(
      queue.filter(({ name, searchAlias = [] }) =>
        [name, ...searchAlias].some((str) => isFuzzyMatch(str, searchStr)),
      ),
    );

    if (filtered.length !== 0 && depth >= 1) break;

    queue = queue.flatMap((item) => (isSubMenuItem(item) ? item.subMenu : []));
    depth += 1;
  }

  filtered.sort(
    (a, b) => -(substringMatchScore(a.name, searchStr) - substringMatchScore(b.name, searchStr)),
  );

  return filtered;
}
