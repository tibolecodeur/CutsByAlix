# ADR 0001 — Choix de la stack technique

- **Date** : 2026-10-04
- **Statut** : accepté (hébergement remplacé par l'ADR 0007)

> **Correction du 2026-10-11** : l'hébergement retenu est **Cloudflare Pages**, et non Vercel
> (décision du 2026-10-10, consignée dans l'ADR 0007). Les mentions de Vercel ci-dessous sont
> conservées telles qu'écrites à l'époque.

## Contexte

Site de réservation pour un barber étudiant. Contraintes fortes :

- **Coût 0 €** hors nom de domaine : il faut des offres gratuites durables.
- **Mobile d'abord** : les clients réservent au pouce, le barber gère ses dispos depuis son téléphone.
- **Un seul développeur**, qui apprend React et vient de PHP/Symfony : l'écosystème doit être
  mainstream, bien documenté, et ne pas demander de maintenir un serveur.
- **Règle métier non négociable** : un créneau ne peut jamais être réservé deux fois. La garantie
  doit venir de la base de données, pas du navigateur.
- **RGPD** : données clients minimales (prénom, nom, téléphone, email), suppression possible.

## Décision

Application **single-page** en **Vite + React 19 + TypeScript strict**, stylée avec
**Tailwind CSS v4** et **shadcn/ui**, adossée à **Supabase** (PostgreSQL, Auth, Storage,
Edge Functions) et déployée sur **Vercel**. Validation par **Zod**, formulaires avec
**react-hook-form**, dates avec **date-fns**. Tests : **Vitest + Testing Library** (unitaires et
composants), **Playwright** (end-to-end), **pgTAP** (règles SQL et RLS).

Aucune librairie d'animation ou de 3D n'est installée à ce stade : ce choix est reporté à la
phase 7, après la définition de l'identité visuelle.

## Alternatives étudiées

- **Symfony + Twig + MySQL** (la zone de confort du développeur)
  - _Pour_ : maîtrise immédiate, Doctrine, un seul langage côté serveur.
  - _Contre_ : pas d'hébergement PHP + MySQL gratuit et fiable ; aucun apprentissage de React,
    qui est un objectif explicite du projet.
- **Next.js au lieu de Vite**
  - _Pour_ : rendu serveur (meilleur SEO local), routes API intégrées.
  - _Contre_ : beaucoup plus de concepts à absorber d'un coup (server components, rendu
    hybride) pour un site de 7 pages. Le SEO peut être traité en V2 par du prérendu.
- **Firebase au lieu de Supabase**
  - _Pour_ : offre gratuite généreuse, temps réel simple.
  - _Contre_ : Firestore est NoSQL — on perd la contrainte d'exclusion PostgreSQL qui garantit
    l'absence de double réservation. C'est rédhibitoire ici.
- **oxlint au lieu d'ESLint** (c'est le linter livré par défaut par le template Vite actuel)
  - _Pour_ : nettement plus rapide.
  - _Contre_ : écosystème de règles plus jeune, moins de documentation pour quelqu'un qui
    apprend. ESLint reste la référence et s'intègre à Prettier de façon connue.
- **Paiement en ligne (Stripe)**
  - _Pour_ : réduit les rendez-vous non honorés.
  - _Contre_ : hors sujet pour un barber étudiant qui encaisse en liquide, et ajoute des
    obligations réglementaires. Écarté par le cahier des charges.

## Conséquences

**Positif**

- L'anti-double-réservation est garanti par PostgreSQL (`btree_gist` + contrainte d'exclusion sur
  `tstzrange`), donc impossible à contourner depuis le front.
- Tout tient dans les offres gratuites : Vercel pour le site, Supabase pour la base.
- TypeScript strict + Zod donnent une sécurité de type comparable à celle d'un back Symfony typé.
- shadcn/ui copie son code dans `src/components/ui/` : pas de dépendance opaque, le code reste
  modifiable — important puisque l'identité visuelle sera définie plus tard.

**Négatif / à surveiller**

- Une SPA est mauvaise en SEO par défaut : la page d'accueil n'est qu'un `<div id="root">` vide
  pour un robot qui n'exécute pas JavaScript. À traiter en V2 (prérendu + données structurées).
- Toute la sécurité repose sur la RLS et les fonctions RPC `security definer` de Supabase : une
  policy oubliée expose des données clients. D'où les tests pgTAP obligatoires et l'agent
  `relecteur-securite` sur chaque migration.
- Dépendance à deux hébergeurs tiers dont les offres gratuites peuvent changer.
- Le bundle initial (~260 kB, ~82 kB gzip) est à surveiller : c'est un site consulté en 4G.
