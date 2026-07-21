"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cn } from "../../ui/cn";
import {
  LINK_TARGET_CLASSES,
  LINK_TARGET_LIT_CLASSES,
  LINK_TARGET_PINNED_CLASSES,
} from "./classes";

/**
 * The linking engine — ONE group per block instance scoping a set of
 * string keys across that block's panels (R3, painted extents):
 *
 *  - hover OR focus on any target lights EVERY target with the same key
 *    in the group (`data-lit="true"` + the lit wash/rail classes);
 *  - click (or Enter/Space) toggles a pin for the key — the pin survives
 *    hover-out; a second click, or pinning another key, unpins;
 *  - Escape clears all pins in all groups (each group listens globally);
 *  - linkable targets get tabIndex=0, so the whole scheme is keyboard
 *    reachable.
 *
 * Targets emit data attributes for tests and styling: `data-link-key`,
 * `data-lit="true"`, `data-pinned="true"`. Keys are meaningful only within
 * their group — two LinkGroups never light each other. Dependency-free.
 */

type LinkGroupContextValue = {
  hoverKey: string | null;
  pinnedKey: string | null;
  setHover: (key: string | null) => void;
  togglePin: (key: string) => void;
};

const LinkGroupContext = createContext<LinkGroupContextValue | null>(null);

/** Scopes one linking group. Renders no DOM of its own. */
export function LinkGroup({ children }: { children: ReactNode }) {
  const [hoverKey, setHover] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  // Escape clears pins globally: every mounted group clears its own pin,
  // which together satisfies "all pins in all groups".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<LinkGroupContextValue>(
    () => ({
      hoverKey,
      pinnedKey,
      setHover,
      togglePin: (key) => setPinnedKey((previous) => (previous === key ? null : key)),
    }),
    [hoverKey, pinnedKey],
  );

  return <LinkGroupContext.Provider value={value}>{children}</LinkGroupContext.Provider>;
}

export type LinkTargetDomProps = {
  "data-link-key"?: string;
  "data-lit"?: "true";
  "data-pinned"?: "true";
  tabIndex?: number;
  onMouseEnter?: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: ReactMouseEvent<HTMLElement>) => void;
  onFocus?: (event: ReactFocusEvent<HTMLElement>) => void;
  onBlur?: (event: ReactFocusEvent<HTMLElement>) => void;
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

export type UseLinkTargetResult = {
  /** True while this key is hovered, focused, or pinned in the group. */
  lit: boolean;
  /** True while this key is the group's pinned key. */
  pinned: boolean;
  /** cn() of base + lit + pinned link classes for the current state (empty when inert). */
  className: string;
  /** Spread onto the linkable element (engine handlers win over same-name props spread before them). */
  targetProps: LinkTargetDomProps;
};

const INERT_LINK_TARGET: UseLinkTargetResult = {
  lit: false,
  pinned: false,
  className: "",
  targetProps: {},
};

/**
 * Wires one element into the enclosing LinkGroup. Inert (no classes, no
 * handlers, no data attributes) when `linkKey` is empty or there is no
 * LinkGroup above — so shared components can render standalone.
 *
 * `linkKey` may be a single key or a key CHAIN (deepest/primary first):
 * the element LIGHTS when any of its keys is active — that is how a
 * parent extent paints contiguously across lines that deeper subjects
 * also claim — but hover/focus/click always ACTIVATE the primary key
 * only, so pointing at one line never lights the whole parent span.
 *
 * `focusable: false` opts an element out of the tab order (handlers and
 * data attributes stay); default is tabIndex=0 per the system contract.
 */
export function useLinkTarget(
  linkKey: string | readonly string[] | null | undefined,
  options?: { focusable?: boolean },
): UseLinkTargetResult {
  const group = useContext(LinkGroupContext);
  const keys = typeof linkKey === "string" ? [linkKey] : (linkKey ?? []).filter(Boolean);
  const primary = keys[0];
  if (!group || !primary) return INERT_LINK_TARGET;

  const focusable = options?.focusable ?? true;
  const pinned = group.pinnedKey !== null && keys.includes(group.pinnedKey);
  const lit = pinned || (group.hoverKey !== null && keys.includes(group.hoverKey));

  const targetProps: LinkTargetDomProps = {
    "data-link-key": keys.join(" "),
    onMouseEnter: () => group.setHover(primary),
    onMouseLeave: () => group.setHover(null),
    onFocus: () => group.setHover(primary),
    onBlur: () => group.setHover(null),
    onClick: () => group.togglePin(primary),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        group.togglePin(primary);
      }
    },
  };
  if (focusable) targetProps.tabIndex = 0;
  if (lit) targetProps["data-lit"] = "true";
  if (pinned) targetProps["data-pinned"] = "true";

  return {
    lit,
    pinned,
    className: cn(
      LINK_TARGET_CLASSES,
      lit && LINK_TARGET_LIT_CLASSES,
      pinned && LINK_TARGET_PINNED_CLASSES,
    ),
    targetProps,
  };
}

export type LinkTargetProps = HTMLAttributes<HTMLDivElement> & {
  /** The group key (or key chain, primary first) this element lights/pins. */
  linkKey: string | readonly string[];
  /** Set false to keep the element out of the tab order. */
  focusable?: boolean;
};

/**
 * Convenience linkable `<div>` for prose rows (notes, property rows):
 * spreads the engine's handlers, data attributes, and state classes.
 * Engine handlers win over same-name props passed in.
 */
export function LinkTarget({ linkKey, focusable, className, children, ...rest }: LinkTargetProps) {
  const link = useLinkTarget(linkKey, { focusable });
  return (
    <div {...rest} {...link.targetProps} className={cn(link.className, className)}>
      {children}
    </div>
  );
}
