# ADR 0015 — Lien d'annulation perdu : recours par Instagram

- **Date** : 2026-11-25
- **Statut** : accepté

## Contexte

Sans e-mail en V1 (pas de nom de domaine vérifié), le lien d'annulation `/annuler#<jeton>`
n'existe que sur l'écran de confirmation (bouton « Copier le lien », gardé le temps de
l'onglet). Un client qui ferme l'onglet sans le sauvegarder ne peut plus annuler en ligne. Le
PLAN demandait de trancher avant la mise en ligne.

## Décision

On accepte ce manque en V1. Le client qui a perdu son lien écrit à Alix sur Instagram, qui
annule le RDV depuis l'admin (déjà possible, consigne 19). L'écran de confirmation et l'état
« Lien invalide » de `/annuler` le disent, avec le lien vers le compte Instagram.

## Alternatives étudiées

- **Fichier .ics avec le lien** (« Ajouter à mon calendrier », SPEC V1) : le lien resterait
  dans l'agenda du client. Plus de travail ; reste au backlog.
- **E-mail de confirmation** : la vraie solution, mais demande un nom de domaine (V2).
- **Retrouver son RDV par téléphone** : impossible sans vérifier le numéro (un tiers pourrait
  annuler le RDV de quelqu'un d'autre).

## Conséquences

- Quelques messages de plus pour Alix. À réévaluer avec les e-mails (V2) ou le .ics.
- Aucune donnée ni règle de sécurité ne change.
