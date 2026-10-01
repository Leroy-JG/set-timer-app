/** Texte de la notification de fin de série (téléphone, PWA et alarme native Android). */
export function setDoneBody(setNumber: number, sets: number): string {
  return setNumber >= sets ? 'Dernière série terminée. Bravo !' : `Série ${setNumber} sur ${sets} terminée. À toi de jouer !`;
}

/** Titre du compte à rebours affiché pendant la série. */
export function liveTitle(setNumber: number, sets: number): string {
  return `Série ${setNumber} sur ${sets}`;
}
