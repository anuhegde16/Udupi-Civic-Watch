import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellOff, BellRing, Check, X, Loader2, Send, ExternalLink, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

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

function notificationIcon(type: string): string {
  if (type === "new_report") return "🗑️";
  if (type === "status_cleaning") return "🧹";
  if (type === "status_cleaned") return "✅";
  return "🔔";
}


function PushStatusChip({ permission, isSubscribed, supported }: {
  permission: string;
  isSubscribed: boolean;
  supported: boolean;
}) {
  if (!supported || permission === "unsupported") {
    return null;
  }
  if (permission === "denied") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        Blocked
      </span>
    );
  }
  if (isSubscribed && permission === "granted") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
        Push active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
      Not enabled
    </span>
  );
}

const PREVIEW_LIMIT = 5;

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const queryClient = useQueryClient();
  const prevUnreadRef = useRef<number>(0);
  const alarmStopRef = useRef<(() => void) | null>(null);
  const dataRef = useRef<NotificationsResponse | undefined>(undefined);
  const { permission, isSubscribed, isLoading, supported, subscribe, unsubscribe } = usePushNotifications();
  const [, navigate] = useLocation();

  // 4-beep alarm (~1.8 s total) + optional text-to-speech announcement
  const playAlarm = useCallback((speechText?: string) => {
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
        const BEEP_ON = 0.18;   // 180 ms tone
        const BEEP_GAP = 0.35;  // 350 ms silence between beeps
        const CYCLE = BEEP_ON + BEEP_GAP;
        const BEEP_COUNT = 4;
        // total audio: 4×180 ms + 3×350 ms = 1770 ms
        const TOTAL_BEEP_SECS = BEEP_COUNT * BEEP_ON + (BEEP_COUNT - 1) * BEEP_GAP;

        for (let i = 0; i < BEEP_COUNT; i++) {
          const t = t0 + i * CYCLE;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.connect(g);
          g.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = 880;
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.25, t + 0.02);
          g.gain.setValueAtTime(0.25, t + BEEP_ON - 0.02);
          g.gain.linearRampToValueAtTime(0.001, t + BEEP_ON);
          osc.start(t);
          osc.stop(t + BEEP_ON);
        }

        if (speechText && typeof window !== "undefined" && "speechSynthesis" in window) {
          ttsTimeout = setTimeout(() => {
            if (stopped) return;
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(speechText);
            u.rate = 0.9;
            u.volume = 1;
            window.speechSynthesis.speak(u);
          }, Math.round(TOTAL_BEEP_SECS * 1000) + 50);
        }

        // allow enough time for speech to finish before auto-stopping
        autoStopTimeout = setTimeout(stop, (TOTAL_BEEP_SECS + 4) * 1000);
      } catch {
        // Audio API unavailable or suspended — silent fail
      }
    })();
  }, []);

  useEffect(() => { dataRef.current = data; });

  const [showIntroTooltip, setShowIntroTooltip] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (localStorage.getItem("bell-tooltip-shown") === "1") return;
    const timer = setTimeout(() => {
      setShowIntroTooltip(true);
      const hideTimer = setTimeout(() => {
        setShowIntroTooltip(false);
        localStorage.setItem("bell-tooltip-shown", "1");
      }, 5000);
      return () => clearTimeout(hideTimer);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const handleBellClick = () => {
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

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
      const latestUnread = dataRef.current?.notifications?.find((n) => !n.read);
      playAlarm(latestUnread?.body);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, playAlarm]);

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

  const clearAllMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/notifications/clear-all", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setClearAllOpen(false);
      setOpen(false);
      toast({ title: "Notifications cleared" });
    },
    onError: () => {
      toast({
        title: "Couldn't clear notifications",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const testPushMutation = useMutation({
    mutationFn: () =>
      customFetch<{ success: boolean; sent?: number }>(
        "/api/notifications/test",
        { method: "POST" }
      ),
    onSuccess: () => {
      toast({
        title: "Test notification sent",
        description: "Check your device — a push notification should arrive shortly.",
      });
    },
    onError: (err: unknown) => {
      const serverMessage =
        err instanceof ApiError && (err.data as { error?: string } | null)?.error;
      toast({
        title: "Test failed",
        description: serverMessage || "Could not reach the server. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.read) markReadMutation.mutate(n.id);
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  const handleSeeAll = () => {
    setOpen(false);
    navigate("/notifications");
  };

  if (!isAuthenticated) return null;

  const notifications = data?.notifications ?? [];
  const preview = notifications.slice(0, PREVIEW_LIMIT);
  const hasMore = notifications.length > PREVIEW_LIMIT || (data?.unreadCount ?? 0) > PREVIEW_LIMIT;

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
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">Notifications</span>
              <PushStatusChip
                permission={permission}
                isSubscribed={isSubscribed}
                supported={supported}
              />
            </div>
            <div className="flex items-center gap-1">
              {supported && isSubscribed && permission === "granted" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Send test notification"
                  onClick={() => testPushMutation.mutate()}
                  disabled={testPushMutation.isPending}
                >
                  {testPushMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
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
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Clear all notifications"
                  onClick={() => setClearAllOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
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

          <div className="max-h-[360px] overflow-y-auto">
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
                {preview.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border/30 last:border-0 transition-colors hover:bg-muted/50 active:bg-muted ${
                        n.read ? "bg-background" : "bg-primary/5"
                      } ${n.url ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="text-base mt-0.5 shrink-0">{notificationIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${n.read ? "text-foreground/70" : "text-foreground font-semibold"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground/60">{timeAgo(n.createdAt)}</span>
                          {n.url && (
                            <span className="text-[10px] text-primary/60 flex items-center gap-0.5">
                              <ExternalLink className="h-2.5 w-2.5" />
                              tap to open
                            </span>
                          )}
                        </div>
                      </div>
                      {!n.read && (
                        <span
                          className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2.5">
              <button
                type="button"
                onClick={handleSeeAll}
                className="w-full text-center text-xs text-primary hover:text-primary/80 font-medium flex items-center justify-center gap-1.5 py-0.5"
              >
                <ExternalLink className="h-3 w-3" />
                See all notifications
                {hasMore && (
                  <span className="text-muted-foreground font-normal">
                    ({unreadCount > 0 ? `${unreadCount} unread` : notifications.length + "+"})
                  </span>
                )}
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all {notifications.length} notification{notifications.length === 1 ? "" : "s"} from your tray. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearAllMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                clearAllMutation.mutate();
              }}
              disabled={clearAllMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearAllMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Clear all"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
