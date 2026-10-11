# Sauvegardes (base et galerie)

Le plan gratuit de Supabase **ne fait aucune sauvegarde** consultable, et un projet resté en pause plus
de 90 jours ne peut plus être restauré depuis le tableau de bord. Le workflow anti-pause (`docs/DEPLOIEMENT.md` §7) n'est **pas** une
sauvegarde : il ne copie rien. Cette page décrit un export **manuel**.

> Une sauvegarde contient des **données personnelles** (prénom, nom, téléphone, e-mail des
> clients, photos) : elle est soumise au RGPD comme la base elle-même.

## Où stocker

- **Jamais dans le dépôt** (public), ni dans un dossier du projet : un `git add .` maladroit
  suffirait à publier les données des clients. Travailler dans un dossier **hors** du projet,
  par exemple `Documents\Sauvegardes-CutsByAlix\2026-10-11\`, **non synchronisé** : vérifier
  que `Documents` n'est pas sous `OneDrive\` (réglage fréquent de Windows 11), sinon les fichiers
  en clair partent dans le cloud avant d'être chiffrés. Au besoin, utiliser `C:\Sauvegardes\`.
- Archive **chiffrée** (7-Zip, format `.7z`, chiffrement AES-256, case « Chiffrer les noms de
  fichiers » cochée), mot de passe dans un gestionnaire de mots de passe.
- Deux endroits : le PC, plus un stockage personnel (clé USB, ou cloud perso) qui ne contient
  que l'archive chiffrée.
- Garder les **3 dernières** archives, supprimer les plus anciennes : rien ne doit survivre aux
  6 mois de conservation des données clients (SPEC, « Règles de gestion »).

## Fréquence proposée

- Toutes les **2 semaines**.
- Et **avant** chaque `npx supabase db push` (nouvelle migration en production).

## Procédure (environ 10 minutes)

Prérequis : Docker démarré (la CLI utilise `pg_dump` dans un conteneur), projet lié une fois
pour toutes (`npx supabase link --project-ref <ref>`), mot de passe de la base à portée de main
(Supabase → Project Settings → Database). Ces commandes **lisent** la base distante, elles
n'écrivent rien.

Depuis le dossier du projet (Git Bash), en écrivant les fichiers **hors** du projet (`D` = le
dossier du jour) :

```
D="$HOME/Documents/Sauvegardes-CutsByAlix/$(date +%F)" && mkdir -p "$D"
npx supabase db dump --linked -f "$D/schema.sql"
npx supabase db dump --linked --data-only -f "$D/donnees.sql"
npx supabase db dump --linked --role-only -f "$D/roles.sql"
```

- `schema.sql` : tables, fonctions, droits (déjà reconstructible depuis
  `supabase/migrations/`, gardé pour comparer).
- `donnees.sql` : le contenu (réservations, prestations, lieux avec adresses, galerie).
- `roles.sql` : rôles propres au projet. Peut contenir des **hachés de mots de passe** de rôles :
  utile seulement pour une reconstruction complète, facultatif ; toujours dans l'archive chiffrée.

**Galerie** (bucket privé `gallery`) : Supabase → Storage → `gallery` → tout sélectionner →
Download, puis déplacer les fichiers de `Téléchargements` vers le dossier du jour. Ou en ligne de commande (fonction encore marquée expérimentale, vérifier à la première
utilisation) :

```
npx supabase storage cp -r ss:///gallery "$D/galerie" --experimental --linked
```

Puis : compresser le dossier du jour en `.7z` chiffré, vérifier que l'archive s'ouvre avec le mot
de passe, **supprimer les fichiers en clair** définitivement (Maj+Suppr, ou vider la Corbeille
ensuite), y compris ceux restés dans `Téléchargements`.

## Restaurer (à tester une fois, en local)

Sur une base **locale** uniquement (`npx supabase start`), jamais directement sur la production :

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f donnees.sql
```

Vérifier que les réservations et la galerie réapparaissent, puis `npx supabase db reset` pour
repartir propre. Une restauration en production se décide au cas par cas, avec un plan écrit.

## Option d'automatisation (proposée, non faite)

Un workflow GitHub Actions mensuel (`schedule` + `workflow_dispatch`) qui :

1. lance `supabase db dump --data-only` avec l'URL de connexion de la base en **secret** du
   dépôt ;
2. chiffre le fichier avec `gpg --symmetric` (phrase de passe en second secret) ;
3. le garde comme artefact du run pendant 30 jours au plus.

- _Pour_ : plus d'oubli ; une copie existe même si le PC est perdu.
- _Contre_ : l'URL de connexion donne un accès **complet** à la base. La confier à GitHub élargit
  la surface d'attaque, et les artefacts d'un dépôt **public** sont téléchargeables par
  n'importe quel utilisateur GitHub connecté : tout reposerait sur la phrase de passe. La galerie
  n'est pas couverte.

Recommandation : rester en manuel tant que le volume est faible, et revoir la question au moment
d'une éventuelle offre payante (qui inclut des sauvegardes quotidiennes).
