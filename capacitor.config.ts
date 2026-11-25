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
    LocalNotifications: {
      smallIcon: "ic_stat_codit",
      iconColor: "#8B6BFF",
    },
  },
};

export default config;
