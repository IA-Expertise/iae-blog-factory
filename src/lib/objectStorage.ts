import type { DeleteObjectCommandInput, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";

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

let s3Client: S3Client | null = null;

/** Um único client por processo (evita vazamento de memória no Railway). */
async function getS3Client(): Promise<S3Client> {
  if (s3Client) return s3Client;
  const { S3Client: Client } = await import("@aws-sdk/client-s3");
  const endpoint = trimEnv(import.meta.env.S3_ENDPOINT);
  const region = trimEnv(import.meta.env.S3_REGION) ?? "auto";
  const accessKeyId = trimEnv(import.meta.env.S3_ACCESS_KEY_ID)!;
  const secretAccessKey = trimEnv(import.meta.env.S3_SECRET_ACCESS_KEY)!;
  s3Client = new Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint)
  });
  return s3Client;
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

/** Extrai a chave do objeto a partir da URL pública (mesma base configurada em S3_PUBLIC_BASE_URL). */
export function publicUrlToStorageKey(publicUrl: string): string | null {
  const base = trimEnv(import.meta.env.S3_PUBLIC_BASE_URL)?.replace(/\/$/, "");
  if (!base || !publicUrl.startsWith(base)) return null;
  const rest = publicUrl.slice(base.length).replace(/^\/+/, "");
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** Remove objeto do bucket quando a URL foi gerada por este projeto (R2/S3). */
export async function deletePublicImageByUrl(publicUrl: string): Promise<void> {
  if (!isObjectStorageConfigured()) return;
  const key = publicUrlToStorageKey(publicUrl);
  if (!key) {
    console.warn("[objectStorage] URL não corresponde a S3_PUBLIC_BASE_URL; skip delete:", publicUrl);
    return;
  }
  const bucket = trimEnv(import.meta.env.S3_BUCKET);
  if (!bucket) return;

  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const input: DeleteObjectCommandInput = { Bucket: bucket, Key: key };
  await client.send(new DeleteObjectCommand(input));
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
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    const input: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
      CacheControl: "public, max-age=31536000"
    };
    await client.send(new PutObjectCommand(input));
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
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    const input: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
      CacheControl: "public, max-age=31536000"
    };
    await client.send(new PutObjectCommand(input));
    return publicUrlForKey(key);
  } catch (err) {
    console.error("Erro ao enviar asset para object storage:", err);
    return null;
  }
}
