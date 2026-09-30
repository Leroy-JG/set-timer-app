// Hors ligne : le service worker garde l'application en cache après la première visite.
// (Fichier séparé : la politique de sécurité de la page interdit les scripts en ligne.)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
