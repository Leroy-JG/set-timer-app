#!/usr/bin/env bash
# Test de bout en bout de Binkām sur un émulateur Android (lancé par .github/workflows/android-e2e.yml, ou à la main avec un
# émulateur déjà démarré : `bash scripts/e2e-android.sh chemin/vers/app-release.apk [dossier-de-sortie]`).
#
# Ce qu'il vérifie, comme un vrai utilisateur (appuis, écran verrouillé par un code PIN, mode Doze forcé), via `adb` :
#   1. « GO » → le compte à rebours persistant existe (chronomètre à rebours, service au premier plan, minuterie de fin programmée)
#   2. il est dans le volet de notifications (on tire depuis le haut) et sur l'écran verrouillé quand on rallume l'écran
#   3. il reste quand on quitte l'app (écran d'accueil)
#   4. écran éteint + verrouillé + Doze forcé : la notification de fin arrive à 00:00 (bandeau, son, vibration) et le compte à rebours disparaît
#   5. appui sur le chrono (arrêt) : plus de compte à rebours ni de minuterie, et pas de notification de fin
#   6. fin de série avec l'app au premier plan : la notification de fin s'affiche aussi
#   7. aucune plantage (logcat)
# Sorties (captures d'écran, `dumpsys notification`, logcat…) dans le dossier de sortie, joint au run en artefact.
set -u
export LANG=C.UTF-8

APK="${1:?chemin de l APK}"
OUT="${2:-e2e-out}"
PKG=com.binkam.app
PIN=1234
mkdir -p "$OUT"
: >"$OUT/summary.txt"
FAILS=0
WARNS=0

say() { echo "$*" | tee -a "$OUT/summary.txt"; }
pass() { say "✅ $*"; }
fail() { say "❌ $*"; FAILS=$((FAILS + 1)); }
warn() { say "⚠️  $*"; WARNS=$((WARNS + 1)); }
step() { say ""; say "=== $* ==="; }
a() { adb shell "$@"; }
now_ms() { date +%s%3N; }

# --- outils d'analyse (Python) -------------------------------------------------------------------------------------------------
# notif_block FICHIER ID : affiche le bloc `dumpsys notification` de la notification n° ID de l'app (vide si absente)
notif_block() {
  python3 - "$1" "$PKG" "$2" <<'EOF'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
pkg, nid = sys.argv[2], sys.argv[3]
parts = re.split(r"(?m)^\s*NotificationRecord\(", text)
for part in parts[1:]:
    head = part.split("\n", 1)[0]
    if f"pkg={pkg} " in head and f" id={nid} " in head:
        # le bloc s'arrête au prochain enregistrement (déjà coupé par le split) ou à la fin des enregistrements
        print("NotificationRecord(" + part.split("\n  Ranking", 1)[0])
        break
EOF
}

