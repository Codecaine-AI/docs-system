import type { ReactNode } from 'react';
import { Inspector } from './_components/Inspector';
import { Sidebar, type NavSection, type ShellLinkComponent } from './_components/Sidebar';
import { Topbar } from './_components/Topbar';
import { useSidebarCollapsed } from './useSidebarCollapsed';

export type {
  NavItemConfig,
  NavSection,
  ShellLinkComponent,
  ShellLinkProps,
} from './_components/Sidebar';
export { resolveNav } from './_components/Sidebar';

/** Content measure of `.ds-main`. Omit it for the default (`wide`). */
export type Lane = 'text' | 'code' | 'wide' | 'full';

export type AppShellProps = {
  /** Sidebar title. docs-workbench: a node, so it can be the projects link or the site title. */
  appName: ReactNode;
  /** Nav config, usually passed through `resolveNav(sections, pathname)`. */
  sections: NavSection[];
  /** Page title: the topbar `h1`. */
  title: ReactNode;
  /** Topbar buttons, right-aligned. */
  actions?: ReactNode;
  /** Sidebar footer slot, usually the account card. */
  footer?: ReactNode;
  lane?: Lane;
  /** Defaults to `'a'`. Pass a router link adapter for client-side navigation. */
  linkComponent?: ShellLinkComponent;
  /**
   * localStorage key for the sidebar state. Use `<app>.sidebar`.
   * docs-workbench: `null` neither reads nor writes storage (a static export).
   */
  storageKey?: string | null;
  /** docs-workbench: false keeps explicit choices in memory only (a theme-locked serve). Default true. */
  persistSidebar?: boolean;
  /**
   * docs-workbench: content after the nav sections in `.ds-sidebar-body`
   * (the docs tree when expanded, its section rail when collapsed).
   */
  sidebarBody?: (state: { collapsed: boolean }) => ReactNode;
  /** Sidebar state when nothing is stored; also the server-rendered state. */
  defaultCollapsed?: boolean;
  /** Optional right-hand panel. Stays mounted while closed so it can slide out. */
  inspector?: { title: string; open: boolean; onClose: () => void; content: ReactNode };
  children: ReactNode;
};

export function AppShell({
  appName,
  sections,
  title,
  actions,
  footer,
  lane,
  linkComponent = 'a',
  storageKey,
  persistSidebar,
  sidebarBody,
  defaultCollapsed,
  inspector,
  children,
}: AppShellProps) {
  const { collapsed, toggle, shortcut } = useSidebarCollapsed({
    storageKey,
    defaultCollapsed,
    persist: persistSidebar,
  });

  return (
    <div
      className="ds-shell"
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
      data-inspector={inspector?.open ? 'open' : 'closed'}
    >
      <a className="ds-skip-link" href="#ds-main">
        Skip to content
      </a>
      <Sidebar
        id="ds-sidebar"
        appName={appName}
        sections={sections}
        collapsed={collapsed}
        onToggle={toggle}
        shortcut={shortcut}
        linkComponent={linkComponent}
        footer={footer}
        body={sidebarBody?.({ collapsed })}
      />
      <div className="ds-workspace">
        <Topbar title={title} actions={actions} />
        <main className="ds-main" id="ds-main" tabIndex={-1} data-lane={lane}>
          {children}
        </main>
      </div>
      {inspector && (
        <Inspector
          id="ds-inspector"
          title={inspector.title}
          open={inspector.open}
          onClose={inspector.onClose}
        >
          {inspector.content}
        </Inspector>
      )}
    </div>
  );
}
