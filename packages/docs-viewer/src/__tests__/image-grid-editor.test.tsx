import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { ImageGridEditorNodeView } from "../components/rich-text/image-grid-editor-node-view";
afterEach(cleanup);
function Fixture({ editable = true }: { editable?: boolean }) {
  const [blockProps, set] = useState({ images: [{ src: "a.png", heading: "Original", alt: "Original wall" }, { src: "b.png", heading: "Masked", alt: "Masked wall" }], columns: 2 });
  return <ImageGridEditorNodeView {...{ node: { attrs: { blockProps } }, editor: { isEditable: editable }, updateAttributes: (attrs: any) => set(attrs.blockProps) } as unknown as ReactNodeViewProps} />;
}
test("grid controls retain labels while changing columns, order and image count", () => {
  const ui = render(<Fixture />);
  fireEvent.change(ui.getByLabelText("Grid columns"), { target: { value: "3" } });
  expect(ui.container.querySelector('.docs-image-grid')?.getAttribute('style')).toContain('3');
  fireEvent.click(ui.getByRole('button', { name: 'Move image 2 earlier', hidden: true }));
  expect(ui.container.querySelector('img')?.getAttribute('src')).toBe('b.png');
  fireEvent.change(ui.getAllByLabelText('Heading')[0]!, { target: { value: 'Cropped and Masked' } });
  expect(ui.container.querySelector('.docs-image-grid-heading')?.textContent).toBe('Cropped and Masked');
  fireEvent.change(ui.getByLabelText('New image path'), { target: { value: 'c.png' } });
  fireEvent.click(ui.getByRole('button', { name: 'Add image', hidden: true }));
  expect(ui.container.querySelectorAll('img').length).toBe(3);
  fireEvent.click(ui.getByRole('button', { name: 'Remove image 3', hidden: true }));
  expect(ui.container.querySelectorAll('img').length).toBe(2);
});
test("read-only editor preview hides all authoring controls", () => {
  const ui=render(<Fixture editable={false} />);
  expect(ui.container.querySelectorAll('img').length).toBe(2);
  expect(ui.container.querySelector('details')).toBeNull();
});
