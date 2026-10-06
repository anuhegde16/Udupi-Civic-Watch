import {
  getInstallEnvironment,
  getOpenInChromeUrl,
  triggerInstall,
  useInstallState,
} from "@/lib/install-prompt";

interface UseInstallPwaReturn {
  isInstalled: boolean;
  isIos: boolean;
  isAndroid: boolean;
  isIosSafari: boolean;
  inAppBrowser: boolean;
  hasNativePrompt: boolean;
  promptInstall: () => Promise<void>;
  openInChromeUrl: string;
}

export function useInstallPwa(): UseInstallPwaReturn {
  const { deferred, installed } = useInstallState();
  const env = getInstallEnvironment();

  return {
    isInstalled: installed,
    ...env,
    hasNativePrompt: !!deferred,
    promptInstall: async () => {
      await triggerInstall();
    },
    openInChromeUrl: env.isAndroid ? getOpenInChromeUrl() : "",
  };
}
