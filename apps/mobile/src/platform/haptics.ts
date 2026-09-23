/**
 * Haptic feedback, behind an interface the rest of the app calls without knowing which OS answers (INV-28, ADR-009).
 *
 * 07 §6 asks for a haptic on set completion: mid-set, looking at a bar rather than a phone, the tap has to be felt
 * rather than checked. Android is the only implementation today, which is exactly why the rule is enforced by lint —
 * with one platform an OS assumption anywhere else breaks nothing and goes unnoticed until iOS is added.
 */
import * as Haptics from 'expo-haptics';

/**
 * The confirmation felt when a set is ticked.
 *
 * Deliberately **not** awaited by its caller and deliberately unable to throw: the ✓ writes to SQLite and renders
 * inside NFR-2's 100 ms, and a buzz is not allowed to be in that path or to break it. A device with the setting off,
 * or with no motor, simply does nothing.
 */
export function confirmTap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
    // A haptic is a courtesy. Failing to deliver one is never worth interrupting a workout for.
  });
}

/**
 * The rest is over — felt, because the lifter is looking at a bar or at the floor, not at the phone (07 §6). A
 * notification-style pattern rather than the ✓'s single impact, so the two are told apart without looking.
 */
export function restOverTap(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
    // A courtesy, as above.
  });
}
