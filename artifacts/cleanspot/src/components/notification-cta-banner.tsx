import { useState, useEffect } from "react";
import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useCitizenPushNotifications } from "@/hooks/use-citizen-push-notifications";

interface OfficerBannerProps {
  variant: "officer";
}

interface CitizenBannerProps {
  variant: "citizen";
  reportId?: number;
}

type NotificationCTABannerProps = OfficerBannerProps | CitizenBannerProps;

function OfficerBanner() {
  const { permission, isSubscribed, isLoading, supported, subscribe } = usePushNotifications();

  if (!supported || isSubscribed || permission === "unsupported") return null;

  if (permission === "denied") {
    return (
      <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
        <BellOff className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-amber-800 font-medium flex-1">
          Notifications are blocked. Open your browser or phone <strong>Settings</strong> and allow notifications for this site to stay updated.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Bell className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Enable push notifications</p>
          <p className="text-xs text-muted-foreground">Get instant alerts for new reports — works even when the app is closed</p>
        </div>
      </div>
      <Button
        size="sm"
        className="rounded-xl h-9 px-4 text-sm font-bold shrink-0 w-full sm:w-auto"
        onClick={subscribe}
        disabled={isLoading}
      >
        <Bell className="w-3.5 h-3.5 mr-1.5" />
        {isLoading ? "Enabling…" : "Enable Notifications"}
      </Button>
    </div>
  );
}

function CitizenBanner({ reportId }: { reportId?: number }) {
  const { permission, isSubscribed, isLoading, supported, subscribe } = useCitizenPushNotifications();
  const [autoLinked, setAutoLinked] = useState(false);

  // When user already granted permission (e.g. opted in on home page), auto-link
  // their existing browser push subscription to this specific report ID.
  // pushManager.subscribe() is idempotent — it returns the existing subscription.
  useEffect(() => {
    if (
      supported &&
      permission === "granted" &&
      reportId != null &&
      !isSubscribed &&
      !isLoading &&
      !autoLinked
    ) {
      setAutoLinked(true);
      subscribe(reportId);
    }
  }, [supported, permission, reportId, isSubscribed, isLoading, autoLinked, subscribe]);

  if (!supported || isSubscribed || permission === "unsupported") return null;

  // Auto-linking in progress — render nothing; user already said "yes" elsewhere
  if (permission === "granted") return null;

  if (permission === "denied") {
    return (
      <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
        <BellOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-amber-800 font-medium">
          Notifications are blocked. Open your browser <strong>Settings</strong> to allow them for this site.
        </p>
      </div>
    );
  }

  const description = reportId
    ? "Get an instant push notification when your report is cleaned — no account needed"
    : "Get instant alerts when waste reports near you are cleaned";

  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Bell className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Get notified when it's cleaned</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        className="rounded-xl h-9 px-4 text-sm font-bold shrink-0 w-full sm:w-auto"
        onClick={() => subscribe(reportId)}
        disabled={isLoading}
      >
        <Bell className="w-3.5 h-3.5 mr-1.5" />
        {isLoading ? "Enabling…" : "Enable Notifications"}
      </Button>
    </div>
  );
}

export function NotificationCTABanner(props: NotificationCTABannerProps) {
  if (props.variant === "officer") return <OfficerBanner />;
  return <CitizenBanner reportId={(props as CitizenBannerProps).reportId} />;
}

export function NotificationHomePill() {
  const { permission, isSubscribed, isLoading, supported, subscribe } = useCitizenPushNotifications();
  const [tried, setTried] = useState(false);

  // Never render if the browser can't support push at all
  if (!supported || permission === "unsupported") return null;

  const enabled = isSubscribed || permission === "granted";
  // Blocked = either the browser denied it, or we tried and it came back denied
  const blocked = permission === "denied" || (tried && permission !== "granted");

  const handleEnable = async () => {
    setTried(true);
    await subscribe();
  };

  return (
    <div className="flex items-center gap-2 mt-3 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5 text-white/80">
        {enabled ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" />
        ) : (
          <Bell className="w-3.5 h-3.5 text-white/60 shrink-0" />
        )}
        <span className="text-xs font-medium">
          {enabled
            ? "Notifications enabled"
            : blocked
            ? "Allow notifications in browser settings"
            : "Get notified about your reports"}
        </span>
        {!enabled && !blocked && (
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="text-xs font-bold text-secondary hover:text-secondary/80 transition-colors disabled:opacity-60 ml-0.5"
          >
            {isLoading ? "…" : "Enable"}
          </button>
        )}
      </div>
    </div>
  );
}
