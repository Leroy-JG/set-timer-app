# set-timer-app — mémoire du projet

Ce fichier est lu automatiquement par Claude Code à chaque session : le tenir à jour à chaque décision ou étape terminée.

## But
Minuteur de séries pour la salle de sport. Nom affiché : **« Binkām »** (décidé par l'utilisateur ; dépôt / slug Expo : `set-timer-app`, identifiant `com.binkam.app`, schéma `binkam`). Solo, hors ligne, sans compte, Android + iPhone (+ PWA).
Application « sœur » d'Alam (`leroy-jg/multi-level-progress-app`) : même famille de marque, même pile technique.

## Écran unique (demande de l'utilisateur)
1. **Durée** d'une série (mm : ss) — champs numériques + boutons −/+ (pas de 5 s), bornes 00:01 → 99:59.
2. **Nombre de séries** (1 → 99).
3. **Cadran** : MM:SS au centre d'un anneau qui se vide vers 00:00 ; légende « Série n sur N ».
4. **Tirets** en bas : un par série, gris puis **blancs** quand la série est terminée ; le tiret de la série en cours se remplit au fil du temps.
4.5. Boutons Démarrer/Pause, Réinitialiser (Recommencer quand tout est fini).

### Comportement (décidé avec l'utilisateur)
- **Cercle** = temps **restant**, qui se vide dans le sens des aiguilles d'une montre vers 00:00 ; le point de départ de l'arc avance (curseur blanc dessus).
- **Appuyer / glisser sur le cercle** (en marche ou en pause) déplace l'horloge : le point touché = part **écoulée** (un quart du cercle = un quart du temps écoulé :
  2 min → 1:30). Reculer = rajouter du temps. Jamais moins de 1 s restante (seul le temps ou l'appui sur le chrono termine la série). Logique : `seek`, `angleFraction`, `unwrapFraction`.
- **Appuyer sur le chrono** (centre) : la série est terminée **et comptée**, chrono à **00:00**, en attente du prochain « Go » (`skip`). Même état après une fin naturelle :
  le chrono reste à 00:00 (légende « Prêt · série n sur N »), le « Go » repart de la durée pleine. Pas d'enchaînement automatique. Après la dernière : « Terminé » (anneau vert plein).
- **Fin de série** : notification système + vibration + son (le son suit le mode du téléphone : vibreur = vibration seule). Sur téléphone la notification est **programmée
  auprès du système dès le Go** (`expo-notifications`, déclencheur `DATE`, canal `set-end` importance MAX) → elle sonne app en arrière-plan, écran verrouillé, ou app tuée.
  Replanifiée (anti-rebond 200 ms) quand on déplace l'horloge, annulée à la pause / appui sur le chrono / réinitialisation, **jamais annulée à 00:00 naturel** (course avec l'alarme).
  Son = son de notification par défaut du système (un son perso non testé sur téléphone risquerait le silence).
- **Exactitude Android** : sans `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`, `expo-notifications` retombe sur `setAndAllowWhileIdle` (retard possible de plusieurs minutes en Doze) →
  les deux permissions sont déclarées (un minuteur est une app « alarme/minuteur » autorisée à `USE_EXACT_ALARM`). Elles n'ouvrent aucun accès à Internet.
