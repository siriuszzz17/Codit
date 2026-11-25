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
    PushNotifications: {
      // No primeiro plano o React já exibe toast e atualiza a lista. O FCM
      // permanece responsável pelos avisos do sistema em segundo plano.
      presentationOptions: [],
    },
  },
};

export default config;
