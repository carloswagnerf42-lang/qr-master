import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/terms", "/privacy"],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/my-qrs/",
          "/analytics/",
          "/settings/",
          "/create/",
          "/campaigns/",
          "/files/",
          "/templates/",
          "/favorites/",
          "/trash/",
          "/profile/",
        ],
      },
    ],
    sitemap: `${(process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com").replace(/\/$/, "")}/sitemap.xml`,
  };
}