- **Robustesse (demande explicite : jamais d'arrêt, jamais de chrono qui saute à 0)** : décompte calculé depuis l'heure de fin (`endAt`), pas en comptant les tops ; l'état du chrono est
  **enregistré à chaque changement** (`st:timer:v1`) et validé strictement au chargement (`sanitizeState` : toute donnée abîmée → état neutre, jamais un chrono faux) ; app tuée / rechargée
  pendant un décompte → il reprend à la bonne valeur, et si l'heure est passée la série est comptée (sans refaire de son). Temps restant borné à la durée (horloge système reculée).
  `ErrorBoundary` dans `app/_layout.tsx` (écran « Oups » + Réessayer au lieu d'une app qui se ferme). Tous les appels système (notifications, stockage, keep-awake, vibration) sont dans des `try/catch`.
- Réglages modifiables seulement avant de commencer (ou après Réinitialiser) ; mémorisés sur l'appareil (clé `st:config:v1`). Écran gardé allumé pendant le décompte (`expo-keep-awake`).
- Web / PWA : pas de programmation possible → bip + vibration dans la page ; notification via le service worker seulement si la page est cachée à 00:00 et la permission accordée
  (meilleur effort ; sur iPhone, seulement PWA installée). **Pour des notifications fiables : l'APK Android.**

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
- `src/domain/timer.ts` : logique pure (machine à états `idle | running | paused | done`, horloge passée en paramètre) — testée dans `timer.test.ts`.
- `src/brand.ts` : palette + contrôle d'accord ; `src/ui/theme.tsx` : `themeFor`, `ThemeProvider`.
- `src/ui/useTimer.ts` : état, intervalle 100 ms, AppState, keep-awake, enregistrement, alertes, programmation des notifications ; `components.tsx` : `Ring` (geste = `PanResponder`, centre mesuré
  à l'avance car un appui très bref se termine avant la fin d'une mesure), `Dashes`, `SettingsCard`, boutons ; `alert.ts` : vibration / bip Web Audio ; `Backdrop.tsx` : halos.
- `src/notifications.ts` (téléphone) / `notifications.web.ts` (PWA) : même API (`scheduleSetEnd`, `cancelSetEnd`, `requestNotificationPermission`, `useNotificationStatus`…).
- `src/storage.ts` : réglages et état du chrono. `app/index.tsx` : l'écran. `app/_layout.tsx` : polices, thème.
- Web : `public/` (manifest, `sw.js` hors ligne + clic de notification, icônes), CSP `connect-src 'none'` dans `public/index.html`. Icônes : `node scripts/make-icons.mjs` (9 fichiers dont `assets/notification-icon.png`, silhouette blanche Android ; Playwright).

## Distribution
- PWA sur GitHub Pages : `.github/workflows/pages.yml` (sur push `main`) — **à activer** : Réglages → Pages → Source : GitHub Actions.
- APK Android : `.github/workflows/android-apk.yml` (à la main ou tag `v*`) → artefact `Binkam-apk` (`Binkam.apk`). Contrôles : manifeste (INTERNET retiré, `allowBackup=false`) puis APK final (`aapt2`,
  **liste blanche de permissions** : POST_NOTIFICATIONS, VIBRATE, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, ACCESS_NETWORK_STATE, SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM). Signé avec la clé de debug publique
  du modèle Expo sauf si les 4 secrets `ANDROID_*` existent (`scripts/sign-release.py`). Livrer : incrémenter `version` ET `android.versionCode`.

## Avancement
- [x] Projet créé (Expo 57, TypeScript strict, expo-router, Vitest), écran unique, palette, icône, PWA
- [x] Testé dans Chromium (parcours complet : réglage, décompte, pause, séries, fin, recommencer, persistance, aucune requête externe)
- [x] v1.1.0 : notifications de fin de série, Binkām, halos, déplacer l'horloge sur le cercle, appui sur le chrono, persistance du chrono, ErrorBoundary. 27 tests unitaires ;
      parcours Chromium (appui / glissement sur le cercle, appui sur le chrono, pause, rechargement en décompte / en pause / après l'heure de fin, données abîmées, aucune requête externe) ;
      manifeste généré par `expo prebuild` vérifié (INTERNET retiré, permissions d'alarme exactes, icône de notification).
- [ ] **Jamais exécuté sur téléphone** : notifications programmées, son / vibration, canal Android, demande d'autorisation, keep-awake, AsyncStorage natif, clavier numérique, geste au doigt sur le cercle
- [ ] Idées : son perso (plugin `expo-notifications` `sounds`, à tester sur téléphone), enchaînement automatique, presets de durée, annuler un appui involontaire sur le chrono

## Notes techniques
- `npx expo install` échoue dans le cloud (proxy) : `npm install pkg@version` avec les versions de `node_modules/expo/bundledNativeModules.json`.
- Test web : `CI=1 npx expo export --platform web --output-dir dist`, servir `dist/`, piloter avec Playwright (`/opt/node22/lib/node_modules/playwright`,
  `executablePath: '/opt/pw-browsers/chromium'`, `--no-sandbox`). Dans les tests, utiliser `{ exact: true }` pour `getByLabel` (« Secondes » ≈ « Durée −5 secondes »).
- Test geste sur web : `page.mouse.click/down/move/up` sur l'anneau (rayon = taille/2 − trait/2) ; le centre est le bouton « Terminer la série ».
- Arrêter un serveur de test : `fuser -k PORT/tcp` (pas de `pkill -f`).

## Conventions
- Développement sur la branche désignée par la session ; pas de PR sans demande explicite. Ne jamais commiter `node_modules/` ni `dist/`.
- Commandes : `npm start`, `npm test`, `npm run typecheck`.
