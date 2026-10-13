import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Choice } from "@/components/Choice";
import { Field } from "@/components/Field";
import { ErrorMessage } from "@/components/StatusMessage";
import {
  deleteGalleryItem,
  hideGalleryItem,
  MAX_ALT_TEXT_LENGTH,
  moveGalleryItem,
  setGalleryItemPublished,
  updateGalleryItemAltText,
  type AdminGalleryItem,
} from "@/features/admin/gallery";
import { galleryErrorMessage } from "@/pages/admin/galleryMessages";

export type GalleryCardChange =
  | { type: "moved"; direction: "up" | "down" }
  | { type: "published"; published: true }
  | { type: "hidden"; imagePath: string; imageUrl: string | null; linksRevoked: boolean }
  | { type: "alt"; altText: string }
  | { type: "deleted" };

type Mode = "idle" | "publishing" | "editing" | "deleting";

type Props = {
  item: AdminGalleryItem;
  position: number;
  total: number;
  /** Bouton de déplacement à re-focaliser après un « monter / descendre ». */
  focusMove?: "up" | "down";
  onChange: (change: GalleryCardChange) => void;
};

/** Une photo de la galerie admin, avec toutes ses actions. */
export function AdminGalleryCard({ item, position, total, focusMove, onChange }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string>();
  const [altDraft, setAltDraft] = useState(item.altText);
  const upButton = useRef<HTMLButtonElement>(null);
  const downButton = useRef<HTMLButtonElement>(null);
  // Boutons qui ouvrent un panneau, et premier élément de chaque panneau (gestion du focus).
  const publishToggle = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  const altInput = useRef<HTMLInputElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const openedFrom = useRef<Mode | null>(null);
  // Focus à rendre dès que la carte n'est plus occupée : pendant une requête, les boutons
  // sont désactivés, et un bouton désactivé ne peut pas recevoir le focus (le navigateur
  // le retire même à celui qui l'avait).
  const pendingFocus = useRef<(() => HTMLElement | null) | null>(null);
  // Garde contre le double appui (le bouton n'est désactivé qu'au rendu suivant).
  const sending = useRef(false);
  // Libellé court : répéter le texte alternatif sur 5 boutons serait très long à l'écoute.
  const label = `photo ${position}`;
  const isFirst = position === 1;
  const isLast = position === total;

  // Après un déplacement, React a pu retirer la carte du DOM pour la réinsérer ailleurs, ce
  // qui fait perdre le focus : on le remet sur le même bouton (ou l'autre, s'il est désactivé
  // parce que la photo est arrivée au bout).
  useEffect(() => {
    if (!focusMove) return;
    const wanted = focusMove === "up" ? upButton.current : downButton.current;
    const other = focusMove === "up" ? downButton.current : upButton.current;
    (wanted && !wanted.disabled ? wanted : other)?.focus();
  }, [focusMove, position]);

  // Changement de panneau : le bouton touché disparaît, le focus tomberait sur la page. On
  // le place sur le premier élément du panneau ouvert (« Garder la photo », l'option sûre,
  // pour la suppression), puis, au retour, sur le bouton qui l'avait ouvert.
  useEffect(() => {
    if (openedFrom.current === null) return;
    if (mode === "publishing") consentInput.current?.focus();
    else if (mode === "editing") altInput.current?.focus();
    else if (mode === "deleting") keepButton.current?.focus();
    else {
      const trigger = {
        publishing: publishToggle,
        editing: editButton,
        deleting: deleteButton,
        idle: null,
      }[openedFrom.current];
      pendingFocus.current = () => trigger?.current ?? null;
      openedFrom.current = null;
    }
  }, [mode]);

  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const target = pendingFocus.current();
    pendingFocus.current = null;
    target?.focus();
  }, [busy, mode, item.published]);

  function open(next: Exclude<Mode, "idle">) {
    openedFrom.current = next;
    setError(undefined);
    setMode(next);
  }

  function close() {
    setConsent(false);
    setConsentError(undefined);
    setMode("idle");
  }

  async function run(action: () => Promise<void>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(galleryErrorMessage(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const move = (direction: "up" | "down") =>
    run(async () => {
      if (await moveGalleryItem(item.id, direction)) onChange({ type: "moved", direction });
    });

  const publish = () => {
    if (!consent) {
      setConsentError("Coche l'accord de la personne photographiée pour publier.");
      consentInput.current?.focus();
      return;
    }
    return run(async () => {
      await setGalleryItemPublished(item.id, true, true);
      close();
      onChange({ type: "published", published: true });
    });
  };

  const hide = () =>
    run(async () => {
      const result = await hideGalleryItem(item);
      // Même emplacement, devenu « Publier ».
      pendingFocus.current = () => publishToggle.current;
      onChange({ type: "hidden", ...result });
    });

  const saveAlt = () =>
    run(async () => {
      await updateGalleryItemAltText(item.id, altDraft);
      close();
      onChange({ type: "alt", altText: altDraft.trim() });
    });

  const remove = () =>
    run(async () => {
      await deleteGalleryItem(item.id);
      onChange({ type: "deleted" });
    });

  return (
    <Card as="li" className="gap-3">
      <div className="flex gap-4">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.altText}
            width={item.width}
            height={item.height}
            loading="lazy"
            decoding="async"
            className="size-28 shrink-0 border border-ink/15 object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={`${item.altText} (aperçu indisponible)`}
            className="flex size-28 shrink-0 items-center justify-center border border-ink/40 p-2 text-center text-sm"
          >
            <span aria-hidden="true">Aperçu indisponible</span>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted">
            Position {position} sur {total}
          </p>
          <p>
            <span
              className={
                item.published
                  ? "border-2 border-ink bg-blush px-2 text-sm font-semibold"
                  : "border border-ink px-2 text-sm font-semibold"
              }
            >
              {item.published ? "Publiée" : "Masquée"}
            </span>
          </p>
          {/* line-clamp : un long texte ne repousse pas les boutons hors de l'écran. */}
          <p className="line-clamp-3 break-words">{item.altText}</p>
        </div>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {mode === "idle" && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            ref={upButton}
            variant="secondary"
            className="px-3"
            disabled={isFirst || busy}
            aria-label={`Monter la ${label}`}
            onClick={() => void move("up")}
          >
            Monter
          </Button>
          <Button
            ref={downButton}
            variant="secondary"
            className="px-3"
            disabled={isLast || busy}
            aria-label={`Descendre la ${label}`}
            onClick={() => void move("down")}
          >
            Descendre
          </Button>
          {item.published ? (
            <Button
              ref={publishToggle}
              variant="secondary"
              className="px-3"
              disabled={busy}
              aria-label={`Masquer la ${label}`}
              onClick={() => void hide()}
            >
              Masquer
            </Button>
          ) : (
            <Button
              ref={publishToggle}
              className="px-3"
              disabled={busy}
              aria-label={`Publier la ${label}`}
              onClick={() => open("publishing")}
            >
              Publier
            </Button>
          )}
          <Button
            ref={editButton}
            variant="secondary"
            className="px-3"
            disabled={busy}
            aria-label={`Modifier le texte de la ${label}`}
            onClick={() => {
              setAltDraft(item.altText);
              open("editing");
            }}
          >
            Modifier
          </Button>
          <Button
            ref={deleteButton}
            variant="secondary"
            className="col-span-2 px-3"
            disabled={busy}
            aria-label={`Supprimer la ${label}`}
            onClick={() => open("deleting")}
          >
            Supprimer
          </Button>
        </div>
      )}

      {mode === "publishing" && (
        <div className="flex flex-col gap-3">
          <Choice
            ref={consentInput}
            type="checkbox"
            id={`consent-${item.id}`}
            checked={consent}
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? `consent-error-${item.id}` : undefined}
            onChange={(e) => {
              setConsent(e.target.checked);
              setConsentError(undefined);
            }}
          >
            La personne photographiée est d'accord pour la publication.
          </Choice>
          {consentError && (
            <p id={`consent-error-${item.id}`} className="field-error text-sm">
              {consentError}
            </p>
          )}
          <Button onClick={() => void publish()} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Publication…" : "Publier"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={close}>
            Annuler
          </Button>
        </div>
      )}

      {mode === "editing" && (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void saveAlt();
          }}
        >
          <Field
            ref={altInput}
            id={`alt-${item.id}`}
            type="text"
            label="Texte alternatif"
            maxLength={MAX_ALT_TEXT_LENGTH}
            autoComplete="off"
            value={altDraft}
            onChange={(e) => setAltDraft(e.target.value)}
          />
          <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={close}>
            Annuler
          </Button>
        </form>
      )}

      {mode === "deleting" && (
        // Action définitive : l'option sûre est le bouton principal, en premier, et un écart
        // plus grand sépare « Oui, supprimer » pour éviter la mauvaise touche.
        <div className="flex flex-col gap-4">
          <p className="font-semibold">
            Supprimer cette photo ? Elle disparaît du site et de l'espace admin, définitivement.
          </p>
          <Button ref={keepButton} disabled={busy} onClick={close}>
            Garder la photo
          </Button>
          <Button
            variant="secondary"
            onClick={() => void remove()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? "Suppression…" : "Oui, supprimer"}
          </Button>
        </div>
      )}
    </Card>
  );
}
