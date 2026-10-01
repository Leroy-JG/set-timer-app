/**
 * Notification de fin de série (téléphone) : programmée auprès du système dès le « Go », donc elle sonne et vibre
 * même si l'app est en arrière-plan, l'écran verrouillé, ou si le système a fermé l'app pour libérer de la mémoire.
 * Le son et la vibration suivent les réglages du téléphone (mode vibreur = vibration seule, mode silencieux = rien).
 * Quand l'app est au premier plan, elle s'affiche de la même façon (bandeau, son et vibration du téléphone) : il ne faut surtout pas
 * lui retirer le son, car `expo-notifications` la rend alors « silencieuse » (ni bandeau ni vibration, seulement une ligne discrète
 * dans la barre). Dans ce cas l'app ne vibre pas elle-même (voir `useTimer`).
 */
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

const CHANNEL = 'set-end';
const ID = 'set-end';
const TITLE = 'Binkām';

export type NotificationStatus = 'unknown' | 'granted' | 'denied';

let status: NotificationStatus = 'unknown';
const listeners = new Set<() => void>();
function setStatus(next: NotificationStatus) {
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

// Les appels au système sont exécutés un par un, dans l'ordre, et ne font jamais planter l'app.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<unknown>) {
  queue = queue.then(task).catch(() => {});
}

let hasScheduled = false;

export async function setupNotifications(): Promise<void> {
  try {
    // App au premier plan : la notification s'affiche quand même (elle n'est programmée que si le bouton est activé), avec bandeau,
    // son et vibration. Avec `shouldPlaySound: false`, Android la présente en « silencieux » (aucun bandeau) : on ne le met pas.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      // Le canal doit exister avant la demande d'autorisation (Android 13+).
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Fin de série',
        description: 'Prévient quand le chrono d’une série arrive à 00:00',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        enableVibrate: true,
        vibrationPattern: [0, 500, 250, 500],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      });
    }
    // Une notification programmée par une session précédente est reprogrammée, si besoin, à partir de l'état enregistré.
    await Notifications.cancelAllScheduledNotificationsAsync();
    const current = await Notifications.getPermissionsAsync();
    setStatus(current.granted ? 'granted' : current.canAskAgain ? 'unknown' : 'denied');
  } catch {
    // notifications indisponibles : la vibration dans l'app prend le relais
  }
}

/** À appeler quand l'utilisateur appuie sur « Démarrer » (la demande s'affiche une seule fois). */
export async function requestNotificationPermission(): Promise<void> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return setStatus('granted');
    if (!current.canAskAgain) return setStatus('denied');
    const asked = await Notifications.requestPermissionsAsync();
    setStatus(asked.granted ? 'granted' : 'denied');
  } catch {
    // ignoré
  }
}

/** Programme (ou remplace) la notification de fin de la série en cours. */
export function scheduleSetEnd(endAt: number, setNumber: number, sets: number) {
  if (status !== 'granted') return;
  hasScheduled = true;
  enqueue(async () => {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (endAt - Date.now() < 700) return; // trop tard : le décompte dans l'app s'en charge
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: TITLE,
        body: setNumber >= sets ? 'Dernière série terminée. Bravo !' : `Série ${setNumber} sur ${sets} terminée. À toi de jouer !`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endAt, channelId: CHANNEL },
    });
  });
}

export function cancelSetEnd() {
  if (!hasScheduled) return;
  hasScheduled = false;
  enqueue(() => Notifications.cancelScheduledNotificationAsync(ID));
}

/**
 * Retire de la barre la notification de fin de la série précédente.
 * (Pas `dismissAllNotificationsAsync` : sur Android il retirerait aussi le compte à rebours en direct, voir `liveTimer.ts`.)
 */
export function dismissDelivered() {
  enqueue(() => Notifications.dismissNotificationAsync(ID));
}

/** Notifications refusées : ouvre les réglages du téléphone. */
export function openNotificationSettings() {
  void Linking.openSettings().catch(() => {});
}

/** Fin de série constatée dans l'app : sur téléphone, la notification programmée s'affiche d'elle-même (rien à faire ici). */
export function showSetDoneNotification(_setNumber: number, _sets: number) {}
