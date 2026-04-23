import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tradingacademy.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "",
    "/terms",
    "/privacy",
    "/disclaimer",
    "/refund",
    "/cookies",
    "/ko",
    "/ko/terms",
    "/ko/privacy",
    "/ko/disclaimer",
    "/ko/refund",
    "/ko/cookies",
  ];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.6,
  }));
}
