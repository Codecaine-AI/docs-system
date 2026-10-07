import {
  BLOCK_LAYOUT_STYLE_ELEMENT_ID,
  CODE_PANEL_STYLE_ELEMENT_ID,
  PAGE_COLOR_STYLE_ELEMENT_ID,
  PAGE_COLOR_VARS,
  blockLayoutOverrideCss,
  codePanelOverrideCss,
  pageColorOverrideCss,
  styleRailVars,
  type StyleRailSettings,
} from "../shared/style-rail-settings";

function writeManagedStyle(id: string, css: string) {
  let element = document.getElementById(id) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = id;
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Writes the rail onto <html>: every var as an inline custom property except
 * the page colors, the Code panels knob as `data-code-panels` (the attribute
 * the dark-panel CSS keys on), the page colors into their mode-scoped
 * managed <style> (pageColorOverrideCss), and the panel restatement into its
 * managed <style> element.
 */
export function applyStyleRailVars(settings: StyleRailSettings) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(styleRailVars(settings))) {
    if (value === null || PAGE_COLOR_VARS.has(key)) root.style.removeProperty(key);
    else root.style.setProperty(key, value);
  }
  root.setAttribute("data-code-panels", settings.typography.codePanels);
  writeManagedStyle(PAGE_COLOR_STYLE_ELEMENT_ID, pageColorOverrideCss(settings));
  writeManagedStyle(CODE_PANEL_STYLE_ELEMENT_ID, codePanelOverrideCss(settings));
}


/**
 * Sibling of applyStyleRailVars for the rules that cannot be expressed as
 * custom properties. Maintains ONE <style> element in <head>, created once
 * and then only ever refilled, so the overrides can never accumulate stale
 * copies. No overrides = an empty element, not a removed one.
 */
export function applyBlockLayoutOverrideCss(settings: StyleRailSettings) {
  if (typeof document === "undefined") return;
  let element = document.getElementById(BLOCK_LAYOUT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = BLOCK_LAYOUT_STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  const css = blockLayoutOverrideCss(settings);
  if (element.textContent !== css) element.textContent = css;
}
