import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://jaarle.com", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://jaarle.com/register", lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: "https://jaarle.com/login", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
