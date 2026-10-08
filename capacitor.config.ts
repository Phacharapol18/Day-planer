import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent once published on Google Play.
  appId: 'com.phacharapol.dayplanner',
  appName: 'Day Planner',
  webDir: 'dist',
  android: {
    // Keep the WebView's data (localStorage) across updates and survive process death.
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      launchFadeOutDuration: 180,
      backgroundColor: '#f6f3ee',
      showSpinner: false,
    },
  },
};

export default config;
