import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// chemins relatifs à la racine du projet (là où `vitest` est lancé)
const KOTLIN = 'modules/live-timer/android/src/main/java/expo/modules/livetimer';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// Ces garde-fous protègent des réglages qu'on ne peut pas voir en lançant l'app dans un navigateur : ils n'existent que sur Android.
describe('notifications Android', () => {
  it("au premier plan, la notification de fin garde son son (sinon expo-notifications la rend silencieuse : ni bandeau ni vibration)", () => {
    expect(read('src/notifications.ts')).toMatch(/shouldPlaySound:\s*true/);
  });

  it("le compte à rebours n'est pas retiré par dismissAllNotificationsAsync (qui efface toutes les notifications de l'app)", () => {
    expect(read('src/notifications.ts')).not.toMatch(/dismissAllNotificationsAsync\(/);
  });

  it('le compte à rebours est un vrai chronomètre à rebours, persistant', () => {
    const kotlin = read(`${KOTLIN}/TimerNotifications.kt`);
    for (const call of ['setUsesChronometer(true)', 'setChronometerCountDown(true)', 'setWhen(endAt)', 'setTimeoutAfter(remaining)', 'setOngoing(true)']) {
      expect(kotlin).toContain(call);
    }
  });

  it("la fin de série est une notification ordinaire (pas une sonnerie de réveil), relayée sur les montres connectées", () => {
    const kotlin = read(`${KOTLIN}/TimerNotifications.kt`);
    expect(kotlin).toContain('setExactAndAllowWhileIdle');
    expect(kotlin).toContain('setLocalOnly(false)');
    // « alarme de réveil » (icône d'alarme, prochain réveil affiché) et catégorie « alarme » (passe le mode Ne pas déranger) : refusés par l'utilisateur
    expect(kotlin).not.toContain('setAlarmClock');
    expect(kotlin).not.toContain('CATEGORY_ALARM');
    expect(kotlin).not.toContain('USAGE_ALARM');
    expect(read(`${KOTLIN}/EndReceiver.kt`)).toContain('postDone');
  });

  it('le service du chrono est déclaré avec son type, le récepteur aussi, sans accès à Internet', () => {
    const manifest = read('modules/live-timer/android/src/main/AndroidManifest.xml');
    expect(manifest).toContain('expo.modules.livetimer.TimerService');
    expect(manifest).toContain('android:foregroundServiceType="specialUse"');
    expect(manifest).toContain('expo.modules.livetimer.EndReceiver');
    expect(manifest).toContain('expo.modules.livetimer.LiveDismissReceiver');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_SPECIAL_USE');
    expect(manifest).not.toContain('android.permission.INTERNET');
  });

  it("les permissions du module natif sont autorisées explicitement par le workflow de l'APK (liste blanche)", () => {
    const workflow = read('.github/workflows/android-apk.yml');
    for (const p of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'POST_PROMOTED_NOTIFICATIONS']) {
      expect(workflow).toContain(` android.permission.${p} `);
    }
  });

  it('le module natif est déclaré pour Android seulement et se lie tout seul (dossier modules/)', () => {
    const config = JSON.parse(read('modules/live-timer/expo-module.config.json'));
    expect(config.platforms).toEqual(['android']);
    expect(config.android.modules).toEqual(['expo.modules.livetimer.LiveTimerModule']);
  });

  it("le test de bout en bout sur émulateur existe et couvre l'écran verrouillé, le volet, le Doze et l'arrêt", () => {
    const script = read('scripts/e2e-android.sh');
    for (const needle of ['locksettings set-pin', 'expand-notifications', 'deviceidle force-idle', 'Terminer la série', 'channel=set-live', 'channel=set-end']) {
      expect(script).toContain(needle);
    }
    expect(read('.github/workflows/android-e2e.yml')).toContain('android-emulator-runner');
  });
});
