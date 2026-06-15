import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X, Share, Smartphone } from "lucide-react";
import { useInstallPwa } from "@/hooks/use-install-pwa";

export function InstallPwaButton() {
  const { isInstalled, isIos, hasNativePrompt, promptInstall } = useInstallPwa();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (hasNativePrompt) {
      await promptInstall();
    } else {
      setShowGuide((v) => !v);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        variant="outline"
        onClick={handleClick}
        className="w-full sm:w-auto h-16 px-8 text-lg font-bold rounded-2xl border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-all hover:-translate-y-1"
      >
        <Download className="w-5 h-5 mr-3" />
        Add to Home Screen
      </Button>

      {showGuide && (
        <div className="relative rounded-2xl bg-white/95 text-gray-900 p-5 shadow-2xl max-w-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {isIos ? (
            <>
              <p className="font-bold text-sm mb-3">Install on iPhone / iPad</p>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">1</span>
                  <span>
                    Tap the{" "}
                    <span className="inline-flex items-center gap-1 font-semibold text-primary">
                      <Share className="w-3.5 h-3.5" /> Share
                    </span>{" "}
                    button at the bottom of Safari
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">2</span>
                  <span>Scroll down and tap <span className="font-semibold">"Add to Home Screen"</span></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">3</span>
                  <span>Tap <span className="font-semibold">"Add"</span> — the app icon appears on your home screen</span>
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="font-bold text-sm mb-1 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Install on your phone
              </p>
              <p className="text-sm text-gray-600 mb-3">Open this page on your phone's browser to install.</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">Android:</span>
                  <span>Tap <span className="font-semibold">⋮ Menu → Add to Home Screen</span> in Chrome</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">iPhone:</span>
                  <span>Tap <span className="font-semibold">Share → Add to Home Screen</span> in Safari</span>
                </li>
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
