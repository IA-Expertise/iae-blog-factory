import type { AdPosicao } from "@prisma/client";
import sharp from "sharp";

/** Redimensiona banner para veiculação (topo/corpo 728×90, lateral 300×250), saída WebP. */
export async function resizeMonetizationBanner(
  buffer: Buffer,
  posicao: AdPosicao
): Promise<{ buffer: Buffer; contentType: string }> {
  const width = posicao === "lateral" ? 300 : 728;
  const height = posicao === "lateral" ? 250 : 90;

  const out = await sharp(buffer)
    .rotate()
    .resize(width, height, { fit: "cover", position: "attention" })
    .webp({ quality: 88 })
    .toBuffer();

  return { buffer: out, contentType: "image/webp" };
}
