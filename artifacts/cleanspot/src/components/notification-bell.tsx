import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellOff, BellRing, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/hooks/use-auth";

interface NotificationItem {
  id: number;
  title: string;
  body: string;
  type: string;
  reportId: number | null;
  url: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const prevUnreadRef = useRef<number>(0);
  const alarmStopRef = useRef<(() => void) | null>(null);
  const dataRef = useRef<NotificationsResponse | undefined>(undefined);
  const { permission, isSubscribed, isLoading, supported, subscribe, unsubscribe } = usePushNotifications();

  // 10-second pulsing alarm + optional text-to-speech announcement
  const playAlarm = useCallback((speechText?: string) => {
    // Stop any currently playing alarm first
    alarmStopRef.current?.();

    let ctx: AudioContext | null = null;
    let ttsTimeout: ReturnType<typeof setTimeout> | null = null;
    let autoStopTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (ttsTimeout) clearTimeout(ttsTimeout);
      if (autoStopTimeout) clearTimeout(autoStopTimeout);
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      ctx?.close().catch(() => {});
      ctx = null;
      alarmStopRef.current = null;
    };

    alarmStopRef.current = stop;

    (async () => {
      try {
        ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        if (stopped) { ctx.close().catch(() => {}); return; }

        const t0 = ctx.currentTime;
        const PULSE_ON = 0.2;   // 200 ms tone
        const PULSE_OFF = 0.15; // 150 ms silence
        const CYCLE = PULSE_ON + PULSE_OFF;
        const TOTAL_SECS = 10;
        const cycles = Math.ceil(TOTAL_SECS / CYCLE);
        const freqs = [880, 784]; // alternate between two pitches

        for (let i = 0; i < cycles; i++) {
          const t = t0 + i * CYCLE;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.connect(g);
          g.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.value = freqs[i % 2];
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.22, t + 0.02);
          g.gain.setValueAtTime(0.22, t + PULSE_ON - 0.02);
          g.gain.linearRampToValueAtTime(0.001, t + PULSE_ON);
          osc.start(t);
          osc.stop(t + PULSE_ON);
        }

        // Speak the notification body after a brief ring (1.5 s in)
        if (speechText && typeof window !== "undefined" && "speechSynthesis" in window) {
          ttsTimeout = setTimeout(() => {
            if (stopped) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(speechText);
            u.rate = 0.9;
            u.volume = 1;
            window.speechSynthesis.speak(u);
          }, 1500);
        }

        // Auto-cleanup after alarm finishes
        autoStopTimeout = setTimeout(stop, (TOTAL_SECS + 2) * 1000);
      } catch {
        // Audio API unavailable or suspended — silent fail
      }
    })();
  }, []);

  // Keep dataRef current so effects that don't depend on data can still read it
  useEffect(() => { dataRef.current = data; });

  // Show tooltip on first appearance for authenticated users
  const [showIntroTooltip, setShowIntroTooltip] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (localStorage.getItem("bell-tooltip-shown") === "1") return;
    // Small delay so it appears after the page settles
    const timer = setTimeout(() => {
      setShowIntroTooltip(true);
      // Auto-hide after 5 seconds and mark as shown
      const hideTimer = setTimeout(() => {
        setShowIntroTooltip(false);
        localStorage.setItem("bell-tooltip-shown", "1");
      }, 5000);
      return () => clearTimeout(hideTimer);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const handleBellClick = () => {
    // Stop alarm when user opens the bell — they've acknowledged the alert
    alarmStopRef.current?.();
    if (showIntroTooltip) {
      setShowIntroTooltip(false);
      localStorage.setItem("bell-tooltip-shown", "1");
    }
    setOpen((prev) => !prev);
  };

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => customFetch<NotificationsResponse>("/api/notifications"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const unreadCount = data?.unreadCount ?? 0;

  // Play 10-second alarm when unread count increases (polling-based foreground detection)
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
      const latestUnread = dataRef.current?.notifications?.find((n) => !n.read);
      playAlarm(latestUnread?.body);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, playAlarm]);

  // Listen for push-received messages from service worker (fired when push arrives while app is open)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "push-received") {
        playAlarm(event.data.payload?.body as string | undefined);
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [queryClient, playAlarm]);

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (!isAuthenticated) return null;

  const notifications = data?.notifications ?? [];

  const bellButton = (
    <Button
      variant="ghost"
      size="icon"
      className="relative text-foreground hover:bg-primary/5 hover:text-primary rounded-full"
      aria-label="Notifications"
      onClick={handleBellClick}
    >
      {unreadCount > 0 ? (
        <BellRing className="h-5 w-5 text-primary" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 leading-none">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Button>
  );

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip open={showIntroTooltip}>
          <PopoverTrigger asChild>
            <TooltipTrigger asChild>
              {bellButton}
            </TooltipTrigger>
          </PopoverTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-[200px] text-center text-xs leading-snug"
          >
            Tap here to see your notifications and enable push alerts
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" className="w-[340px] p-0 shadow-xl" sideOffset={8}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <span className="font-bold text-sm text-foreground">Notifications</span>
            <div className="flex items-center gap-1">
              {supported && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
                  onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
                  disabled={isLoading || permission === "denied"}
                >
                  {isSubscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                </Button>
              )}
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Mark all as read"
                  onClick={() => markAllReadMutation.mutate()}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {permission === "denied" && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-start gap-2">
              <BellOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Push notifications are blocked. Enable them in your browser settings.</span>
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p>No notifications yet</p>
                {!isSubscribed && supported && permission !== "denied" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={subscribe}
                    disabled={isLoading}
                  >
                    Enable push notifications
                  </Button>
                )}
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/30 last:border-0 transition-colors ${
                      n.read ? "bg-background" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? "text-foreground/70" : "text-foreground font-semibold"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                        onClick={() => markReadMutation.mutate(n.id)}
                        title="Mark as read"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
