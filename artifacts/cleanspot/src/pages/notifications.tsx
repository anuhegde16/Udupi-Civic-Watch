import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Bell, BellRing, Check, ChevronLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function groupByDay(notifications: NotificationItem[]): Array<{ label: string; items: NotificationItem[] }> {
  const map = new Map<string, NotificationItem[]>();
  for (const n of notifications) {
    const d = new Date(n.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    let label: string;
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else label = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(n);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function notificationIcon(type: string): string {
  if (type === "new_report") return "🗑️";
  if (type === "status_cleaning") return "🧹";
  if (type === "status_cleaned") return "✅";
  return "🔔";
}

function notificationTypeLabel(type: string): string {
  if (type === "new_report") return "New report";
  if (type === "status_cleaning") return "Cleaning started";
  if (type === "status_cleaned") return "Cleaned";
  if (type === "test") return "Test";
  return "Notification";
}

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["notifications", limit],
    queryFn: () => customFetch<NotificationsResponse>(`/api/notifications?limit=${limit}`),
    refetchInterval: 60000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.read) markReadMutation.mutate(n.id);
    if (n.url) navigate(n.url);
  };

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const groups = groupByDay(notifications);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(-1 as unknown as string)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base text-foreground flex items-center gap-2">
            {unreadCount > 0 ? (
              <BellRing className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            Notifications
            {unreadCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold">
                {unreadCount}
              </span>
            )}
          </h1>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0 gap-1.5"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <Check className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-w-2xl mx-auto pb-8">
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground/30 animate-pulse" />
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="font-medium text-sm">No notifications yet</p>
            <p className="text-xs mt-1 text-muted-foreground/60">You'll see new report assignments and status updates here.</p>
          </div>
        ) : (
          <>
            {groups.map(({ label, items }) => (
              <div key={label}>
                <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                </div>
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-4 border-b border-border/20 transition-colors hover:bg-muted/40 active:bg-muted/60 ${
                          n.read ? "bg-background" : "bg-primary/5"
                        }`}
                      >
                        <span className="text-xl mt-0.5 shrink-0">{notificationIcon(n.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm leading-snug ${n.read ? "text-foreground/70" : "text-foreground font-semibold"}`}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[11px] text-muted-foreground/60">{formatDate(n.createdAt)}</span>
                            <span className="text-[11px] text-muted-foreground/40 bg-muted/60 px-1.5 py-0.5 rounded">
                              {notificationTypeLabel(n.type)}
                            </span>
                            {n.url && (
                              <span className="text-[11px] text-primary/70 flex items-center gap-1 font-medium">
                                <ExternalLink className="h-3 w-3" />
                                Open
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {notifications.length >= limit && (
              <div className="py-6 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((l) => l + 50)}
                  className="text-xs"
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
