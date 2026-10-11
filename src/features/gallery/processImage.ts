/**
 * Préparation d'une photo AVANT l'envoi, entièrement dans le navigateur d'Alix :
 *
 * 1. Refus de tout ce qui n'est pas un JPEG, PNG ou WebP : type annoncé ET premiers octets du
 *    fichier (un SVG ou une page HTML renommés en .jpg sont refusés sans être décodés).
 * 2. Décodage avec l'orientation de l'appareil photo appliquée (la photo reste droite).
 * 3. Redimensionnement à 1200 px au plus sur le grand côté, jamais d'agrandissement.
 * 4. Ré-encodage par un canvas en WebP, ou en JPEG si le navigateur n'encode pas le WebP
 *    (Safari iOS renvoie alors du PNG sans prévenir). Le canvas ne contient que des pixels :
 *    les métadonnées EXIF de l'original (GPS, date, modèle du téléphone…) ne sont jamais
 *    recopiées. On n'envoie JAMAIS le fichier d'origine.
 * 5. Vérification du poids final (qualité baissée si besoin).
 *
 * Le décodage et l'encodage passent par un `ImageCodec` injectable : les tests (jsdom n'a pas
 * de canvas) en fournissent un faux, comme on injecte un service dans un constructeur Symfony.
 */

export const IMAGE_RULES = {
  /** Types acceptés en entrée (l'iPhone convertit ses photos HEIC en JPEG à la sélection). */
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
  /** Poids max du fichier d'origine (une photo de téléphone fait 2 à 12 Mo). */
  maxInputBytes: 25 * 1024 * 1024,
  /** Grand côté max de l'image envoyée, en pixels (même limite en base). */
  maxSide: 1200,
  /** Poids max de l'image envoyée (le bucket refuse au-delà de 2 Mo). */
  maxOutputBytes: 1.5 * 1024 * 1024,
  webpQuality: 0.82,
  jpegQuality: 0.85,
  /** Qualités essayées ensuite si l'image reste trop lourde. */
  fallbackQualities: [0.7, 0.6],
} as const;

export type AcceptedImageType = (typeof IMAGE_RULES.acceptedTypes)[number];

export type ImageErrorCode =
  /** Pas une image JPEG / PNG / WebP lisible. */
  | "invalid_file"
  /** Trop lourde, à l'origine ou après ré-encodage. */
  | "file_too_large"
  /** Le navigateur n'a pas su produire l'image (mémoire, canvas indisponible). */
  | "processing_failed";

export class ImageError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode) {
    super(code);
    this.name = "ImageError";
    this.code = code;
  }
}

/** Image décodée, prête à être dessinée. `close` libère la mémoire (grosses photos). */
export type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export type ImageCodec = {
  decode: (file: Blob) => Promise<DecodedImage>;
  /** Dessine `source` en `width` × `height` et l'encode ; null si le navigateur n'y arrive pas. */
  encode: (
    source: CanvasImageSource,
    width: number,
    height: number,
    type: string,
    quality: number,
  ) => Promise<Blob | null>;
};

export type ProcessedImage = {
  blob: Blob;
  type: "image/webp" | "image/jpeg";
  extension: "webp" | "jpg";
  width: number;
  height: number;
};

/** Type réel d'une image d'après ses premiers octets (« signature »), ou null. */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // « RIFF » <taille sur 4 octets> « WEBP »
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** Dimensions finales : grand côté ≤ `maxSide`, proportions gardées, jamais agrandie. */
export function computeTargetSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (!(width >= 1 && height >= 1) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new ImageError("invalid_file");
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Lit les premiers octets du fichier (sans charger la photo entière). */
async function readHeader(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

/** Formats essayés, dans l'ordre, avec leurs qualités. */
const ENCODINGS = [
  {
    type: "image/webp",
    extension: "webp",
    qualities: [IMAGE_RULES.webpQuality, ...IMAGE_RULES.fallbackQualities],
  },
  {
    type: "image/jpeg",
    extension: "jpg",
    qualities: [IMAGE_RULES.jpegQuality, ...IMAGE_RULES.fallbackQualities],
  },
] as const;

/** Prépare la photo choisie par Alix. Lève une `ImageError` avec un code stable. */
export async function processImage(
  file: File,
  codec: ImageCodec = browserCodec,
): Promise<ProcessedImage> {
  if (file.size === 0) throw new ImageError("invalid_file");
  if (file.size > IMAGE_RULES.maxInputBytes) throw new ImageError("file_too_large");
  if (!(IMAGE_RULES.acceptedTypes as readonly string[]).includes(file.type)) {
    throw new ImageError("invalid_file");
  }
  // Le type annoncé vient du nom du fichier : on le confronte au contenu réel.
  if (sniffImageType(await readHeader(file)) !== file.type) {
    throw new ImageError("invalid_file");
  }

  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(file);
  } catch {
    throw new ImageError("invalid_file");
  }

  try {
    const { width, height } = computeTargetSize(decoded.width, decoded.height, IMAGE_RULES.maxSide);
    let tooLarge = false;

    for (const encoding of ENCODINGS) {
      for (const quality of encoding.qualities) {
        const blob = await codec.encode(decoded.source, width, height, encoding.type, quality);
        // Format non pris en charge : le navigateur a produit autre chose (PNG) ou rien.
        if (blob === null || blob.type !== encoding.type) break;
        if (blob.size <= IMAGE_RULES.maxOutputBytes) {
          return { blob, type: encoding.type, extension: encoding.extension, width, height };
        }
        tooLarge = true;
      }
      // Le format est encodable mais l'image reste trop lourde : inutile d'essayer le JPEG,
      // moins compact que le WebP.
      if (tooLarge) break;
    }
    throw new ImageError(tooLarge ? "file_too_large" : "processing_failed");
  } finally {
    decoded.close();
  }
}

// ---------------------------------------------------------------------------------------
// Codec du navigateur (non testé par Vitest : jsdom n'a pas de canvas ; couvert par les
// tests Playwright sur Chromium et WebKit).
// ---------------------------------------------------------------------------------------

async function decodeInBrowser(file: Blob): Promise<DecodedImage> {
  // createImageBitmap décode hors du fil principal ; « from-image » applique l'orientation
  // EXIF (photo prise en portrait).
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Repli ci-dessous (option non prise en charge par un vieux navigateur).
    }
  }
  // Repli : <img>, qui applique aussi l'orientation (CSS image-orientation: from-image).
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function encodeInBrowser(
  source: CanvasImageSource,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  // Fond blanc : un PNG transparent deviendrait noir en JPEG (pas de transparence).
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export const browserCodec: ImageCodec = { decode: decodeInBrowser, encode: encodeInBrowser };
