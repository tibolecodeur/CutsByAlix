/**
 * Balises du `<head>` propres à l'espace admin, rendues par la connexion et par le gabarit admin
 * SEULEMENT (jamais par le site public). React 19 les « hisse » dans le `<head>` et les retire
 * quand on quitte l'admin.
 * - `noindex` : l'admin n'apparaît dans aucun moteur de recherche (doublé par `X-Robots-Tag`
 *   dans `public/_headers`) ;
 * - manifeste PWA : « Ajouter à l'écran d'accueil » ouvre l'admin comme une application ;
 * - icône iOS : Safari prend l'`apple-touch-icon` pour l'écran d'accueil.
 */
export function AdminHead() {
  return (
    <>
      <meta name="robots" content="noindex" />
      <link rel="manifest" href="/admin.webmanifest" />
      <link rel="apple-touch-icon" href="/admin-icon-180.png" />
    </>
  );
}
