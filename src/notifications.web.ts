/**
 * Web / PWA : pas de programmation possible auprès du système. Le décompte sonne dans l'app (bip + vibration) ;
 * si la page est cachée au moment de 00:00, une notification est affichée quand le navigateur le permet.
 * Sur iPhone, les notifications ne fonctionnent que pour une PWA ajoutée à l'écran d'accueil.
 */
import { useSyncExternalStore } from 'react';

export type NotificationStatus = 'unknown' | 'granted' | 'denied';

type Permission = 'default' | 'granted' | 'denied';
const api = (): { permission: Permission; requestPermission: () => Promise<Permission> } | null =>
  typeof Notification === 'undefined' ? null : (Notification as unknown as { permission: Permission; requestPermission: () => Promise<Permission> });

function read(): NotificationStatus {
  const p = api()?.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'unknown';
}

let status: NotificationStatus = read();
const listeners = new Set<() => void>();
function refresh() {
  const next = read();
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useNotificationStatus(): NotificationStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}

export async function setupNotifications(): Promise<void> {
  refresh();
}

export async function requestNotificationPermission(): Promise<void> {
  try {
    const n = api();
    if (n && n.permission === 'default') await n.requestPermission();
  } catch {
    // ignoré
  }
  refresh();
}

export function scheduleSetEnd(_endAt: number, _setNumber: number, _sets: number) {}
export function cancelSetEnd() {}
export function dismissDelivered() {}
export function openNotificationSettings() {}

/** Fin de série pendant que la page est cachée : notification via le service worker (obligatoire sur Android). */
export function showSetDoneNotification(setNumber: number, sets: number) {
  try {
    if (status !== 'granted' || typeof document === 'undefined' || !document.hidden) return;
    const body = setNumber >= sets ? 'Dernière série terminée. Bravo !' : `Série ${setNumber} sur ${sets} terminée. À toi de jouer !`;
    const options = { body, icon: 'icon-192.png', tag: 'set-end', renotify: true, vibrate: [300, 150, 300] } as NotificationOptions;
    void navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification('Binkām', options))
      .catch(() => {
        try {
          new Notification('Binkām', options);
        } catch {
          // ignoré
        }
      });
  } catch {
    // ignoré
  }
}
