#!/usr/bin/env python3
"""Fait signer l'APK « release » avec la clé personnelle (au lieu de la clé de debug publique du modèle Expo).

Les secrets arrivent par variables d'environnement (jamais en argument de commande) :
ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
"""
import pathlib
import sys

path = pathlib.Path('android/app/build.gradle')
text = path.read_text()

release_config = """    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
"""
marker_config = "    signingConfigs {\n"
marker_release = "            signingConfig signingConfigs.debug\n            def enableShrinkResources"

if marker_config not in text or marker_release not in text:
    sys.exit('build.gradle : structure inattendue, signature non appliquée (le modèle Expo a changé ?)')

text = text.replace(marker_config, release_config, 1)
text = text.replace(marker_release, marker_release.replace('signingConfigs.debug', 'signingConfigs.release'), 1)
path.write_text(text)
print('APK release : signature avec la clé personnelle.')
