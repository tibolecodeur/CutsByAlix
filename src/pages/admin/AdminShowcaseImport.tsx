import { useId, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Choice } from "@/components/Choice";
import { ErrorMessage } from "@/components/StatusMessage";
import { getAdminGallery } from "@/features/admin/gallery";
import {
  importShowcasePhotos,
  resumeFrom,
  ShowcaseImportError,
} from "@/features/admin/showcaseImport";
import { FEATURED_PHOTOS } from "@/features/gallery/featuredPhotos";
import { GroupError } from "@/pages/booking/StepFrame";

type Props = {
  /** Import terminé : la page recharge la liste (les photos y apparaissent, publiées). */
  onImported: () => void;
};

/**
 * Proposé quand la galerie gérée est VIDE : importe les photos de la vitrine
 * (public/media/galerie/) par le même chemin qu'un ajout depuis le téléphone
 * (showcaseImport.ts). Ensuite, Alix les gère comme les autres : masquer, supprimer, ordre.
 * Le bloc disparaît dès qu'une photo existe : supprimer une photo importée ne la fait donc
 * jamais reproposer.
 */
export function AdminShowcaseImport({ onImported }: Props) {
  const total = FEATURED_PHOTOS.length;
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string>();
  const [running, setRunning] = useState(false);
  // Photos déjà importées : sert à la progression ET à la reprise sans doublon.
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(false);
  const consentInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const consentErrorId = useId();

  async function start() {
    if (running) return;
    if (!consent) {
      setConsentError("Coche l'accord des personnes photographiées pour importer.");
      consentInput.current?.focus();
      return;
    }
    setRunning(true);
    setFailed(false);
    try {
      let from = done;
      if (failed) {
        // Reprise : une photo a pu être créée sans que la réponse revienne (coupure). On
        // relit la galerie pour ne pas l'envoyer deux fois (resumeFrom).
        const existing = await getAdminGallery();
        from = resumeFrom(
          FEATURED_PHOTOS,
          existing.map((item) => item.altText),
          done,
        );
        setDone(from);
      }
      await importShowcasePhotos(FEATURED_PHOTOS, {
        consent: true,
        from,
        onProgress: setDone,
      });
      onImported();
    } catch (caught) {
      if (caught instanceof ShowcaseImportError) setDone(caught.done);
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-panel border border-ink/15 bg-blush/30 p-5"
    >
      <h3 id={titleId} className="text-xl">
        Photos de la vitrine
      </h3>
      <p>
        Le site n'affiche aucune photo pour l'instant. Importe les {total} photos de la vitrine :
        elles seront aussitôt visibles sur le site, et tu pourras ensuite les masquer, les supprimer
        ou changer leur ordre.
      </p>
      {/* Aperçu en noir et blanc, comme sur le site. */}
      <ul role="list" className="grid list-none grid-cols-7 gap-1.5 sm:gap-2">
        {FEATURED_PHOTOS.map((photo) => (
          <li key={photo.id}>
            <img
              src={photo.url}
              alt={photo.altText}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] h-auto w-full rounded-field object-cover grayscale"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <Choice
          ref={consentInput}
          type="checkbox"
          checked={consent}
          disabled={running}
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? consentErrorId : undefined}
          onChange={(event) => {
            setConsent(event.target.checked);
            setConsentError(undefined);
          }}
        >
          Les personnes photographiées sont d'accord pour que ces photos soient publiées.
        </Choice>
        <GroupError id={consentErrorId} message={consentError} />
      </div>

      {failed && (
        <ErrorMessage>
          L'import s'est arrêté ({done} photo{done > 1 ? "s" : ""} sur {total} importée
          {done > 1 ? "s" : ""}). Vérifie ta connexion, puis reprends : les photos déjà importées ne
          seront pas envoyées deux fois.
        </ErrorMessage>
      )}

      {running && (
        // Barre native : annoncée par les lecteurs d'écran, sans animation à gérer.
        <progress
          value={done}
          max={total}
          aria-label="Progression de l'import"
          className="h-2 w-full overflow-hidden rounded-pill accent-orange"
        />
      )}
      <p role="status" className="sr-only">
        {running ? `Import en cours : ${done} sur ${total}.` : ""}
      </p>
      <p>
        <Button
          className="w-full sm:w-auto"
          disabled={running}
          aria-busy={running || undefined}
          onClick={() => void start()}
        >
          {running
            ? `Import ${done} / ${total}…`
            : failed
              ? "Reprendre l'import"
              : `Importer les ${total} photos`}
        </Button>
      </p>
    </section>
  );
}
