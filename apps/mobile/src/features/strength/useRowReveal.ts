import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

import { offsetToReveal, space } from '@/ui';

/** What the list needs to be told, and the one thing it can be asked: reveal a set row. Every member is stable. */
export interface RowReveal {
  readonly scroll: RefObject<ScrollView | null>;
  readonly reveal: (setLogId: string) => void;
  /** Where an exercise's block sits in the list's content. */
  readonly blockLayout: (blockId: string, top: number) => void;
  /** Where a set row sits inside its block. */
  readonly rowLayout: (blockId: string, setLogId: string, top: number, height: number) => void;
  readonly scrolled: (offset: number) => void;
  /** A finger took the list: it goes where the lifter put it, not back to the last row revealed. */
  readonly dragged: () => void;
  readonly viewportLayout: (height: number) => void;
  /** The keypad's height over the bottom of the list — 0 while it is closed. */
  readonly keypadLayout: (height: number) => void;
}

/**
 * Scrolls the live workout's list so a set row sits clear of the keypad and inside the viewport, moving it as little
 * as possible (07 §6) — `offsetToReveal`'s geometry, aimed from what the list last reported of itself.
 *
 * **A reveal is aimed again when the viewport changes height.** Aiming happens in the ✓'s handler, before the commit
 * it causes; when that commit mounts the rest bar above the list, the viewport shrinks by the bar's height *after* the
 * aim, and the row it placed just above the fold — or the keypad — lands under it (task 004's closing pass: bar
 * 238 px, the next row below the fold, and with the keypad open the field being edited behind it). The row last
 * revealed is kept until a finger scrolls the list, and is revealed again from the new height. When the viewport grows
 * instead — the rest ending — a row still in view asks for no scroll at all.
 */
export function useRowReveal(): RowReveal {
  const scroll = useRef<ScrollView | null>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const keypadHeight = useRef(0);
  const blockTops = useRef(new Map<string, number>());
  const rowBoxes = useRef(new Map<string, { blockId: string; top: number; height: number }>());
  const revealed = useRef<string | null>(null);

  const reveal = useCallback((setLogId: string) => {
    revealed.current = setLogId;
    const box = rowBoxes.current.get(setLogId);
    const blockTop = box === undefined ? undefined : blockTops.current.get(box.blockId);
    if (box === undefined || blockTop === undefined) return;
    const rowTop = blockTop + box.top;
    scroll.current?.scrollTo({
      y: offsetToReveal({
        rowTop,
        rowBottom: rowTop + box.height,
        scrollOffset: scrollOffset.current,
        viewportHeight: viewportHeight.current,
        keypadHeight: keypadHeight.current,
        margin: space[2],
      }),
      animated: true,
    });
  }, []);

  const blockLayout = useCallback((blockId: string, top: number) => {
    blockTops.current.set(blockId, top);
  }, []);

  const rowLayout = useCallback((blockId: string, setLogId: string, top: number, height: number) => {
    rowBoxes.current.set(setLogId, { blockId, top, height });
  }, []);

  const scrolled = useCallback((offset: number) => {
    scrollOffset.current = offset;
  }, []);

  const dragged = useCallback(() => {
    revealed.current = null;
  }, []);

  const viewportLayout = useCallback(
    (height: number) => {
      if (height === viewportHeight.current) return;
      viewportHeight.current = height;
      if (revealed.current !== null) reveal(revealed.current);
    },
    [reveal],
  );

  const keypadLayout = useCallback((height: number) => {
    keypadHeight.current = height;
  }, []);

  return useMemo(
    () => ({ scroll, reveal, blockLayout, rowLayout, scrolled, dragged, viewportLayout, keypadLayout }),
    [reveal, blockLayout, rowLayout, scrolled, dragged, viewportLayout, keypadLayout],
  );
}
