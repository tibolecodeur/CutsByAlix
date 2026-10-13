import { useRef, useState, type KeyboardEvent } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { NavMenu } from "@/components/NavMenu";
import { useScrollToHash } from "@/components/useScrollToHash";
import { cx } from "@/lib/cx";
import { useScrolledPast } from "@/lib/useScrolledPast";

/** Hauteur de l'en-tête en pixels, identique au token --spacing-header (4rem). */
const HEADER_HEIGHT_PX = 64;

const FOOTER_LINK_CLASS =
  "link inline-flex min-h-tap items-center aria-[current=page]:[--link-weight:700]";

/** Trait de l'icône du menu, dessinée en CSS (aucune librairie d'icônes). */
const BAR_CLASS = "absolute left-0 h-0.5 w-5 bg-current";

/**
 * Gabarit partagé par toutes les pages.
 * `<Outlet />` est l'emplacement où React Router insère la page correspondant à l'URL
 * (l'équivalent du `{% block body %}` d'un template Twig).
 *
 * L'en-tête est fixe. Sur l'accueil, il est transparent et blanc par-dessus le hero, puis
 * passe en noir sur fond blanc dès que le hero est passé (ou que le menu mobile est ouvert).
 * Les zones sûres (encoche, barre d'accueil iOS) sont gérées par chaque bloc : en haut par
 * l'en-tête, sur les côtés par `px-safe`, en bas par le pied de page.
 */
export function Layout() {
  useScrollToHash();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isPastHero = useScrolledPast(() => window.innerHeight - HEADER_HEIGHT_PX);

  // Le menu est ouvert « pour » une navigation donnée : dès que l'URL change (clic sur un
  // lien du menu), `location.key` change et le menu se referme, sans effet ni second rendu.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const isMenuOpen = menuOpenAt === location.key;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isOverHero = isHome && !isPastHero && !isMenuOpen;

  function toggleMenu() {
    setMenuOpenAt(isMenuOpen ? null : location.key);
  }

  // Échap ferme le menu et rend le focus au bouton qui l'a ouvert.
  function handleHeaderKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && isMenuOpen) {
      setMenuOpenAt(null);
      menuButtonRef.current?.focus();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Lien d'évitement : invisible jusqu'à ce qu'il reçoive le focus clavier. */}
      <a
        href="#contenu"
        className="sr-only z-50 bg-surface px-4 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-[env(safe-area-inset-top)] focus:left-2 focus:inline-flex focus:min-h-tap focus:items-center"
      >
        Aller au contenu
      </a>

      <header
        onKeyDown={handleHeaderKeyDown}
        className={cx(
          "fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]",
          // Sur la vidéo : transparent, texte blanc. Ensuite, verre dépoli blanc (index.css,
          // repli opaque si backdrop-filter n'est pas supporté).
          isOverHero
            ? "bg-transparent text-white [--focus-ring:var(--color-white)]"
            : "glass-light border-b border-ink/10 text-ink",
        )}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between px-safe">
          <NavLink
            to="/"
            end
            // Sur le hero, le grand logo central suffit : on masque celui de l'en-tête.
            className={cx(
              "title-display inline-flex min-h-header items-center text-2xl uppercase",
              isOverHero && "invisible",
            )}
          >
            CutsByAlix
          </NavLink>

          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="menu-principal"
            onClick={toggleMenu}
            className="inline-flex min-h-tap min-w-tap items-center gap-2 px-2 font-semibold md:hidden"
          >
            Menu
            {/* Trois traits, ou une croix quand le menu est ouvert. */}
            <span aria-hidden="true" className="relative block h-3.5 w-5">
              <span className={cx(BAR_CLASS, isMenuOpen ? "top-1.5 rotate-45" : "top-0")} />
              <span className={cx(BAR_CLASS, "top-1.5", isMenuOpen && "opacity-0")} />
              <span className={cx(BAR_CLASS, isMenuOpen ? "top-1.5 -rotate-45" : "top-3")} />
            </span>
          </button>

          {/* Un seul menu : panneau replié sous la barre sur mobile, en ligne à partir de md. */}
          <div
            id="menu-principal"
            className={cx("w-full md:block md:w-auto", isMenuOpen ? "block" : "hidden")}
          >
            <NavMenu />
          </div>
        </div>
      </header>

      {/* tabIndex -1 : le lien d'évitement peut y placer le focus, sans l'ajouter au parcours
          Tab. Hors accueil, on réserve la hauteur de l'en-tête fixe ; sur l'accueil, le hero
          passe dessous. */}
      <main
        id="contenu"
        tabIndex={-1}
        className={cx(
          "w-full flex-1",
          !isHome && "pt-[calc(var(--spacing-header)+env(safe-area-inset-top))]",
        )}
      >
        <Outlet />
      </main>

      {/* Pied de page blanc, ouvert par la bande « poteau de barbier » pleine largeur. */}
      <footer className="bg-paper text-ink">
        <span aria-hidden="true" className="bg-barber block h-2.5" />
        <div className="mx-auto flex max-w-content-wide flex-col gap-5 px-safe pt-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
          <p className="title-display text-3xl uppercase">CutsByAlix</p>
          <p className="text-muted">Coupes et barbes sur rendez-vous.</p>
          <nav aria-label="Informations légales">
            <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li>
                <NavLink to="/conditions" className={FOOTER_LINK_CLASS}>
                  Conditions de réservation
                </NavLink>
              </li>
              <li>
                <NavLink to="/mentions-legales" className={FOOTER_LINK_CLASS}>
                  Mentions légales
                </NavLink>
              </li>
              <li>
                <NavLink to="/politique-confidentialite" className={FOOTER_LINK_CLASS}>
                  Politique de confidentialité
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
