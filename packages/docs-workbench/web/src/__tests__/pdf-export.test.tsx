import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { exportPages, pdfEntryPath } from "../lib/pdf-selection";
import { ExportDialog } from "../shell/ExportDialog";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

const tree: DocsTreeNode[] = [{ name: "Guide", kind: "bundle", path: "10-guide", children: [
  { name: "Setup", kind: "bundle", path: "10-guide/10-setup" },
  { name: "Advanced", kind: "dir", path: "10-guide/20-advanced", children: [
    { name: "Setup", kind: "bundle", path: "10-guide/20-advanced/10-setup" },
    { name: "asset", kind: "file", path: "10-guide/20-advanced/asset" },
  ] },
] }];

afterEach(cleanup);
describe("PDF selection", () => {
  test("preserves tree order, parent pages and full paths without legacy files", () => {
    expect(exportPages(tree).map(page => pdfEntryPath(page.path))).toEqual([
      "10-guide.pdf", "10-guide/10-setup.pdf", "10-guide/20-advanced/10-setup.pdf",
    ]);
    for (const path of ["../escape", "/absolute", "a/../b", "a\\b", "a//b", "a\n"]) expect(() => pdfEntryPath(path)).toThrow();
  });
  test("defaults to ZIP/current page, allows section and individual selection, disables empty exports", () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    render(<ExportDialog tree={tree} currentPath="10-guide" onClose={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("zip");
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Select section"));
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Setup")[0]!);
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear"));
    expect((screen.getByRole("button", { name: /^Export$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});
