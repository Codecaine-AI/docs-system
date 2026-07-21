"use client";

export type Rect = { left: number; top: number; width: number; height: number };

export function getTargetIndexByDraggingOffset(
  offsets: number[],
  draggingIndex: number,
  currentOffset: number,
): number {
  const originalStart = offsets[draggingIndex];
  const originalSize = offsets[draggingIndex + 1] - originalStart;
  const currentEnd = currentOffset + originalSize;
  const isForward = currentOffset > originalStart;
  if (isForward) {
    for (let i = offsets.length - 1; i >= draggingIndex + 1; i--) {
      const blockCenter = (offsets[i] + offsets[i + 1]) / 2;
      if (currentEnd > blockCenter) return i;
    }
  } else {
    for (let i = 0; i <= draggingIndex - 1; i++) {
      const blockCenter = (offsets[i] + offsets[i + 1]) / 2;
      if (currentOffset < blockCenter) return i;
    }
  }
  return draggingIndex;
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.left + rect.width);
    bottom = Math.max(bottom, rect.top + rect.height);
  }
  return { left, top, width: right - left, height: bottom - top };
}

export function gapPosition(offsets: number[], slotIndex: number): number {
  if (offsets.length === 0) return 0;
  const clamped = Math.min(Math.max(slotIndex, 0), offsets.length - 1);
  return offsets[clamped];
}
