# set-timer-app — mémoire du projet

Ce fichier est lu automatiquement par Claude Code à chaque session : le tenir à jour à chaque décision ou étape terminée.

## But
Minuteur de séries pour la salle de sport. Nom affiché : **« Binkām »** (décidé par l'utilisateur ; dépôt / slug Expo : `set-timer-app`, identifiant `com.binkam.app`, schéma `binkam`). Solo, hors ligne, sans compte, Android + iPhone (+ PWA).
Application « sœur » d'Alam (`leroy-jg/multi-level-progress-app`) : même famille de marque, même pile technique.

## Écran unique (demande de l'utilisateur)
1. **Durée** d'une série (mm : ss) — champs numériques + boutons −/+ (pas de 5 s), bornes 00:01 → 99:59.
2. **Nombre de séries** (1 → 99).
3. **Cadran** : un anneau qui se vide vers 00:00, avec **de l'eau** qui baisse dedans ; au centre « **GO** » tant que le chrono ne tourne pas, puis MM:SS ; légende « Série n sur N » / « Terminé ».
4. **Tirets** en bas : un par série, gris puis **blancs** quand la série est terminée ; le tiret de la série en cours se remplit. Ils prennent **toute la largeur** utile (flex, quel que soit leur nombre).
5. **Trois petits boutons** sous le cercle (à bascule, mémorisés, `st:prefs:v1`, tous activés par défaut) : **Son** (sons dans l'app), **Notifs** (notification de fin de série), **Écran** (écran allumé pendant le décompte).
Plus de bouton Démarrer / Pause / Réinitialiser, plus de texte d'aide (demande explicite).

### Comportement (décidé avec l'utilisateur)
- **Appui sur le centre du cadran** : « GO » lance la série (repart toujours de la durée pleine) ; pendant le décompte, l'appui la **termine et la compte** (`skip`), chrono à 00:00 en attente du prochain « GO ».
  Après « Terminé », « GO » relance une nouvelle partie. **Pas de pause** (supprimée : la phase `paused` n'existe plus ; un ancien état enregistré « paused » retombe sur l'état neutre).
- **Réinitialisation** = changer la durée ou le nombre de séries (modifiables **à tout moment**, même en plein décompte) → tout repart de zéro, notification annulée. Une valeur identique ne remet rien à zéro
  (important : quitter un champ sans le changer ne doit pas tuer le décompte).
- **Cercle** = temps **restant**, qui se vide dans le sens des aiguilles d'une montre vers 00:00 ; le point de départ de l'arc avance (curseur blanc dessus).
  **Appuyer / glisser sur l'anneau** pendant le décompte déplace l'horloge : le point touché = part **écoulée** (un quart du cercle = un quart du temps écoulé : 2 min → 1:30). Reculer = rajouter du temps.
  Jamais moins de 1 s restante. Logique : `seek`, `angleFraction`, `unwrapFraction`.
- **Eau** (`src/ui/Water.tsx`) : disque dans l'anneau, niveau = temps restant ; deux vagues en sens inverse, ligne claire à la surface, quatre bulles. Tout est animé par le **pilote natif** (`Animated`, `useNativeDriver`) :
  le niveau descend d'un seul geste jusqu'à l'heure de fin (recalé au retour au premier plan et quand l'horloge est déplacée), sans redessiner l'écran. Immobile à l'arrêt.
- **Sons dans l'app** (si « Son » activé) : court son au « GO » (`go.wav`), à la fin de série (`end.wav`, aussi à l'appui sur le chrono), arpège à la dernière (`final.wav`). Générés par `node scripts/make-sounds.mjs`
  (`assets/sounds/`, ≈ 70 Ko) ; lus par `expo-audio` (`src/ui/sound.ts`, mode silencieux de l'iPhone respecté, musique de la salle seulement baissée : `duckOthers`) ; sur le web, mêmes notes en Web Audio (`sound.web.ts`).
  La fin naturelle vibre aussi (`alert.ts`). Aucun signal si l'app est rouverte plus de 3 s après l'heure de fin.
- **Hors de l'app** (arrière-plan, écran verrouillé, app tuée) — **Android (APK)** : une **alarme native** (`AlarmManager`, module `modules/live-timer`) est armée dès le Go ; à 00:00 son récepteur (`EndReceiver`) affiche la
  notification de fin (bandeau + son + vibration du canal `set-end`, catégorie *alarme*), **même si l'app a été fermée par le système et qu'on soit ou non dans l'app**. Alarme exacte si le téléphone l'autorise, sinon
  `setAlarmClock` (reste exacte, sans autorisation). Hors Android natif (Expo Go, iPhone) ou si l'alarme native échoue : **repli** sur la notification programmée d'`expo-notifications` (`scheduleSetEnd`, déclencheur `DATE`, canal `set-end`
  importance MAX) — c'est `startLiveTimer()` qui renvoie `false` ; `useTimer` programme alors celle d'expo.
  Quand la notification de fin s'affiche (« Notifs » actif, autorisation accordée), l'app ne vibre pas en plus (deux vibrations superposées) et ne joue que son bip si « Son » est actif.
  **Piège (cause du « pas de notif » en 1.2.1 au premier plan)** : avec `shouldPlaySound: false`, `expo-notifications` rend la notification *silencieuse* (`setSilent`) sur Android → ni bandeau, ni son, ni vibration. Ne jamais remettre
  `false` dans le handler (gardé par `src/notifications.test.ts`).
  Replanifiée (anti-rebond 200 ms) quand on déplace l'horloge, annulée à l'appui sur le chrono / au changement de réglage / bouton « Notifs » coupé, **jamais annulée à 00:00 naturel** (course avec l'alarme : `cancelSystemAlerts` n'est
  appelé que pour une série arrêtée avant l'heure).
- **Compte à rebours persistant + service (Android, 1.3.0)** : dès le « Go » (si « Notifs » actif et autorisation accordée), un **service au premier plan** (`TimerService`, type `specialUse`) affiche une notification
  **persistante** (`ongoing`) avec le temps restant qui défile dans la barre / sur l'écran verrouillé. C'est le système qui anime le chrono (`setUsesChronometer` + `setChronometerCountDown`, `when` = heure de fin) : aucun JS ne tourne.
  Tant que le service tourne, Android ne ferme pas l'app en arrière-plan (réponse au « pas de notif hors de l'app »). Il s'arrête à l'alarme de fin (`EndReceiver`), à l'arrêt de la série, ou seul 15 s après l'heure de fin (sécurité).
  Si Android refuse le service : même notification affichée sans service (`notifyLive`, retirée à l'heure de fin par `setTimeoutAfter`) ; l'alarme reste armée. Canal discret `set-live` (importance LOW), ids 4242 (compte à rebours) / 4243 (fin).
  Module natif local `modules/live-timer` (Kotlin, API Expo Modules, lié tout seul : dossier `modules/`, **pas** de `package.json`) : `LiveTimerModule` (pont JS : `start / stop / isBackgroundUnrestricted / requestBackgroundUnrestricted`), `TimerNotifications`
  (alarme, notifications, canaux), `TimerService`, `EndReceiver`, `AndroidManifest.xml` (service, récepteur, permissions). Enveloppe JS : `src/liveTimer.ts` (`requireOptionalNativeModule`, sans effet sur Expo Go / iPhone / web ; `liveTimer.web.ts` = vide).
  **Autorisations demandées à l'utilisateur** : notifications (fenêtre du système au premier Go, existant) et **« rester actif en arrière-plan »** (exemption d'économie de batterie, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) : une ligne cliquable sous les
  trois boutons (`useBackgroundRestricted`, relue au retour dans l'app) ouvre la fenêtre du système ; masquée jusqu'au prochain lancement une fois touchée. Permissions ajoutées (toutes sans accès à Internet) : `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_SPECIAL_USE`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (liste blanche du workflow mise à jour ; le workflow vérifie aussi que le service et le récepteur sont dans l'APK final).
  Limite : l'heure s'affiche dans l'en-tête de la notification (petit sur Android 12+), pas en gros chiffres.
  **`dismissAllNotificationsAsync` est interdit** : sur Android il fait `cancelAll()` et effacerait aussi le compte à rebours (on retire seulement `set-end`).
- **Exactitude Android** : sans `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`, `expo-notifications` retombe sur `setAndAllowWhileIdle` (retard possible de plusieurs minutes en Doze) →
  les deux permissions sont déclarées. Elles n'ouvrent aucun accès à Internet.
- **Robustesse (demande explicite : jamais d'arrêt, jamais de chrono qui saute à 0)** : décompte calculé depuis l'heure de fin (`endAt`), pas en comptant les tops ; l'état du chrono est
  **enregistré à chaque changement** (`st:timer:v1`) et validé strictement au chargement (`sanitizeState`) ; app tuée / rechargée pendant un décompte → il reprend à la bonne valeur, et si l'heure est passée la série est comptée.
  `ErrorBoundary` dans `app/_layout.tsx`. Tous les appels système (notifications, stockage, keep-awake, vibration, son) sont dans des `try/catch`.
- **Légèreté (demande explicite)** : l'écran ne se redessine qu'**une fois par seconde** (minuteur aligné sur le changement de seconde, plus d'intervalle de 100 ms) ; le cercle se redessine **seul** (`useFraction`
  dans `Ring`, ≈ un demi-degré par image, 33–250 ms) et l'eau par le pilote natif ; `Backdrop`, `SettingsCard`, `Dashes`, `ToggleButton`, `Water` sont mémoïsés ; 3 graisses de police au lieu de 5 ;
  APK : ARM seulement (pas de x86), modules GIF / WebP animé et inspecteur réseau désactivés (étape « Alléger l'APK » du workflow). Non fait volontairement : R8 / `minifyEnabled` (risque de crash au lancement impossible à tester sans téléphone).
- Web / PWA : pas de programmation possible → sons + vibration dans la page ; notification via le service worker à 00:00 (page visible ou cachée) si le bouton est actif et la permission accordée
  (meilleur effort ; sur iPhone, seulement PWA installée). **Pas de compte à rebours dans la barre** (une page en arrière-plan ne peut pas mettre à jour une notification ; iPhone : il faudrait une Live Activity native).
  **Pour des notifications fiables : l'APK Android.**

## Charte graphique (famille Alam)
- Inchangés : or `#C9A227` / `#E8A317`, succès, erreur, crème `#F4EBD9`, noir chaud `#1C1A17`, pierre. Police **Raleway**. Design à plat, contours 1 px, pilules.
- **Fond animé** (`src/ui/Backdrop.tsx`) : halos radiaux de pigments de la famille (rose-damas, ciel, pourpre, turquoise) ; le halo derrière le cercle change d'ambiance
  (violet au repos, bleu en décompte, vert à la fin, fondu de 700 ms). L'or reste réservé aux actions (mélangé au violet il donnait du brun).
- **Changent pour cette app** : fond de marque (`ground`) **`#5C2E8A`** (violet « prune », teinte ≈ 272°), fond sombre **`#29143D`**, secondaire **ciel `#5B8FC7`**
  (anneau en thème sombre). Surfaces sombres déduites de la teinte (`darkSurfaces`). Validé par `checkPalette` (`src/brand.test.ts`).
- Règle de la famille : le fond de marque doit avoir une teinte entre 210° et 350° et passer tous les seuils de `checkPalette` (`src/brand.ts`).
  Changer de couleur ⇒ `PALETTE` dans `src/brand.ts`, `app.json` (splash, icône adaptative), `public/index.html` + `manifest.webmanifest`, `PRIMARY` de `scripts/make-icons.mjs` puis relancer le script.
- Thème clair / sombre **automatique** (suit le téléphone), pas de réglage. Tirets « terminés » : blancs en sombre, couleur de marque en clair.

## Architecture
- `src/domain/timer.ts` : logique pure (machine à états `idle | running | done`, horloge passée en paramètre) — testée dans `timer.test.ts`.
- `src/brand.ts` : palette + contrôle d'accord ; `src/ui/theme.tsx` : `themeFor`, `ThemeProvider`.
- `src/domain/prefs.ts` : les trois boutons (`Prefs`, `sanitizePrefs`).
- `src/ui/useTimer.ts` : état, minuteur à la seconde, AppState, keep-awake, enregistrement, alertes, programmation des notifications, préférences ; `components.tsx` : `Ring` (geste = `PanResponder`, centre mesuré
  à l'avance car un appui très bref se termine avant la fin d'une mesure), `Dashes`, `SettingsCard`, `ToggleButton` ; `Water.tsx` : l'eau ; `alert.ts` + `sound(.web).ts` : sons et vibration ; `Backdrop.tsx` : halos.
- `src/notifications.ts` (téléphone) / `notifications.web.ts` (PWA) : même API (`scheduleSetEnd`, `cancelSetEnd`, `requestNotificationPermission`, `useNotificationStatus`…).
- `modules/live-timer/` : module natif Android local (alarme de fin, service et compte à rebours, voir plus haut) ; `src/liveTimer.ts` (enveloppe) / `liveTimer.web.ts` (vide). Compilé seulement par le workflow APK (pas de SDK Android dans le cloud : `dl.google.com` refusé).
- `src/storage.ts` : réglages et état du chrono. `app/index.tsx` : l'écran. `app/_layout.tsx` : polices, thème.
- Web : `public/` (manifest, `sw.js` hors ligne + clic de notification, icônes), CSP `connect-src 'none'` dans `public/index.html`. Icônes : `node scripts/make-icons.mjs` (9 fichiers dont `assets/notification-icon.png`, silhouette blanche Android ; Playwright).

## Distribution
- PWA sur GitHub Pages : `.github/workflows/pages.yml` (sur push `main`) ; Pages est activé (Source : GitHub Actions) et le déploiement de la 1.2.1 a réussi (run 36851186626). Adresse attendue : `https://leroy-jg.github.io/set-timer-app/` (non ouverte depuis le cloud, proxy).
- APK Android : `.github/workflows/android-apk.yml` (à la main ou tag `v*`) → artefact `Binkam-apk` (`Binkam.apk`). Contrôles : manifeste (INTERNET retiré, `allowBackup=false`) puis APK final (`aapt2`,
  **liste blanche de permissions** : POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, ACCESS_NETWORK_STATE, MODIFY_AUDIO_SETTINGS (expo-audio), SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS). Signé avec la clé de debug publique
  du modèle Expo sauf si les 4 secrets `ANDROID_*` existent (`scripts/sign-release.py`). Livrer : incrémenter `version` ET `android.versionCode`.

## Avancement
- [x] Projet créé (Expo 57, TypeScript strict, expo-router, Vitest), écran unique, palette, icône, PWA
- [x] Testé dans Chromium (parcours complet : réglage, décompte, pause, séries, fin, recommencer, persistance, aucune requête externe)
- [x] v1.1.0 : notifications de fin de série, Binkām, halos, déplacer l'horloge sur le cercle, appui sur le chrono, persistance du chrono, ErrorBoundary. 27 tests unitaires ;
      parcours Chromium (appui / glissement sur le cercle, appui sur le chrono, pause, rechargement en décompte / en pause / après l'heure de fin, données abîmées, aucune requête externe) ;
      manifeste généré par `expo prebuild` vérifié (INTERNET retiré, permissions d'alarme exactes, icône de notification).
- [x] PR n° 1 fusionnée dans `main` (commit `68cf04b`) ; APK 1.1.0 construit sur `main` (run 36787244022, artefact `Binkam-apk`, ≈ 49 Mo).
- [x] v1.2.0 (`versionCode` 2) : GO / arrêt au centre, plus de boutons Démarrer-Pause-Reset ni de texte d'aide, réglages modifiables en cours de route (= remise à zéro), cadran sur une seule ligne,
      tirets pleine largeur, sons départ / fin dans l'app, trois boutons (son, notifs, écran allumé), eau dans le cadran, allègement (voir « Légèreté »). 28 tests unitaires ; parcours Chromium complet
      (GO, arrêt, réglages en cours de décompte, tirets, 99:59 sur une ligne, boutons mémorisés, clic au quart du cercle = 1:30, rechargement en décompte).
- [x] v1.2.1 (`versionCode` 3) : la notification de fin s'affiche aussi quand l'app est au premier plan (si « Notifs » actif) ; bip + vibration inchangés.
- [x] v1.3.0 (`versionCode` 4) : retour utilisateur « les notifs n'arrivent pas quand je suis sur un autre écran » (APK) → **alarme native + service au premier plan + compte à rebours persistant** (module `modules/live-timer`) et demande d'exemption
      de batterie ; **correctif** de la notification au premier plan (elle était silencieuse, voir « Piège »). 37 tests ; export web OK ; `expo prebuild` : le module est lié (classe `expo.modules.livetimer.LiveTimerModule`), icône `notification_icon` générée.
      **Kotlin non compilé localement** (pas de SDK Android dans le cloud) : validé par le build CI de la branche.
- [ ] **Jamais exécuté sur téléphone** : notifications programmées, sons `expo-audio` (fichiers WAV), vibration, canal Android, demande d'autorisation, keep-awake, AsyncStorage natif, clavier numérique,
      geste au doigt sur le cercle, animation native de l'eau, **alarme native + service + compte à rebours** (module Kotlin), bandeau de fin au premier plan, demande d'exemption de batterie
- [ ] Idées : son perso (plugin `expo-notifications` `sounds`, à tester sur téléphone), enchaînement automatique, presets de durée, annuler un appui involontaire sur le chrono, R8 pour alléger encore l'APK (à tester sur téléphone)

## Notes techniques
- `npx expo install` échoue dans le cloud (proxy) : `npm install pkg@version` avec les versions de `node_modules/expo/bundledNativeModules.json`.
- Test web : `CI=1 npx expo export --platform web --output-dir dist`, servir `dist/`, piloter avec Playwright (`/opt/node22/lib/node_modules/playwright`,
  `executablePath: '/opt/pw-browsers/chromium'`, `--no-sandbox`). Dans les tests, utiliser `{ exact: true }` pour `getByLabel` (« Secondes » ≈ « Durée −5 secondes »).
- Test geste sur web : `page.mouse.click/down/move/up` sur l'anneau (rayon = taille/2 − trait/2) ; le centre est le bouton « Go, lancer le chrono » / « Terminer la série ». Les boutons à bascule exposent `aria-checked`.
- Arrêter un serveur de test : `fuser -k PORT/tcp` (pas de `pkill -f`).

## Conventions
- Développement sur la branche désignée par la session ; pas de PR sans demande explicite. Ne jamais commiter `node_modules/` ni `dist/`.
- Commandes : `npm start`, `npm test`, `npm run typecheck`.
