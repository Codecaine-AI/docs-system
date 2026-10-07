import { useRef, useCallback, type KeyboardEvent, type Dispatch, type SetStateAction, type RefObject } from "react";
import { projectStorage } from "../data/project-storage";
import { STYLE_RAIL_COLLAPSE_KEY } from "./constants";

export type StyleInspectorOptions = {
  isStatic: boolean; themeReady: boolean; themeLocked: boolean | null;
  styleOpen: boolean; setStyleOpen: Dispatch<SetStateAction<boolean>>;
  styleButtonRef: RefObject<HTMLButtonElement | null>;
  setSidePeekOpen: Dispatch<SetStateAction<boolean>>;
};

export function useStyleInspector({ isStatic, themeReady, themeLocked, styleOpen, setStyleOpen, styleButtonRef, setSidePeekOpen }: StyleInspectorOptions) {
  // The Style inspector exists only where the rail did: an unlocked live
  // serve whose theme has loaded. Only an explicit open or close is stored,
  // and only there, so static and locked hosts persist nothing.
  const styleAvailable = !isStatic && themeReady && themeLocked === false;
  // Set while the side peek has closed an open Style inspector: closing the
  // peek reopens it, unless the user opened or closed Style meanwhile.
  const peekClosedStyleRef = useRef(false);
  const styleOpenRef = useRef(styleOpen);
  styleOpenRef.current = styleOpen;
  const setStyleOpenByUser = useCallback(
    (next: boolean) => {
      peekClosedStyleRef.current = false;
      setStyleOpen(next);
      if (styleAvailable) projectStorage.setItem(STYLE_RAIL_COLLAPSE_KEY, String(!next));
    },
    [styleAvailable],
  );
  // Every close path (the topbar button, the close button, Escape) returns
  // focus to the Style button, including when the inspector mounted open.
  const closeStyle = useCallback(() => {
    setStyleOpenByUser(false);
    styleButtonRef.current?.focus({ preventScroll: true });
  }, [setStyleOpenByUser]);
  const handleStyleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // IME composition owns Escape: keep the inspector open.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation();
      event.nativeEvent.stopPropagation();
      return;
    }
    // Handled here, so the shell's own Escape handler leaves it alone.
    event.preventDefault();
    closeStyle();
  };
  // One Escape inside the inspector closes only the inspector: the side
  // peek (window listener) and DocPage's AI mode (document listener) never
  // see it. This also covers the inspector header's close button, whose
  // Escape the shell handles. React dispatches at the root, before both.
  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (event.target instanceof Element && event.target.closest(".ds-inspector")) {
      event.nativeEvent.stopPropagation();
    }
  };
  // The side peek and the Style inspector share the right edge: opening a
  // peek closes an open Style inspector without storing that (as the peek
  // already hides the AI dock), and closing the peek reopens it.
  const handlePeekOpenChange = useCallback((open: boolean) => {
    setSidePeekOpen(open);
    if (open) {
      if (styleOpenRef.current) {
        peekClosedStyleRef.current = true;
        setStyleOpen(false);
      }
    } else if (peekClosedStyleRef.current) {
      peekClosedStyleRef.current = false;
      setStyleOpen(true);
    }
  }, []);

  return { styleAvailable, setStyleOpenByUser, closeStyle, handleStyleKeyDown, handleShellKeyDown, handlePeekOpenChange };
}
