import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserCodec,
  computeTargetSize,
  IMAGE_RULES,
  ImageError,
  processImage,
  sniffImageType,
  type ImageCodec,
} from "@/features/gallery/processImage";

// Aucune vraie photo : les « fichiers » ne contiennent que les octets d'en-tête de chaque
// format, et le décodage / l'encodage (canvas, absent de jsdom) sont simulés.
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
// « RIFF » + taille + « WEBP »
const WEBP_HEADER = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

function fakeFile(bytes: number[] | string, type: string, name = "IMG_0001.jpg", size?: number) {
  const content = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  const file = new File([content], name, { type });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Faux codec : décode à la taille donnée, encode un blob du type demandé (ou d'un autre). */
function fakeCodec(
  options: {
    width?: number;
    height?: number;
    /** Type réellement produit pour chaque type demandé (Safari : webp → png). */
    produces?: (requested: string) => string | null;
    /** Taille du blob encodé, selon le type et la qualité. */
    sizeOf?: (type: string, quality: number) => number;
    decodeFails?: boolean;
  } = {},
) {
  const close = vi.fn();
  const codec: ImageCodec = {
    decode: vi.fn(async () => {
      if (options.decodeFails) throw new Error("décodage impossible");
      return {
        source: {} as CanvasImageSource,
        width: options.width ?? 4000,
        height: options.height ?? 3000,
        close,
      };
    }),
    encode: vi.fn(async (_source, _width, _height, type: string, quality: number) => {
      const produced = options.produces ? options.produces(type) : type;
      if (produced === null) return null;
      const size = options.sizeOf ? options.sizeOf(produced, quality) : 200_000;
      return new Blob([new Uint8Array(size)], { type: produced });
    }),
  };
  return { codec, close };
}

describe("sniffImageType", () => {
  it("reconnaît JPEG, PNG et WebP à leurs premiers octets", () => {
    expect(sniffImageType(new Uint8Array(JPEG_HEADER))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array(PNG_HEADER))).toBe("image/png");
    expect(sniffImageType(new Uint8Array(WEBP_HEADER))).toBe("image/webp");
  });

  it("refuse le reste : SVG, texte, fichier vide, RIFF qui n'est pas du WebP", () => {
    expect(sniffImageType(new TextEncoder().encode(SVG_TEXT))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // RIFF….WAVE : un fichier audio.
    expect(
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull();
  });
});

describe("computeTargetSize", () => {
  it("réduit le grand côté à 1200 px en gardant les proportions", () => {
    expect(computeTargetSize(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(computeTargetSize(3024, 4032, 1200)).toEqual({ width: 900, height: 1200 });
    expect(computeTargetSize(5000, 5000, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it("n'agrandit jamais une petite image", () => {
    expect(computeTargetSize(800, 600, 1200)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(1200, 1, 1200)).toEqual({ width: 1200, height: 1 });
  });

  it("garde au moins 1 px de côté (panorama extrême)", () => {
    expect(computeTargetSize(12000, 5, 1200)).toEqual({ width: 1200, height: 1 });
  });

  it("refuse des dimensions absurdes", () => {
    expect(() => computeTargetSize(0, 100, 1200)).toThrow(ImageError);
    expect(() => computeTargetSize(Number.NaN, 100, 1200)).toThrow(ImageError);
  });
});

describe("processImage", () => {
  it("redimensionne à 1200 px et ré-encode en WebP", async () => {
    const { codec, close } = fakeCodec({ width: 4032, height: 3024 });
    const result = await processImage(fakeFile(JPEG_HEADER, "image/jpeg"), codec);

    expect(result).toMatchObject({
      type: "image/webp",
      extension: "webp",
      width: 1200,
      height: 900,
    });
    expect(result.blob.type).toBe("image/webp");
    expect(codec.encode).toHaveBeenCalledWith(
      expect.anything(),
      1200,
      900,
      "image/webp",
      IMAGE_RULES.webpQuality,
    );
    // L'image décodée est libérée (mémoire du téléphone).
    expect(close).toHaveBeenCalled();
  });

  it("produit TOUJOURS un nouveau fichier : jamais l'original, donc jamais son EXIF", async () => {
    const original = fakeFile(JPEG_HEADER, "image/jpeg");
    const { codec } = fakeCodec({ width: 800, height: 600 });
    const result = await processImage(original, codec);

    // Même une petite image déjà au bon format passe par le canvas.
    expect(codec.encode).toHaveBeenCalledTimes(1);
    expect(result.blob).not.toBe(original);
    expect(result).toMatchObject({ width: 800, height: 600 });
  });

  it("se replie sur le JPEG quand le navigateur n'encode pas le WebP (Safari iOS)", async () => {
    const { codec } = fakeCodec({ produces: (t) => (t === "image/webp" ? "image/png" : t) });
    const result = await processImage(fakeFile(PNG_HEADER, "image/png", "capture.png"), codec);

    expect(result).toMatchObject({ type: "image/jpeg", extension: "jpg" });
    expect(codec.encode).toHaveBeenLastCalledWith(
      expect.anything(),
      1200,
      900,
      "image/jpeg",
      IMAGE_RULES.jpegQuality,
    );
  });

  it("se replie sur le JPEG quand toBlob ne renvoie rien", async () => {
    const { codec } = fakeCodec({ produces: (t) => (t === "image/webp" ? null : t) });
    const result = await processImage(fakeFile(WEBP_HEADER, "image/webp", "a.webp"), codec);
    expect(result.type).toBe("image/jpeg");
  });

  it("baisse la qualité si l'image reste trop lourde, puis abandonne", async () => {
    // Trop lourd à la qualité de départ, assez léger à la suivante.
    const lighter = fakeCodec({
      sizeOf: (_t, q) => (q >= IMAGE_RULES.webpQuality ? IMAGE_RULES.maxOutputBytes + 1 : 300_000),
    });
    const ok = await processImage(fakeFile(JPEG_HEADER, "image/jpeg"), lighter.codec);
    expect(ok.blob.size).toBe(300_000);
    expect(lighter.codec.encode).toHaveBeenCalledTimes(2);

    const heavy = fakeCodec({ sizeOf: () => IMAGE_RULES.maxOutputBytes + 1 });
    await expect(
      processImage(fakeFile(JPEG_HEADER, "image/jpeg"), heavy.codec),
    ).rejects.toMatchObject({ code: "file_too_large" });
  });

  it.each([
    ["un SVG (même annoncé comme image)", fakeFile(SVG_TEXT, "image/svg+xml", "logo.svg")],
    ["un SVG déguisé en JPEG", fakeFile(SVG_TEXT, "image/jpeg", "photo.jpg")],
    ["un GIF", fakeFile([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif", "a.gif")],
    ["un HEIC non converti", fakeFile([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], "image/heic")],
    ["une page HTML", fakeFile("<!doctype html><html>", "text/html", "page.html")],
    ["un PNG annoncé comme JPEG (type incohérent)", fakeFile(PNG_HEADER, "image/jpeg")],
    ["un fichier sans type", fakeFile(JPEG_HEADER, "", "sans-type")],
    ["un fichier vide", fakeFile([], "image/jpeg")],
  ])("refuse %s, sans même le décoder", async (_label, file) => {
    const { codec } = fakeCodec();
    const promise = processImage(file, codec);
    await expect(promise).rejects.toBeInstanceOf(ImageError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_file" });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("refuse un fichier d'origine trop lourd, sans le lire", async () => {
    const { codec } = fakeCodec();
    const file = fakeFile(JPEG_HEADER, "image/jpeg", "a.jpg", IMAGE_RULES.maxInputBytes + 1);
    await expect(processImage(file, codec)).rejects.toMatchObject({ code: "file_too_large" });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("signale une image illisible (fichier tronqué) comme fichier invalide", async () => {
    const { codec } = fakeCodec({ decodeFails: true });
    await expect(processImage(fakeFile(JPEG_HEADER, "image/jpeg"), codec)).rejects.toMatchObject({
      code: "invalid_file",
    });
  });

  it("refuse si aucun format n'est encodable, et libère l'image", async () => {
    const { codec, close } = fakeCodec({ produces: () => null });
    await expect(processImage(fakeFile(JPEG_HEADER, "image/jpeg"), codec)).rejects.toMatchObject({
      code: "processing_failed",
    });
    expect(close).toHaveBeenCalled();
  });
});

describe("browserCodec (canvas simulé : jsdom n'en a pas)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // img.decode() n'existe pas dans jsdom : certains tests l'ajoutent, on le retire.
    delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  });

  it("décode avec l'orientation EXIF appliquée et libère l'image", async () => {
    const close = vi.fn();
    const bitmap = { width: 3024, height: 4032, close };
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const file = new Blob([new Uint8Array(JPEG_HEADER)], { type: "image/jpeg" });
    const decoded = await browserCodec.decode(file);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(decoded).toMatchObject({ width: 3024, height: 4032, source: bitmap });
    decoded.close();
    expect(close).toHaveBeenCalled();
  });

  it("se replie sur <img> si createImageBitmap échoue", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("option non prise en charge");
      }),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    // jsdom ne définit pas img.decode() : on l'ajoute le temps du test.
    HTMLImageElement.prototype.decode = vi.fn(async () => undefined);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(600);

    const decoded = await browserCodec.decode(new Blob([new Uint8Array(JPEG_HEADER)]));
    expect(decoded).toMatchObject({ width: 800, height: 600 });
    decoded.close();
    expect(revoke).toHaveBeenCalledWith("blob:photo");
  });

  it("libère l'URL si le repli <img> ne décode pas", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    HTMLImageElement.prototype.decode = vi.fn(async () => {
      throw new Error("tronqué");
    });

    await expect(browserCodec.decode(new Blob([]))).rejects.toThrow("tronqué");
    expect(revoke).toHaveBeenCalledWith("blob:photo");
  });

  it("dessine sur fond blanc à la taille voulue, puis encode", async () => {
    const context = {
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
      type,
    ) {
      callback(new Blob([new Uint8Array(4)], { type: type ?? "image/png" }));
    });

    const source = {} as CanvasImageSource;
    const blob = await browserCodec.encode(source, 1200, 900, "image/webp", 0.82);

    expect(blob?.type).toBe("image/webp");
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1200, 900);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1200, 900);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.82);
  });

  it("canvas indisponible : null (le traitement le signalera)", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(
      browserCodec.encode({} as CanvasImageSource, 10, 10, "image/webp", 0.8),
    ).resolves.toBeNull();
  });
});
