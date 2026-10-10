# Compte admin : création, vérification, mot de passe oublié

> Toutes les valeurs ci-dessous sont **fictives** (`alix@example.com`,
> `00000000-0000-4000-8000-000000000000`). Ne jamais écrire le vrai e-mail, le vrai UUID ni un
> mot de passe dans le dépôt, un ticket ou un message.
>
> Jamais de clé `service_role` : tout se fait dans le tableau de bord Supabase (connecté avec
> ton compte Supabase), dans la partie Authentication et le SQL Editor.

## 1. Réglages du projet (une seule fois)

Dans le tableau de bord du projet **distant** :

1. **Authentication → Sign In / Providers**
   - « Allow new users to sign up » : **désactivé** (aucune inscription publique).
   - « Allow anonymous sign-ins » : **désactivé**.
   - Email : activé (connexion par mot de passe). « Confirm email » n'a pas d'effet ici : le
     compte est confirmé à sa création.
   - Phone et tous les fournisseurs externes (Google, Apple…) : **désactivés**.
2. **Authentication → Policies → Passwords** (selon l'emplacement du réglage dans le tableau de
   bord) : longueur minimale **12**, caractères requis **aucun** (« No required characters »).
   « Prevent use of leaked passwords » : à activer si l'offre le permet.
3. **Secure password change** : activé (l'écran « Mon compte » redemande l'ancien mot de passe
   juste avant, ce qui satisfait ce réglage).
4. **Authentication → URL Configuration** : Site URL = le domaine du site en production ;
   retirer `localhost` des Redirect URLs.
5. **Authentication → Rate Limits** : garder des limites basses sur les connexions et les e-mails.
6. **Settings → API (Data API)** : schémas exposés = `public` (et `graphql_public`) seulement.
   Le schéma `private` ne doit **jamais** être exposé.
7. Plus tard : MFA, et CAPTCHA (Cloudflare Turnstile) sur la connexion.

## 2. Créer le compte d'Alix

1. **Authentication → Users → Add user → Create new user**
   - Email : `alix@example.com` (le vrai e-mail d'Alix, saisi seulement ici).
   - Password : généré par un gestionnaire de mots de passe, **12 caractères minimum**.
   - **Auto Confirm User** : coché.
2. Ouvrir l'utilisateur créé et **copier son UUID** (User UID), par exemple
   `00000000-0000-4000-8000-000000000000`.
3. **SQL Editor** : le déclarer admin (l'API ne permet à personne d'écrire dans `admins`) :

   ```sql
   insert into public.admins (user_id)
   values ('00000000-0000-4000-8000-000000000000');
   ```

4. Transmettre le mot de passe à Alix **de vive voix** ou par son gestionnaire de mots de passe,
   jamais par message écrit. Elle le change ensuite dans « Mon compte ».

## 3. Vérifier que ça marche

Dans le **SQL Editor** :

```sql
-- 1 ligne attendue : l'e-mail d'Alix, confirmé.
select u.email, u.email_confirmed_at is not null as confirme, a.created_at as admin_depuis
  from public.admins a
  join auth.users u on u.id = a.user_id;

-- 1 attendu : un seul compte existe (aucune inscription publique possible).
select count(*) from auth.users;
```

Puis sur le site :

1. Ouvrir `/admin` : redirection vers `/admin/connexion`.
2. Se connecter avec un **mauvais** mot de passe : « E-mail ou mot de passe incorrect. ».
3. Se connecter avec le bon : arrivée sur le tableau de bord.
4. Fermer le navigateur, le rouvrir sur `/admin` : toujours connectée.
5. « Mon compte » → « Se déconnecter » : retour à la connexion.

## 4. iPhone : application sur l'écran d'accueil

Safari → bouton Partager → « Sur l'écran d'accueil » depuis `/admin`. L'application ajoutée a un
**stockage séparé** de Safari : il faut s'y **connecter une fois** (la session de Safari n'y est
pas reprise). Ensuite, la session y reste.

## 5. Mot de passe oublié

Pas de réinitialisation par e-mail (le SMTP gratuit de Supabase est limité). C'est Thibault qui
fixe un mot de passe **temporaire**, puis Alix le change aussitôt dans « Mon compte ».

Dans le **SQL Editor** (UUID et mot de passe fictifs) :

```sql
-- Mot de passe temporaire (12 caractères minimum), chiffré par la base.
update auth.users
   set encrypted_password = extensions.crypt('TEMPORAIRE-A-CHANGER', extensions.gen_salt('bf')),
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000000';

-- Déconnecte tous ses appareils (un téléphone perdu ne reste pas connecté).
delete from auth.sessions where user_id = '00000000-0000-4000-8000-000000000000';
```

Ensuite : **supprimer cette requête de l'historique du SQL Editor** (elle contient le mot de passe
temporaire en clair), transmettre le mot de passe temporaire de vive voix, et vérifier qu'Alix
l'a changé.

## 6. Retirer un admin

```sql
delete from public.admins where user_id = '00000000-0000-4000-8000-000000000000';
delete from auth.sessions where user_id = '00000000-0000-4000-8000-000000000000';
```

Le compte peut aussi être supprimé dans Authentication → Users (sa ligne `admins` disparaît avec
lui, `on delete cascade`).

## 7. En développement (base locale uniquement)

1. `npx supabase start` (si `config.toml` a changé : `npx supabase stop` puis `start`).
2. `npm run db:reset:dev` **avant** de créer le compte (`seed-dev.sql` refuse une base qui a déjà
   des comptes).
3. Studio local (`http://127.0.0.1:54323`) → Authentication → Add user (e-mail et mot de passe
   fictifs, « Auto Confirm User »), puis l'`insert into public.admins` ci-dessus dans le SQL Editor
   local.
4. `.env.local` pointé sur la base locale, puis `npm run dev` et `/admin`.
