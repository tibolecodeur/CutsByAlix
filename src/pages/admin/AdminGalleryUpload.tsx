import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/Button";
import { Choice } from "@/components/Choice";
import { Field } from "@/components/Field";
import { ErrorMessage, LoadingMessage, SuccessMessage } from "@/components/StatusMessage";
import { addGalleryItem, MAX_ALT_TEXT_LENGTH } from "@/features/admin/gallery";
import { IMAGE_RULES, processImage, type ProcessedImage } from "@/features/gallery/processImage";
import { galleryErrorMessage } from "@/pages/admin/galleryMessages";

const ACCEPT = IMAGE_RULES.acceptedTypes.join(",");

type Phase = "empty" | "processing" | "ready" | "sending";

/**
 * Ajout d'une photo : choix (appareil photo ou galerie du téléphone), préparation dans le
 * navigateur (`processImage` : 1200 px, WebP/JPEG, sans EXIF), texte alternatif obligatoire,
 * accord de la personne photographiée obligatoire pour publier.
 */
export function AdminGalleryUpload({ onAdded }: { onAdded: () => void }) {
  const [phase, setPhase] = useState<Phase>("empty");
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [consent, setConsent] = useState(false);
  const [altError, setAltError] = useState<string>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const altInput = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  // Garde contre le double appui (le bouton n'est désactivé qu'au rendu suivant).
  const sending = useRef(false);
  const consentHintId = useId();

  // L'aperçu est une URL « blob: » qui garde l'image en mémoire : on la libère quand elle
  // change ou quand l'écran se ferme. La fonction renvoyée par un effet est son « nettoyage »,
  // un peu comme un destructeur : React l'appelle avant le prochain effet et au démontage.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Après un ajout, le formulaire se vide : le focus va au message de confirmation.
  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  function reset() {
    setPhase("empty");
    setImage(null);
    setPreviewUrl(null);
    setAltText("");
    setConsent(false);
    setAltError(undefined);
    setError(undefined);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Vider le champ permet de rechoisir le même fichier après une erreur.
    input.value = "";
    if (!file) return;

    reset();
    setSuccess(undefined);
    setPhase("processing");
    try {
      const processed = await processImage(file);
      setImage(processed);
      setPreviewUrl(URL.createObjectURL(processed.blob));
      setPhase("ready");
    } catch (caught) {
      setPhase("empty");
      setError(galleryErrorMessage(caught));
    }
  }

  async function save(publish: boolean) {
    if (!image || sending.current) return;
    setError(undefined);
    if (altText.trim() === "") {
      setAltError("Décris la photo en quelques mots : c'est obligatoire.");
      altInput.current?.focus();
      return;
    }
    sending.current = true;
    setPhase("sending");
    try {
      await addGalleryItem({ image, altText, consent: publish && consent });
      reset();
      setSuccess(
        publish ? "Photo publiée dans la galerie." : "Photo enregistrée, masquée du site.",
      );
      onAdded();
    } catch (caught) {
      setPhase("ready");
      setError(galleryErrorMessage(caught));
    } finally {
      sending.current = false;
    }
  }

  const busy = phase === "processing" || phase === "sending";

  return (
    <div className="flex flex-col gap-5">
      <h2 id="add-photo">Ajouter une photo</h2>

      {/* Champs fichier invisibles, ouverts par les deux boutons. `capture` ouvre directement
          l'appareil photo arrière ; sans lui, le téléphone propose sa galerie. */}
      <input
        ref={cameraInput}
        id="photo-camera"
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFile}
      />
      <input
        ref={libraryInput}
        id="photo-library"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFile}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => cameraInput.current?.click()} disabled={busy}>
          Prendre une photo
        </Button>
        <Button variant="secondary" onClick={() => libraryInput.current?.click()} disabled={busy}>
          Choisir dans la galerie
        </Button>
      </div>
      <p className="text-sm text-muted">
        La photo est réduite et nettoyée sur ton téléphone avant l'envoi : la position GPS, la date
        et le modèle du téléphone ne partent jamais.
      </p>

      {phase === "processing" && <LoadingMessage>Préparation de la photo…</LoadingMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && (
        <div ref={successRef} tabIndex={-1}>
          <SuccessMessage>{success}</SuccessMessage>
        </div>
      )}

      {image && previewUrl && (phase === "ready" || phase === "sending") && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
          noValidate
          aria-label="Détails de la photo"
          className="flex flex-col gap-5"
        >
          <img
            src={previewUrl}
            alt="Aperçu de la photo choisie"
            width={image.width}
            height={image.height}
            className="h-auto max-h-80 w-auto max-w-full self-start border border-ink/15"
          />
          <Field
            ref={altInput}
            id="photo-alt"
            name="alt"
            type="text"
            label="Texte alternatif (obligatoire)"
            hint="Décris la coupe pour les personnes malvoyantes. Ex. : dégradé court, côtés rasés."
            maxLength={MAX_ALT_TEXT_LENGTH}
            autoComplete="off"
            value={altText}
            error={altError}
            onChange={(e) => {
              setAltText(e.target.value);
              setAltError(undefined);
            }}
          />
          <div className="flex flex-col gap-2">
            <Choice
              type="checkbox"
              id="photo-consent"
              name="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            >
              La personne photographiée est d'accord pour la publication.
            </Choice>
            {!consent && (
              <p id={consentHintId} className="text-sm text-muted">
                Coche la case pour pouvoir publier. Sans accord, tu peux enregistrer la photo
                masquée.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              disabled={!consent || busy}
              aria-describedby={consent ? undefined : consentHintId}
              aria-busy={(phase === "sending" && consent) || undefined}
            >
              {phase === "sending" ? "Envoi en cours…" : "Publier"}
            </Button>
            <Button variant="secondary" onClick={() => void save(false)} disabled={busy}>
              Enregistrer sans publier
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
