import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { RawDeviceEvent } from '../lib/external';

/** Actions taken outside the web app (notification buttons, widgets, share sheet). */
export type PendingAction =
  | { type: 'done'; id: string; date: string; at?: number }
  | { type: 'extend'; id: string; date: string; minutes: number; at?: number }
  | { type: 'share'; text: string; subject?: string; at?: number };

export interface DeviceCalendar {
  id: string;
  name: string;
  account: string;
  color: number;
  visible: boolean;
}

export interface NativeStatus {
  notifications: boolean;
  exactAlarms: boolean;
  calendar: boolean;
  sdk: number;
  /** Debuggable (non-release) build. */
  debug?: boolean;
}

interface PlannerPlugin {
  setSnapshot(o: { json: string }): Promise<void>;
  takePendingActions(): Promise<{ actions: PendingAction[] }>;
  status(): Promise<NativeStatus>;
  requestNotifications(): Promise<{ granted: boolean }>;
  requestCalendar(): Promise<{ granted: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  listCalendars(): Promise<{ calendars: DeviceCalendar[] }>;
  listEvents(o: { from: number; to: number; calendarIds: string[] }): Promise<{ events: RawDeviceEvent[] }>;
  listen(o?: { prompt?: string }): Promise<{ text: string }>;
  addListener(event: 'pendingActions', cb: () => void): Promise<PluginListenerHandle>;
}

export const isNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const Planner = registerPlugin<PlannerPlugin>('Planner');
