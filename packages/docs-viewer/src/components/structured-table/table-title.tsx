"use client";

import { Table2 } from "lucide-react";
import {
  TABLE_TITLE_BAR_CLASSES,
  TABLE_TITLE_CLASSES,
  TABLE_TITLE_TILE_CLASSES,
} from "./table-classes";

/**
 * The table's panel head, shared by the read block and the editor node view:
 * the text-family tile (decorative, hidden from assistive tech) and the
 * title, whose element id labels the `<table>`. Callers render it only when
 * the block has a title — an untitled table has no head at all.
 */
export function TableTitleBar({ id, title }: { id: string; title: string }) {
  return (
    <div className={TABLE_TITLE_BAR_CLASSES} data-table-title-bar="">
      <span aria-hidden="true" className={TABLE_TITLE_TILE_CLASSES}>
        <Table2 size={11} strokeWidth={2.25} />
      </span>
      <span id={id} className={TABLE_TITLE_CLASSES}>
        {title}
      </span>
    </div>
  );
}
