// EXPO_BASE_URL sert au déploiement sur GitHub Pages (ex. "/set-timer-app").
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments ?? {}), ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
