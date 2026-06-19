import sharp from "sharp";

export interface ResizedImage {
  buffer: Buffer;
  mimeType: string;
}

/** Downscale notebook photos before Vision OCR and storage. */
export async function resizeImageForOcr(
  image: Buffer,
  mimeType: string,
  maxWidth: number,
  maxHeight: number,
  jpegQuality: number,
): Promise<ResizedImage> {
  const buffer = await sharp(image)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toBuffer();

  return { buffer, mimeType: "image/jpeg" };
}
