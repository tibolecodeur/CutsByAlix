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
3. **Secure password change** : activé. Limite à connaître : le serveur n'exige une nouvelle
   vérification que si la connexion date de plus de 24 h. L'écran « Mon compte » redemande
   l'ancien mot de passe, mais **ce contrôle est fait par le site, pas par le serveur** :
   quelqu'un qui volerait le jeton de session d'Alix (moins de 24 h) pourrait changer le mot de
   passe en appelant l'API directement. Seul le **MFA** (prévu) ferme ce risque.
4. **Secure email change** : activé (un changement d'e-mail doit être confirmé sur l'ancienne
   ET la nouvelle adresse : un jeton volé ne suffit pas à détourner le compte).
5. **Lien magique / code par e-mail** : non utilisés par le site. Ils ne se désactivent pas
   séparément du fournisseur Email (nécessaire au mot de passe) et restent appelables : ils ne
   donnent aucune session sans accès à la boîte mail d'Alix, mais peuvent servir à la spammer.
   D'où le point suivant.
6. **Authentication → Rate Limits** : limites basses sur les connexions et surtout sur les
   e-mails envoyés (quelques-uns par heure).
7. **Sessions** : « Refresh token rotation » activé (par défaut), expiration du JWT à **3600 s**
   (par défaut). Un jeton d'accès reste valable jusqu'à 1 h après une déconnexion ou une
   révocation (voir §5 et §6).
8. **Authentication → URL Configuration** : Site URL = le domaine du site en production ;
   retirer `localhost` des Redirect URLs.
9. **Settings → API (Data API)** : schémas exposés = `public` (et `graphql_public`) seulement.
   Le schéma `private` ne doit **jamais** être exposé. Si GraphQL ne sert pas : désactiver
   l'extension `pg_graphql` (Database → Extensions), une surface d'attaque de moins.
10. Plus tard : **MFA**, et CAPTCHA (Cloudflare Turnstile) sur la connexion. Le CAPTCHA limitera
    aussi la seule énumération restante : Supabase répond un peu plus vite pour un e-mail
    inconnu (pas de calcul de mot de passe), ce que le site ne peut pas masquer.

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

Conséquence : « Se déconnecter » dans Safari ne déconnecte PAS l'application de l'écran
d'accueil (et inversement). Pour tout couper d'un coup (téléphone perdu, doute) : changer le mot
de passe dans « Mon compte », qui déconnecte tous les autres appareils, ou suivre le §5.

## 5. Mot de passe oublié

Pas de réinitialisation par e-mail (le SMTP gratuit de Supabase est limité). C'est Thibault qui
fixe un mot de passe **temporaire**, puis Alix le change aussitôt dans « Mon compte ».

Dans le **SQL Editor** (UUID fictif). Le mot de passe temporaire est **tiré au hasard par la
base** et n'apparaît qu'une fois, dans le résultat : il n'est jamais écrit dans la requête, donc
ni dans l'historique du SQL Editor ni dans les journaux.

```sql
-- Mot de passe temporaire aléatoire de 16 caractères, chiffré comme le fait Supabase Auth
-- (bcrypt, coût 10). Le résultat l'affiche UNE fois : le noter pour le transmettre.
with p as (
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_') as pw
)
update auth.users u
   set encrypted_password = extensions.crypt(p.pw, extensions.gen_salt('bf', 10)),
       updated_at = now()
  from p
 where u.id = '00000000-0000-4000-8000-000000000000'
returning p.pw as mot_de_passe_temporaire;

-- Déconnecte tous ses appareils (un téléphone perdu ne reste pas connecté).
delete from auth.sessions where user_id = '00000000-0000-4000-8000-000000000000';
```

Ensuite : transmettre le mot de passe temporaire de vive voix, effacer l'écran de résultat, et
vérifier qu'Alix l'a changé. Délai à connaître : un jeton d'accès déjà délivré reste valable
**jusqu'à 1 h** après la suppression des sessions (il expire alors sans pouvoir être renouvelé).

## 6. Retirer un admin

```sql
delete from public.admins where user_id = '00000000-0000-4000-8000-000000000000';
delete from auth.sessions where user_id = '00000000-0000-4000-8000-000000000000';
```

Le compte peut aussi être supprimé dans Authentication → Users (sa ligne `admins` disparaît avec
lui, `on delete cascade`).

Effet immédiat : sans ligne dans `admins`, la RLS ne lui montre plus rien, même avec un jeton
encore valable (les policies vérifient `admins` à chaque requête).

## 7. En développement (base locale uniquement)

1. `npx supabase start` (si `config.toml` a changé : `npx supabase stop` puis `start`).
2. `npm run db:reset:dev` **avant** de créer le compte (`seed-dev.sql` refuse une base qui a déjà
   des comptes).
3. Studio local (`http://127.0.0.1:54323`) → Authentication → Add user (e-mail et mot de passe
   fictifs, « Auto Confirm User »), puis l'`insert into public.admins` ci-dessus dans le SQL Editor
   local.
4. `.env.local` pointé sur la base locale, puis `npm run dev` et `/admin`.
