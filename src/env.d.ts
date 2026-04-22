/// <reference types="astro/client" />

import type { SiteData } from "./lib/cms";

declare namespace App {
  interface Locals {
    siteData: SiteData;
  }
}

interface ImportMetaEnv {
  /** R2: URL do endpoint S3 API (ex.: https://ACCOUNT_ID.r2.cloudflarestorage.com). Na AWS costuma ficar vazio. */
  readonly S3_ENDPOINT?: string;
  readonly S3_REGION?: string;
  readonly S3_BUCKET?: string;
  readonly S3_ACCESS_KEY_ID?: string;
  readonly S3_SECRET_ACCESS_KEY?: string;
  /** URL pública servida ao browser (domínio R2 público, CDN, etc.), sem barra final. */
  readonly S3_PUBLIC_BASE_URL?: string;
  /** Prefixo da chave no bucket (ex.: covers). */
  readonly S3_KEY_PREFIX?: string;
}
