import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.codit.app",
  appName: "Codit",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
