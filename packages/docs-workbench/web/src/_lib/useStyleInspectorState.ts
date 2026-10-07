import { useRef, useState } from "react";
import { projectStorage } from "../data/project-storage";
import { STYLE_RAIL_COLLAPSE_KEY } from "./constants";

/**
 * Whether the Style inspector starts open. The stored choice keeps the old
 * rail's key and values ("true" = collapsed). It opens on load only where the
 * old rail used to show (1024px and up), when stored open or with no stored
 * choice. Below 1024px it opens only on an explicit click: at 801–1023px it
 * would squeeze the page, and at 800px and below it covers it (rule 13).
 */
function initialStyleOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!window.matchMedia("(min-width: 1024px)").matches) return false;
  return projectStorage.getItem(STYLE_RAIL_COLLAPSE_KEY) !== "true";
}

export function useStyleInspectorState() {
  const [styleOpen, setStyleOpen] = useState<boolean>(initialStyleOpen);
  const styleButtonRef = useRef<HTMLButtonElement | null>(null);
  return { styleOpen, setStyleOpen, styleButtonRef };
}
