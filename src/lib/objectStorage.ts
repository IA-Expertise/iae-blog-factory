import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/i;

function trimEnv(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t || undefined;
}

/** R2, MinIO ou AWS S3: bucket + chaves + URL pública do bucket/CDN. */
export function isObjectStorageConfigured(): boolean {
  return Boolean(
    trimEnv(import.meta.env.S3_BUCKET) &&
      trimEnv(import.meta.env.S3_ACCESS_KEY_ID) &&
      trimEnv(import.meta.env.S3_SECRET_ACCESS_KEY) &&
      trimEnv(import.meta.env.S3_PUBLIC_BASE_URL)
  );
}

function buildClient(): S3Client {
  const endpoint = trimEnv(import.meta.env.S3_ENDPOINT);
  const region = trimEnv(import.meta.env.S3_REGION) ?? "auto";
  const accessKeyId = trimEnv(import.meta.env.S3_ACCESS_KEY_ID)!;
  const secretAccessKey = trimEnv(import.meta.env.S3_SECRET_ACCESS_KEY)!;

  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint)
  });
}

function objectKeyForFilename(filename: string): string {
  if (!SAFE_FILENAME.test(filename)) {
    throw new Error("Nome de ficheiro inválido para upload");
  }
  const prefix = (trimEnv(import.meta.env.S3_KEY_PREFIX) ?? "covers").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${filename}` : filename;
}

function objectKeyForPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return null;
  if (!/^[a-zA-Z0-9/_\.-]+$/.test(normalized)) return null;
  if (!/\.(png|jpg|jpeg|webp)$/i.test(normalized)) return null;
  const prefix = (trimEnv(import.meta.env.S3_KEY_PREFIX) ?? "covers").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${normalized}` : normalized;
}

function publicUrlForKey(key: string): string {
  const base = trimEnv(import.meta.env.S3_PUBLIC_BASE_URL)!.replace(/\/$/, "");
  return `${base}/${key}`;
}

/**
 * Envia bytes da capa para o bucket e devolve a URL pública (CDN / domínio R2 / S3 website).
 * Em falha devolve null (o chamador usa fallback em disco).
 */
export async function uploadGeneratedCoverImage(params: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<string | null> {
  if (!isObjectStorageConfigured()) return null;

  const bucket = trimEnv(import.meta.env.S3_BUCKET);
  if (!bucket) return null;

  let key: string;
  try {
    key = objectKeyForFilename(params.filename);
  } catch {
    return null;
  }

  try {
    const client = buildClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: params.buffer,
        ContentType: params.contentType,
        CacheControl: "public, max-age=31536000"
      })
    );
    return publicUrlForKey(key);
  } catch (err) {
    console.error("Erro ao enviar imagem para object storage:", err);
    return null;
  }
}

/**
 * Upload genérico de imagens públicas (logos/capas) para o mesmo bucket.
 */
export async function uploadPublicImageAsset(params: {
  buffer: Buffer;
  objectPath: string;
  contentType: string;
}): Promise<string | null> {
  if (!isObjectStorageConfigured()) return null;
  const bucket = trimEnv(import.meta.env.S3_BUCKET);
  if (!bucket) return null;

  const key = objectKeyForPath(params.objectPath);
  if (!key) return null;

  try {
    const client = buildClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: params.buffer,
        ContentType: params.contentType,
        CacheControl: "public, max-age=31536000"
      })
    );
    return publicUrlForKey(key);
  } catch (err) {
    console.error("Erro ao enviar asset para object storage:", err);
    return null;
  }
}
