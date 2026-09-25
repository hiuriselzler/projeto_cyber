/**
 * The only folder that knows the operating system (INV-28, ADR-009). Everything else calls interfaces
 * like this one and never asks which OS answers. Android is the only implementation today.
 */
import { Platform } from 'react-native';

export interface PlatformDescriptor {
  readonly os: string;
  readonly osVersion: string;
}

export function describePlatform(): PlatformDescriptor {
  return { os: Platform.OS, osVersion: String(Platform.Version) };
}

export { confirmTap, recordTap, restOverTap } from './haptics';
export {
  askForNotifications,
  cancelRestEnd,
  notificationPermission,
  prepareRestAlerts,
  scheduleRestEnd,
  type NotificationPermission,
} from './notifications';
