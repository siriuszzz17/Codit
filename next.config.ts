import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import packageJson from "./package.json";

const securityHeaders: NonNullable<NextConfig["headers"]> = async () => [
  {
    source: "/(.*)",
    headers: [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ],
  },
  {
    source: "/sw.js",
    headers: [
      {
        key: "Content-Type",
        value: "application/javascript; charset=utf-8",
      },
      {
        key: "Cache-Control",
        value: "no-cache, no-store, must-revalidate",
      },
      {
        key: "Service-Worker-Allowed",
        value: "/",
      },
      {
        key: "Content-Security-Policy",
        value: "default-src 'self'; script-src 'self'",
      },
    ],
  },
  {
    source: "/manifest.webmanifest",
    headers: [
      {
        key: "Content-Type",
        value: "application/manifest+json; charset=utf-8",
      },
      {
        key: "Cache-Control",
        value: "public, max-age=0, must-revalidate",
      },
    ],
  },
];

export default function createNextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const isServerBuild = process.env.CODIT_BUILD_TARGET === "server";
  const useStaticExport = !isDev && !isServerBuild;

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    env: {
      NEXT_PUBLIC_APP_VERSION: packageJson.version,
    },
    images: {
      unoptimized: true,
    },
    ...(useStaticExport ? { output: "export" as const } : {}),
    ...(useStaticExport ? {} : { headers: securityHeaders }),
  };
}
