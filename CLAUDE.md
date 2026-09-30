# set-timer-app — mémoire du projet

Ce fichier est lu automatiquement par Claude Code à chaque session : le tenir à jour à chaque décision ou étape terminée.

## But
Minuteur de séries pour la salle de sport. Nom affiché : **« Set Timer »** (provisoire). Solo, hors ligne, sans compte, Android + iPhone (+ PWA).
Application « sœur » d'Alam (`leroy-jg/multi-level-progress-app`) : même famille de marque, même pile technique.

## Écran unique (demande de l'utilisateur)
1. **Durée** d'une série (mm : ss) — champs numériques + boutons −/+ (pas de 5 s), bornes 00:01 → 99:59.
2. **Nombre de séries** (1 → 99).
3. **Cadran** : MM:SS au centre d'un anneau qui se vide vers 00:00 ; légende « Série n sur N ».
4. **Tirets** en bas : un par série, gris puis **blancs** quand la série est terminée ; le tiret de la série en cours se remplit au fil du temps.
4.5. Boutons Démarrer/Pause, Réinitialiser (Recommencer quand tout est fini).

### Comportement retenu (à confirmer avec l'utilisateur)
- À 00:00 : vibration (+ bip sur le web), tiret terminé, le minuteur se **remet à la durée pleine et attend** qu'on appuie sur Démarrer pour la série suivante
  (pas d'enchaînement automatique). Après la dernière : « Terminé ».
- Réglages modifiables seulement avant de commencer (ou après Réinitialiser) ; mémorisés sur l'appareil (AsyncStorage / localStorage, clé `st:config:v1`).
- Décompte calculé depuis l'heure réelle (exact si l'app passe en arrière-plan) ; écran gardé allumé pendant le décompte (`expo-keep-awake`).
- **Pas de notification en arrière-plan** (téléphone verrouillé / onglet inactif : pas de son ni de vibration avant le retour dans l'app). Piste : `expo-notifications`.
- Pas de son sur téléphone natif (vibration seulement). Piste : `expo-audio` + un bip généré.

## Charte graphique (famille Alam)
- Inchangés : or `#C9A227` / `#E8A317`, succès, erreur, crème `#F4EBD9`, noir chaud `#1C1A17`, pierre. Police **Raleway**. Design à plat, contours 1 px, pilules.
- **Changent pour cette app** : fond de marque (`ground`) **`#5C2E8A`** (violet « prune », teinte ≈ 272°), fond sombre **`#29143D`**, secondaire **ciel `#5B8FC7`**
  (anneau en thème sombre). Surfaces sombres déduites de la teinte (`darkSurfaces`). Validé par `checkPalette` (`src/brand.test.ts`).
- Règle de la famille : le fond de marque doit avoir une teinte entre 210° et 350° et passer tous les seuils de `checkPalette` (`src/brand.ts`).
  Changer de couleur ⇒ `PALETTE` dans `src/brand.ts`, `app.json` (splash, icône adaptative), `public/index.html` + `manifest.webmanifest`, `PRIMARY` de `scripts/make-icons.mjs` puis relancer le script.
- Thème clair / sombre **automatique** (suit le téléphone), pas de réglage. Tirets « terminés » : blancs en sombre, couleur de marque en clair.

## Architecture
- `src/domain/timer.ts` : logique pure (machine à états `idle | running | paused | done`, horloge passée en paramètre) — testée dans `timer.test.ts`.
- `src/brand.ts` : palette + contrôle d'accord ; `src/ui/theme.tsx` : `themeFor`, `ThemeProvider`.
- `src/ui/useTimer.ts` : état, intervalle 100 ms, keep-awake, alertes ; `components.tsx` : `Ring`, `Dashes`, `SettingsCard`, boutons ; `alert.ts` : vibration / bip Web Audio.
- `src/storage.ts` : réglages. `app/index.tsx` : l'écran. `app/_layout.tsx` : polices, thème.
- Web : `public/` (manifest, `sw.js` hors ligne, icônes), CSP `connect-src 'none'` dans `public/index.html`. Icônes : `node scripts/make-icons.mjs` (8 fichiers, Playwright).

## Distribution
- PWA sur GitHub Pages : `.github/workflows/pages.yml` (sur push `main`) — **à activer** : Réglages → Pages → Source : GitHub Actions.
- APK Android : pas encore de workflow (à reprendre d'Alam si souhaité). Identifiant : `com.settimer.app`.

## Avancement
- [x] Projet créé (Expo 57, TypeScript strict, expo-router, Vitest), écran unique, palette, icône, PWA
- [x] Testé dans Chromium (parcours complet : réglage, décompte, pause, séries, fin, recommencer, persistance, aucune requête externe)
- [ ] **Jamais exécuté sur téléphone** (vibration, keep-awake, AsyncStorage natif, clavier numérique)
- [ ] Idées : notification en fin de série quand l'app est en arrière-plan, son natif, enchaînement automatique, presets de durée

## Notes techniques
- `npx expo install` échoue dans le cloud (proxy) : `npm install pkg@version` avec les versions de `node_modules/expo/bundledNativeModules.json`.
- Test web : `CI=1 npx expo export --platform web --output-dir dist`, servir `dist/`, piloter avec Playwright (`/opt/node22/lib/node_modules/playwright`,
  `executablePath: '/opt/pw-browsers/chromium'`, `--no-sandbox`). Dans les tests, utiliser `{ exact: true }` pour `getByLabel` (« Secondes » ≈ « Durée −5 secondes »).
- Arrêter un serveur de test : `fuser -k PORT/tcp` (pas de `pkill -f`).

## Conventions
- Développement sur la branche désignée par la session ; pas de PR sans demande explicite. Ne jamais commiter `node_modules/` ni `dist/`.
- Commandes : `npm start`, `npm test`, `npm run typecheck`.
