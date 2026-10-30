import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { ErrorMessage, LoadingMessage, SuccessMessage } from "@/components/StatusMessage";
import { AdminError } from "@/features/admin/data";
import {
  disablePush,
  disablePushEverywhere,
  enablePush,
  getPushStatus,
  PushError,
  sendTestPush,
  type PushStatus,
  type TestPushResult,
} from "@/features/admin/push";

const TEST_MESSAGES: Record<TestPushResult, string> = {
  queued: "Notification de test envoyée : elle arrive dans quelques secondes.",
  no_device: "Aucun appareil abonné : désactive puis réactive les notifications.",
  not_configured:
    "Le serveur de notifications n'est pas encore branché. Il reste une étape de mise en route (docs/DEPLOIEMENT.md).",
};

/**
 * Carte « Notifications » de « Mon compte » (ADR 0012) : activer, tester, désactiver les
 * notifications push sur CE téléphone. Chaque appareil s'active séparément.
 *
 * L'état vient du navigateur (`getPushStatus`), lu au montage dans un effet : comme un appel
 * fait au chargement d'une page Symfony, mais côté navigateur, après le premier affichage.
 */
export function AdminNotificationsCard() {
  // undefined : état pas encore lu (premier rendu).
  const [status, setStatus] = useState<PushStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    // `cancelled` : si la page est quittée avant la réponse, on n'écrit pas dans un composant
    // démonté (l'équivalent d'ignorer la réponse d'une requête annulée).
    let cancelled = false;
    getPushStatus()
      .then((value) => !cancelled && setStatus(value))
      .catch(() => !cancelled && setStatus("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Lance une action, gère occupé / erreur / succès de la même façon pour les trois boutons. */
  async function run(action: () => Promise<string | undefined>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      setSuccess(await action());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  // PAS de `run` ici avant `enablePush` : iOS n'affiche la demande d'autorisation que si elle
  // part directement du toucher. Le premier `await` du clic doit être requestPermission.
  async function handleEnable() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await enablePush();
      setStatus("on");
      setSuccess("Notifications activées sur ce téléphone.");
    } catch (caught) {
      if (caught instanceof PushError && caught.code === "denied") setStatus("denied");
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 id="notifications">Notifications</h2>
      <StatusText status={status} />

      {status === "off" && (
        <p>
          <Button onClick={handleEnable} disabled={busy} className="w-full sm:w-auto">
            Activer les notifications
          </Button>
        </p>
      )}

      {status === "on" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => run(async () => TEST_MESSAGES[await sendTestPush()])}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            Envoyer une notification de test
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () => {
                await disablePush();
                setStatus("off");
                return "Notifications désactivées sur ce téléphone.";
              })
            }
            disabled={busy}
            className="w-full sm:w-auto"
          >
            Désactiver
          </Button>
        </div>
      )}

      {status !== undefined && (
        // Téléphone perdu, doute : coupe aussi depuis un autre appareil (ordinateur compris).
        <p>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await disablePushEverywhere();
                if (status === "on") setStatus("off");
                return "Notifications coupées sur tous tes appareils.";
              })
            }
            disabled={busy}
            className="link min-h-tap text-left disabled:opacity-60"
          >
            Couper les notifications sur tous mes appareils
          </button>
        </p>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}
    </div>
  );
}

function errorMessage(caught: unknown): string {
  if (caught instanceof PushError && caught.code === "denied") {
    return "Notifications refusées. Pour les autoriser : Réglages → Notifications → Alix admin.";
  }
  if (caught instanceof AdminError && caught.code === "forbidden") {
    return "Ta session a expiré : déconnecte-toi, puis reconnecte-toi.";
  }
  return "Impossible pour le moment. Vérifie ta connexion, puis réessaie.";
}

function StatusText({ status }: { status: PushStatus | undefined }) {
  switch (status) {
    case undefined:
      return <LoadingMessage>Vérification des notifications…</LoadingMessage>;
    case "needs_install":
      return (
        <>
          <p>
            Pour recevoir une notification à chaque réservation et à chaque annulation, ajoute
            d'abord l'espace admin à ton écran d'accueil :
          </p>
          <ol className="list-decimal pl-6">
            <li>dans Safari, touche le bouton Partager (le carré avec une flèche) ;</li>
            <li>choisis « Sur l'écran d'accueil », puis « Ajouter » ;</li>
            <li>ouvre « Alix admin » depuis l'écran d'accueil et reviens sur cette page.</li>
          </ol>
          <p className="text-muted">
            Il faut iOS 16.4 ou plus récent (Réglages → Général → Informations).
          </p>
        </>
      );
    case "unsupported":
      return (
        <p>
          Ce navigateur ne permet pas les notifications. Sur iPhone : iOS 16.4 ou plus récent, en
          ouvrant l'espace admin depuis l'écran d'accueil.
        </p>
      );
    case "not_configured":
      return <p>Les notifications ne sont pas encore configurées sur le site.</p>;
    case "denied":
      return (
        <p>
          Les notifications sont bloquées sur ce téléphone. Pour les autoriser : Réglages →
          Notifications → Alix admin, puis reviens sur cette page.
        </p>
      );
    case "off":
      return (
        <p>
          Reçois une notification sur ce téléphone à chaque nouvelle réservation et à chaque
          annulation par un client.
        </p>
      );
    case "on":
      return (
        <p>
          <span className="font-semibold">Activées sur ce téléphone.</span> Elles s'arrêtent si tu
          te déconnectes de ce téléphone.
        </p>
      );
  }
}
