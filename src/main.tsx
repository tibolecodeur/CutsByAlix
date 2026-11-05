import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "@/App";
import "@/index.css";
import { applySeason } from "@/lib/season";

// Saison (base ou Noël) posée sur <html> AVANT le premier affichage.
applySeason();

// `BrowserRouter` lit l'URL du navigateur (history API) : l'hébergeur doit servir index.html
// pour toute URL qui n'est pas un fichier, sans quoi un rechargement sur /galerie renverrait un
// 404. Cloudflare Pages le fait par défaut tant que le build ne contient pas de 404.html.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