# bounds FICHIER_UI CHAMP VALEUR [PAQUET] : centre et taille (cx cy w h) du premier nœud dont CHAMP (text, content-desc) contient VALEUR
bounds() {
  python3 - "$1" "$2" "$3" "${4:-}" <<'EOF'
import re, sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(1)
field, value, pkg = sys.argv[2], sys.argv[3], sys.argv[4]
for node in root.iter("node"):
    if pkg and node.attrib.get("package") != pkg:
        continue
    if value in node.attrib.get(field, ""):
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            print((x1 + x2) // 2, (y1 + y2) // 2, x2 - x1, y2 - y1)
            sys.exit(0)
sys.exit(1)
EOF
}

# ui_has FICHIER_UI MOTIF_REGEX [PAQUET] : un nœud de l'interface du système (barre / volet / écran verrouillé) contient le motif
# (pas l'app elle-même, qui peut se trouver derrière le volet avec les mêmes textes)
ui_has() {
  python3 - "$1" "$2" "${3:-com.android.systemui}" <<'EOF'
import re, sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(1)
pattern, pkg = re.compile(sys.argv[2]), sys.argv[3]
for node in root.iter("node"):
    if node.attrib.get("package") != pkg:
        continue
    for field in ("text", "content-desc"):
        m = pattern.search(node.attrib.get(field, ""))
        if m:
            print(m.group(0))
            sys.exit(0)
sys.exit(1)
EOF
}

# ui_texts FICHIER_UI [PAQUET] : liste les textes / descriptions des nœuds du système (pour comprendre ce que l'écran montre vraiment)
ui_texts() {
  python3 - "$1" "${2:-com.android.systemui}" <<'EOF'
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception as e:
    print("   (dump illisible :", e, ")")
    sys.exit(0)
seen = []
for n in root.iter("node"):
    if n.attrib.get("package") != sys.argv[2]:
        continue
    for f in ("text", "content-desc"):
        v = n.attrib.get(f, "").strip()
        if v and v not in seen:
            seen.append(v)
print("   textes du système :", " | ".join(seen[:40]) if seen else "(aucun)")
EOF
}

# ui NOM : exporte l'arbre d'accessibilité de l'écran dans $OUT/NOM.xml (quelques essais : l'écran bouge parfois)
ui() {
  local n
  for n in 1 2 3 4; do
    a uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    if adb pull /sdcard/ui.xml "$OUT/$1.xml" >/dev/null 2>&1 && [ -s "$OUT/$1.xml" ]; then
      # Fenêtre « … ne répond pas » de l'émulateur (souvent le lanceur, machine de CI lente) : on la ferme avec « Wait » / « Attendre »
      if grep -q "isn't responding\|ne répond pas" "$OUT/$1.xml"; then
        local w
        if w=$(bounds "$OUT/$1.xml" text "Wait") || w=$(bounds "$OUT/$1.xml" text "Attendre"); then
          read -r wx wy _ <<<"$w"
          a input tap "$wx" "$wy"
          sleep 2
          continue
        fi
      fi
      return 0
    fi
    sleep 1
  done
  return 1
}

shot() { adb exec-out screencap -p >"$OUT/$1.png" 2>/dev/null; }
notifs() { a dumpsys notification --noredact >"$OUT/$1.txt" 2>&1; }

# assert_notif FICHIER ID DESCRIPTION motif… : la notification existe et son bloc contient chaque motif
assert_notif() {
  local file="$1" id="$2" desc="$3"
  shift 3
  local block
  block=$(notif_block "$file" "$id")
  if [ -z "$block" ]; then
    fail "$desc : notification $id absente"
    return 1
  fi
  echo "$block" >"$OUT/$(basename "$file" .txt)-id$id.txt"
  local ok=0 p
  for p in "$@"; do
    if ! grep -qF -- "$p" <<<"$block"; then
      fail "$desc : « $p » introuvable dans la notification $id"
      ok=1
    fi
  done
  if [ "$ok" = 0 ]; then pass "$desc"; fi
  return $ok
}

assert_no_notif() {
  local file="$1" id="$2" desc="$3"
  if [ -z "$(notif_block "$file" "$id")" ]; then pass "$desc"; else fail "$desc : la notification $id est encore là"; fi
}

service_state() { a dumpsys activity services "$PKG" 2>/dev/null; }
alarm_state() { a dumpsys alarm 2>/dev/null | grep -c "expo.modules.livetimer.EndReceiver"; }

wake_screen() { a input keyevent 224; sleep 1; }
unlock() {
  wake_screen
  a input swipe $((W / 2)) $((H * 3 / 4)) $((W / 2)) $((H / 4)) 300
  sleep 1
  a input text "$PIN"
  sleep 1
  a input keyevent 66
  sleep 2
}

# tap_go : trouve le bouton central (GO / terminer) et l'appuie ; remplit GO_X, GO_Y, GO_W
find_center_button() {
  ui app
  local label out
  for label in "Go, lancer le chrono" "Terminer la série"; do
    if out=$(bounds "$OUT/app.xml" content-desc "$label"); then
      read -r GO_X GO_Y GO_W _ <<<"$out"
      return 0
    fi
  done
  return 1
}
tap_center() {
  find_center_button || { fail "bouton central introuvable à l'écran"; return 1; }
  a input tap "$GO_X" "$GO_Y"
}

# ---------------------------------------------------------------------------------------------------------------------------------
step "0. Préparation de l'émulateur"
adb wait-for-device
until [ "$(a getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
SDK=$(a getprop ro.build.version.sdk | tr -d '\r')
say "Android API $SDK, $(a getprop ro.product.model | tr -d '\r')"
read -r W H <<<"$(a wm size | tr -d '\r' | tail -1| sed -E 's/.*: ([0-9]+)x([0-9]+).*/\1 \2/')"
say "Écran ${W}x${H}"
a settings put system screen_off_timeout 1800000
a settings put secure lock_screen_show_notifications 1
a settings put secure lock_screen_allow_private_notifications 1
a settings put global heads_up_notifications_enabled 1
a svc power stayon false
a settings put global hide_error_dialogs 1 # pas de fenêtre « ne répond pas » qui masque l'écran (les plantages restent dans logcat)
a input keyevent 82
adb install -r "$APK" >"$OUT/install.txt" 2>&1 && pass "APK installé" || { fail "installation de l'APK : $(tail -2 "$OUT/install.txt")"; exit 1; }
a pm grant "$PKG" android.permission.POST_NOTIFICATIONS && say "autorisation de notifier accordée"
a logcat -c

step "1. Lancement et « GO »"
a monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
for _ in $(seq 1 45); do
  if find_center_button; then break; fi
  sleep 2
done
if [ -z "${GO_X:-}" ]; then
  shot launch-failed
  fail "l'app n'affiche pas le bouton GO (voir launch-failed.png)"
  a logcat -d >"$OUT/logcat.txt" 2>&1
  exit 1
fi
pass "l'app est lancée, bouton GO trouvé ($GO_X,$GO_Y)"
sleep 2
shot 01-avant-go
T_GO=$(now_ms)
a input tap "$GO_X" "$GO_Y"
sleep 5
shot 02-apres-go

step "2. Compte à rebours persistant juste après GO"
notifs after-go
assert_notif "$OUT/after-go.txt" 4242 "compte à rebours : chronomètre à rebours, silencieux, canal dédié" \
  "channel=set-live" "android.showChronometer=true" "android.chronometerCountDown=true" "Série 1 sur 4"
BLOCK=$(notif_block "$OUT/after-go.txt" 4242)
say "   extras de la notification : $(grep -E 'android\.(title|text|showChronometer|chronometerCountDown|showWhen|requestPromotedOngoing)|when=|usesChronometer|chronometer' <<<"$BLOCK" | tr -s ' ' | tr '\n' ';' | cut -c1-400)"
say "   importance : $(grep -o 'importance=[0-9]*' <<<"$BLOCK" | head -1) ; flags : $(grep -o 'flags=0x[0-9a-f]*' <<<"$BLOCK" | head -1) ; visibilité : $(grep -o 'vis=[A-Z]*' <<<"$BLOCK" | head -1)"
FL=$(grep -o 'flags=0x[0-9a-f]*' <<<"$BLOCK" | head -1 | cut -d= -f2)
if [ -n "$FL" ] && [ $((FL & 2)) -ne 0 ]; then pass "notification persistante (drapeau ONGOING, flags=$FL)"; else warn "drapeau ONGOING absent (flags=${FL:-?})"; fi
service_state >"$OUT/services-after-go.txt"
if grep -q "TimerService" "$OUT/services-after-go.txt" && grep -q "isForeground=true" "$OUT/services-after-go.txt"; then
  pass "le service TimerService tourne au premier plan"
else
  fail "TimerService n'est pas au premier plan (voir services-after-go.txt)"
fi
[ "$(alarm_state)" -ge 1 ] && pass "la minuterie de fin (EndReceiver) est programmée dans AlarmManager" || fail "aucune minuterie EndReceiver dans dumpsys alarm"
grep -q "alarm_clock\|AlarmClockInfo" <(a dumpsys alarm 2>/dev/null | grep -B2 -A6 "EndReceiver") && fail "la minuterie de fin est une « alarme de réveil » (setAlarmClock) : refusé" || pass "la minuterie de fin n'est pas une alarme de réveil"

step "3. Volet de notifications (on tire depuis le haut de l'écran)"
a cmd statusbar expand-notifications
sleep 2
shot 03-volet
ui shade
ui_texts "$OUT/shade.xml" | tee -a "$OUT/summary.txt"
if ui_has "$OUT/shade.xml" "Série 1 sur 4" >/dev/null; then pass "le titre « Série 1 sur 4 » est visible dans le volet"; else fail "le compte à rebours n'est pas visible dans le volet (voir 03-volet.png)"; fi
if T=$(ui_has "$OUT/shade.xml" '^[0-9]{1,2}:[0-9]{2}$'); then
  pass "un chronomètre (mm:ss) défile dans le volet : $T"
else
  warn "chronomètre mm:ss non repéré dans l'arbre du volet (voir 03-volet.png)"
fi
a cmd statusbar collapse
sleep 1

step "4. L'utilisateur est sur un autre écran (accueil)"
a input keyevent 3
sleep 3
shot 04-accueil
notifs on-home
assert_notif "$OUT/on-home.txt" 4242 "le compte à rebours reste quand l'app est en arrière-plan" "channel=set-live"

step "5. Téléphone verrouillé (code PIN), on rallume juste l'écran"
a locksettings set-pin "$PIN" >"$OUT/pin.txt" 2>&1 && say "code PIN posé" || warn "impossible de poser un code PIN : $(cat "$OUT/pin.txt")"
a input keyevent 223 # veille
sleep 3
say "   écran : $(a dumpsys power | grep -o 'mWakefulness=[A-Za-z]*' | head -1)"
wake_screen
sleep 3
shot 05-ecran-verrouille
KG=$(a dumpsys window 2>/dev/null | grep -Eo 'mShowingLockscreen=[a-z]+|isKeyguardShowing=[a-z]+|mKeyguardShowing=[a-z]+' | head -2 | tr '\n' ' ')
say "   écran de verrouillage : $KG"
ui lock
ui_texts "$OUT/lock.xml" | tee -a "$OUT/summary.txt"
if ui_has "$OUT/lock.xml" "Série 1 sur 4" >/dev/null; then
  pass "le titre « Série 1 sur 4 » est visible sur l'écran verrouillé"
else
  fail "le compte à rebours n'est pas visible sur l'écran verrouillé (voir 05-ecran-verrouille.png et lock.xml)"
fi
if T=$(ui_has "$OUT/lock.xml" '^[0-9]{1,2}:[0-9]{2}$'); then
  pass "un chronomètre (mm:ss) est visible sur l'écran verrouillé : $T"
else
  warn "chronomètre mm:ss non repéré sur l'écran verrouillé (voir 05-ecran-verrouille.png)"
fi

step "6. Écran éteint, verrouillé, Doze forcé : la notification de fin arrive à 00:00"
a input keyevent 223
sleep 2
a dumpsys battery unplug >/dev/null 2>&1
a dumpsys deviceidle enable deep >/dev/null 2>&1
a dumpsys deviceidle force-idle >"$OUT/doze.txt" 2>&1
say "   Doze profond : $(a dumpsys deviceidle get deep 2>&1 | tr -d '\r')"
END_MS=$((T_GO + 90000))
WAIT_S=$(((END_MS + 12000 - $(now_ms)) / 1000))
[ "$WAIT_S" -lt 1 ] && WAIT_S=1
say "   attente de ${WAIT_S} s (fin prévue à 90 s après GO)…"
sleep "$WAIT_S"
a dumpsys deviceidle unforce >/dev/null 2>&1
a dumpsys battery reset >/dev/null 2>&1
wake_screen
sleep 3
shot 06-ecran-verrouille-apres-fin
notifs after-end
assert_notif "$OUT/after-end.txt" 4243 "notification de fin de série (bandeau, son, vibration)" \
  "channel=set-end" "Binkām" "Série 1 sur 4 terminée. À toi de jouer !"
BLOCK=$(notif_block "$OUT/after-end.txt" 4243)
say "   importance : $(grep -o 'importance=[0-9]*' <<<"$BLOCK" | head -1) ; catégorie : $(grep -o 'category=[a-z_]*' <<<"$BLOCK" | head -1)"
grep -q "category=alarm" <<<"$BLOCK" && fail "la notification de fin a la catégorie « alarme » : refusé" || pass "la notification de fin n'est pas de catégorie « alarme » (notification ordinaire)"
IMP=$(grep -o 'importance=[0-9]*' <<<"$BLOCK" | head -1 | cut -d= -f2)
[ "${IMP:-0}" -ge 4 ] && pass "importance ≥ 4 : bandeau et son" || fail "importance trop basse pour un bandeau (${IMP:-?})"
if a dumpsys notification --noredact | grep -E "mSoundNotificationKey|mVibrateNotificationKey" | grep -q "$PKG|4243"; then
  pass "le système a joué le son / la vibration de la notification de fin"
else
  warn "son / vibration de la notification de fin non confirmés par dumpsys (mSoundNotificationKey)"
fi
assert_no_notif "$OUT/after-end.txt" 4242 "le compte à rebours a disparu à la fin de la série"
service_state >"$OUT/services-after-end.txt"
if grep -q "TimerService" "$OUT/services-after-end.txt"; then fail "TimerService tourne encore après la fin"; else pass "TimerService est arrêté après la fin"; fi
ui lock-end
ui_has "$OUT/lock-end.xml" "Série 1 sur 4 terminée" >/dev/null && pass "la notification de fin est lisible sur l'écran verrouillé" || warn "texte de fin non repéré sur l'écran verrouillé (voir 06-ecran-verrouille-apres-fin.png)"

step "7. Retour dans l'app"
unlock
shot 07-app-apres-fin
ui app-after-end
ui_texts "$OUT/app-after-end.xml" "$PKG" | tee -a "$OUT/summary.txt"
say "   fenêtre au premier plan : $(a dumpsys window 2>/dev/null | grep -m1 -E 'mCurrentFocus' | tr -d '\r')"
grep -q "Série 2 sur 4" "$OUT/app-after-end.xml" 2>/dev/null && pass "l'app affiche « Série 2 sur 4 » (la série terminée est comptée)" || warn "« Série 2 sur 4 » non repéré (voir 07-app-apres-fin.png)"
a cmd statusbar collapse >/dev/null 2>&1
a am start -n "$PKG/.MainActivity" >/dev/null 2>&1
sleep 2

step "8. Arrêt par appui sur le chrono"
tap_center # GO
sleep 4
notifs run2
assert_notif "$OUT/run2.txt" 4242 "nouveau GO : compte à rebours de nouveau là" "channel=set-live"
assert_no_notif "$OUT/run2.txt" 4243 "le nouveau GO retire la notification de fin précédente"
tap_center # terminer
sleep 3
notifs stopped
assert_no_notif "$OUT/stopped.txt" 4242 "arrêt : le compte à rebours disparaît"
assert_no_notif "$OUT/stopped.txt" 4243 "arrêt : pas de notification de fin"
a dumpsys alarm >"$OUT/alarm-after-stop.txt" 2>&1
grep -n "EndReceiver" "$OUT/alarm-after-stop.txt" | head -8 | sed 's/^/   alarm: /' | tee -a "$OUT/summary.txt"
[ "$(alarm_state)" -eq 0 ] && pass "arrêt : la minuterie de fin est annulée" || fail "arrêt : la minuterie EndReceiver est toujours programmée"
service_state | grep -q "TimerService" && fail "arrêt : TimerService tourne encore" || pass "arrêt : TimerService arrêté"

step "9. Fin de série avec l'app au premier plan (on avance l'horloge à 99 % en touchant le cercle)"
tap_center # GO (série 3)
sleep 3
find_center_button
SIZE=$((GO_W * 100 / 72))
TAP_X=$((GO_X - SIZE * 3 / 100))
TAP_Y=$((GO_Y - SIZE * 45 / 100))
say "   cercle ≈ ${SIZE}px, appui à ($TAP_X,$TAP_Y)"
shot 09a-avant-appui-cercle
a input tap "$TAP_X" "$TAP_Y"
sleep 3
shot 09-fin-au-premier-plan
ui after-ring
ui_texts "$OUT/after-ring.xml" "$PKG" | tee -a "$OUT/summary.txt"
say "   fenêtre au premier plan : $(a dumpsys window 2>/dev/null | grep -m1 -E 'mCurrentFocus' | tr -d '\r')"
notifs foreground-end
assert_notif "$OUT/foreground-end.txt" 4243 "fin au premier plan : la notification de fin s'affiche aussi" "channel=set-end" "Série 3 sur 4 terminée"
assert_no_notif "$OUT/foreground-end.txt" 4242 "fin au premier plan : le compte à rebours a disparu"

step "10. L'utilisateur balaie le compte à rebours : il est republié (information)"
tap_center # GO (série 4)
sleep 4
a cmd statusbar expand-notifications
sleep 2
if ui shade2 && out=$(bounds "$OUT/shade2.xml" text "Série 4 sur 4" com.android.systemui); then
  read -r RX RY RW _ <<<"$out"
  a input swipe $((RX + RW / 3)) "$RY" $((RX - RW)) "$RY" 200
  sleep 3
  notifs swiped
  if [ -n "$(notif_block "$OUT/swiped.txt" 4242)" ]; then pass "après un balayage, le compte à rebours est toujours (ou de nouveau) dans la barre"; else warn "après un balayage, le compte à rebours a disparu (voir swiped.txt)"; fi
else
  warn "ligne du compte à rebours introuvable dans le volet pour le balayage (voir shade2.xml)"
fi
a cmd statusbar collapse >/dev/null 2>&1
tap_center # terminer

step "11. Plantages"
a logcat -d >"$OUT/logcat.txt" 2>&1
a logcat -d -b crash >"$OUT/logcat-crash.txt" 2>&1
grep -iE "binkam|livetimer|TimerService|EndReceiver|ForegroundService" "$OUT/logcat.txt" >"$OUT/logcat-binkam.txt" 2>/dev/null
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt" && grep -A3 "FATAL EXCEPTION" "$OUT/logcat.txt" | grep -q "$PKG"; then
  fail "plantage de l'app (voir logcat.txt)"
  grep -A12 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -30 | tee -a "$OUT/summary.txt"
else
  pass "aucun plantage de l'app"
fi
if grep -qiE "ForegroundServiceDidNotStartInTime|ForegroundServiceStartNotAllowed|MissingForegroundServiceType|Bad notification" "$OUT/logcat.txt"; then
  fail "erreur de service / notification dans logcat"
  grep -iE "ForegroundServiceDidNotStartInTime|ForegroundServiceStartNotAllowed|MissingForegroundServiceType|Bad notification" "$OUT/logcat.txt" | head -10 | tee -a "$OUT/summary.txt"
else
  pass "aucune erreur de service au premier plan ni de notification invalide"
fi

say ""
say "Résultat : $FAILS échec(s), $WARNS avertissement(s)."
[ "$FAILS" = 0 ]
