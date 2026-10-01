/**
 * Saisies en cours dans les champs (durée, nombre de séries). Quand on appuie sur « GO » alors qu'un champ a encore le focus, la valeur
 * tapée doit être enregistrée AVANT de lancer le chrono : les champs se déclarent ici tant qu'ils ont une saisie non validée.
 */
const pending = new Map<string, () => void>();

/** Un champ déclare (ou retire, avec `null`) sa validation immédiate. */
export function setPendingEdit(key: string, commit: (() => void) | null) {
  if (commit) pending.set(key, commit);
  else pending.delete(key);
}

/** Valide toutes les saisies en cours. Renvoie true s'il y en avait. */
export function commitPendingEdits(): boolean {
  const commits = [...pending.values()];
  pending.clear();
  commits.forEach((commit) => commit());
  return commits.length > 0;
}
