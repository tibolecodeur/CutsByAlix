---
name: check-deploiement
description: Checklist complète avant une mise en ligne (build, tests, sécurité, RGPD, SEO, performances, variables d'environnement). À lancer avant chaque déploiement en production.
disable-model-invocation: true
---

## État du dépôt
!`git status --short`
!`git log --oneline -3`

Vérifie chaque point, coche-le dans un rapport, et corrige ce qui peut l'être sans risque
(demande-moi avant toute action sur la base de données ou le déploiement).

### Code
- [ ] `npm run build`, `npm run lint`, `npm run test`, `npx playwright test` au vert
- [ ] Aucun `console.log` de debug, aucun TODO bloquant, aucune donnée de test en dur

### Sécurité
- [ ] Agent `relecteur-securite` : verdict OK, aucun 🔴
- [ ] Aucune clé `service_role` ni secret dans `src/`, `dist/` ou l'historique git récent
- [ ] Inscriptions publiques désactivées dans Supabase Auth ; compte admin du barber créé ; mot de passe fort

### RGPD
- [ ] Mentions légales + politique de confidentialité accessibles depuis le footer
- [ ] Case de consentement sur le formulaire ; durée de conservation indiquée
- [ ] Données de test clients supprimées de la base de production

### Qualité
- [ ] Agent `testeur-ui` : parcours réservation + annulation + admin OK en mobile
- [ ] Lighthouse mobile ≥ 90 (performances, accessibilité, bonnes pratiques, SEO)
- [ ] Titre, meta description, Open Graph, favicon ; page 404

### Déploiement
- [ ] Variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` configurées sur Cloudflare Pages
      (environnement Production), et `NODE_VERSION=22` (docs/DEPLOIEMENT.md)
- [ ] Routage SPA OK (recharger `/admin` ou `/annuler#<jeton>` ne donne pas de 404) : aucun
      `404.html` ni `_redirects` dans `dist/`
- [ ] En-têtes réels vérifiés (`curl -sI` sur `/`, `/annuler`, `/admin`) : aucun en double, CSP
      passée de Report-Only à blocage si validée, noindex global retiré au lancement public
- [ ] Workflow « Anti-pause Supabase » actif et vert ; sauvegarde récente (docs/SAUVEGARDES.md)
- [ ] Domaine et HTTPS OK

Termine par : prêt / pas prêt, et la liste de ce qu'il me reste à faire à la main.
