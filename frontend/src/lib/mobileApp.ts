// Liens de téléchargement de l'application mobile, lus au moment de la requête (pas au build) :
// on les renseigne dans l'environnement du conteneur sans reconstruire le site.
//  - ANDROID_APP_URL : fichier APK (build EAS « preview »), par ex. « /telechargements/tsena-pro.apk » servi par
//    nginx sur le même serveur, ou page Google Play une fois publiée
//  - IOS_APP_URL     : page App Store une fois publiée (l'iPhone n'installe pas d'application hors App Store)
// Une adresse absente affiche « bientôt disponible ».

// Adresse https, ou chemin du même site (« /telechargements/… ») : valable quelle que soit l'adresse de la démo
const httpsUrl = (value: string | undefined) => {
  const url = value?.trim();
  // « //hote » serait une adresse vers un autre site : le chemin ne doit pas commencer par deux « / »
  return url && (/^https:\/\//i.test(url) || /^\/(?!\/)[A-Za-z0-9._\-/]+$/.test(url)) ? url : null;
};

export function getMobileAppLinks() {
  const android = httpsUrl(process.env.ANDROID_APP_URL);
  return {
    android,
    /** Lien direct vers un fichier .apk (installation manuelle) plutôt que vers Google Play */
    androidIsApk: !!android && /\.apk(\?|$)/i.test(android),
    ios: httpsUrl(process.env.IOS_APP_URL),
  };
}
