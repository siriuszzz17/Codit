import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.codit.app",
  appName: "Codit",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "disable",
      initialViewportFitValueHint: "cover",
      style: "DEFAULT",
      hidden: false,
    },
  },
};

export default config;
