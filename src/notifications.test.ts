import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// chemins relatifs à la racine du projet (là où `vitest` est lancé)
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// Ces garde-fous protègent des réglages qu'on ne peut pas voir en lançant l'app dans un navigateur : ils n'existent que sur Android.
describe('notifications Android', () => {
  it("au premier plan, la notification de fin garde son son (sinon expo-notifications la rend silencieuse : ni bandeau ni vibration)", () => {
    expect(read('src/notifications.ts')).toMatch(/shouldPlaySound:\s*true/);
  });

  it("le compte à rebours en direct n'est pas retiré par dismissAllNotificationsAsync (qui efface toutes les notifications de l'app)", () => {
    expect(read('src/notifications.ts')).not.toMatch(/dismissAllNotificationsAsync\(/);
  });

  it('le module natif du compte à rebours est un vrai chronomètre à rebours, retiré tout seul à l’heure de fin', () => {
    const kotlin = read('modules/live-timer/android/src/main/java/expo/modules/livetimer/LiveTimerModule.kt');
    for (const call of ['setUsesChronometer(true)', 'setChronometerCountDown(true)', 'setWhen(endAt)', 'setTimeoutAfter(remaining)']) {
      expect(kotlin).toContain(call);
    }
  });

  it('le module natif est déclaré pour Android seulement et se lie tout seul (dossier modules/)', () => {
    const config = JSON.parse(read('modules/live-timer/expo-module.config.json'));
    expect(config.platforms).toEqual(['android']);
    expect(config.android.modules).toEqual(['expo.modules.livetimer.LiveTimerModule']);
  });
});
