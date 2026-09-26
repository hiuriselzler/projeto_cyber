/**
 * `useRowReveal` — where the live workout's list scrolls to show a set row, and when it aims again. The screen itself
 * cannot render under Jest (it opens the database), so the geometry's caller is tested here with a stand-in list.
 *
 * The sizes are the ones task 004's closing pass measured on the Galaxy S21 FE — a set row 240 tall, the rest bar 238
 * with its margin, the keypad 1013 — in the units `onLayout` reports. Only differences matter to the geometry.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ScrollView } from 'react-native';

import { space } from '@/ui';

import { useRowReveal } from '../useRowReveal';

const VIEWPORT = 2000;
const BAR = 238;
const ROW = 240;

async function listWithRowAt(rowTop: number) {
  const { result } = await renderHook(() => useRowReveal());
  const scrollTo = jest.fn();
  result.current.scroll.current = { scrollTo } as unknown as ScrollView;
  await act(() => {
    result.current.viewportLayout(VIEWPORT);
    result.current.blockLayout('block', rowTop);
    result.current.rowLayout('block', 'next', 0, ROW);
  });
  return { rows: result.current, scrollTo };
}

/** Where the last `scrollTo` aimed. */
function aimedAt(scrollTo: jest.Mock): number | undefined {
  const call = scrollTo.mock.calls.at(-1) as [{ y: number }] | undefined;
  return call?.[0].y;
}

describe('useRowReveal', () => {
  it('scrolls a row below the fold just clear of it, the least the list can move', async () => {
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    expect(aimedAt(scrollTo)).toBe(2100 + ROW - VIEWPORT + space[2]);
  });

  it('aims again when the rest bar takes its height from the viewport after the aim — by exactly that height', async () => {
    // The ✓ aims in its handler; the commit it causes mounts the bar, and the list only hears of it afterwards.
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    const first = aimedAt(scrollTo) ?? 0;
    rows.scrolled(first);

    rows.viewportLayout(VIEWPORT - BAR);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(aimedAt(scrollTo)).toBe(first + BAR);
  });

  it('aims again while the first scroll is still under way — the aim does not depend on where it has got to', async () => {
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    const first = aimedAt(scrollTo) ?? 0;
    rows.scrolled(first / 3);

    rows.viewportLayout(VIEWPORT - BAR);
    expect(aimedAt(scrollTo)).toBe(first + BAR);
  });

  it('keeps the row clear of the keypad while it is open, and forgets the keypad once it is closed', async () => {
    const { rows, scrollTo } = await listWithRowAt(900);
    rows.keypadLayout(1013);
    rows.reveal('next');
    expect(aimedAt(scrollTo)).toBe(900 + ROW - (VIEWPORT - 1013) + space[2]);

    rows.keypadLayout(0);
    rows.scrolled(0);
    rows.reveal('next');
    // In view with no keypad over it: nowhere to go.
    expect(aimedAt(scrollTo)).toBe(0);
  });

  it('leaves the list where a finger put it — a rest ending later does not pull it back', async () => {
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    rows.dragged();
    rows.scrolled(0);

    rows.viewportLayout(VIEWPORT - BAR);
    rows.viewportLayout(VIEWPORT);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not scroll when the viewport reports the height it already had', async () => {
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    rows.viewportLayout(VIEWPORT);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('asks for no scroll when the viewport grows under a row still in view', async () => {
    const { rows, scrollTo } = await listWithRowAt(2100);
    rows.reveal('next');
    const first = aimedAt(scrollTo) ?? 0;
    rows.scrolled(first);

    rows.viewportLayout(VIEWPORT + BAR);
    expect(aimedAt(scrollTo)).toBe(first);
  });
});
