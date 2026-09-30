import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL;
  const baseUrl = (rawUrl && !rawUrl.includes("localhost") ? rawUrl : "https://qrmasterdigital.com").replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/terms", "/privacy"],
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/my-qrs",
          "/analytics",
          "/settings",
          "/create",
          "/campaigns",
          "/files",
          "/templates",
          "/favorites",
          "/trash",
          "/profile",
          "/q/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
