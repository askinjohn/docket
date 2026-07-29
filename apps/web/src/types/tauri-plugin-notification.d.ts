/**
 * Ambient types for @tauri-apps/plugin-notification.
 * Prefer the real package after `npm install` in apps/web.
 */
declare module '@tauri-apps/plugin-notification' {
  export type Permission = 'granted' | 'denied' | 'default';

  export interface Options {
    title?: string;
    body?: string;
    extra?: Record<string, unknown>;
    icon?: string;
    sound?: string;
  }

  export function isPermissionGranted(): Promise<boolean>;
  export function requestPermission(): Promise<Permission>;
  export function sendNotification(options: Options | string): void;
  export function onAction(
    handler: (notification: Options) => void,
  ): Promise<void>;
}
