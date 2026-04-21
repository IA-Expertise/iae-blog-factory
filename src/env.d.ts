/// <reference types="astro/client" />

import type { SiteData } from "./lib/cms";

declare namespace App {
  interface Locals {
    siteData: SiteData;
  }
}
