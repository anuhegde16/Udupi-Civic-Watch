/**
 * RoleMap — shared Leaflet map component for hierarchy dashboards.
 * Renders scoped ward polygons coloured by group + report pins with role-aware popups.
 * Used by: community-mobiliser, supervisor, health-inspector, env-engineer, commissioner.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { format } from "date-fns";
import geofencesData from "@/data/geofences.json";
import { formatWardLabel } from "@/lib/ward-names";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoleMapReport {
  id: number;
  latitude: number;
  longitude: number;
  status: string;
  wasteTypes?: string[] | null;
  imageUrl?: string | null;
  imageUrls?: { url: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string }[] | null;
  officerName?: string | null;
  officerPhone?: string | null;
  supervisorName?: string | null;
  healthInspectorName?: string | null;
  wardName?: string | null;     // geofence format "Udupi Ward N"
  createdAt?: string | null;
}

export interface WardGroup {
  id: number | string;
  name: string;
  wardGeoNames: string[];   // geofence "Udupi Ward N" format
  openCount: number;
  cleaningCount: number;
  cleanedCount: number;
  totalCount: number;
}

export interface RoleMapProps {
  reports: RoleMapReport[];
  wardGeoNames: string[];
  wardGroups?: WardGroup[];
  showLayerToggle?: boolean;
  title?: string;
  subtitle?: string;
  height?: string;
  /** Supervisor mode: pulse ward outline when ≥ 3 unresolved reports */
  highlightBacklogWards?: boolean;
  /** Called when a user taps a ward polygon — receives the geo name e.g. "Udupi Ward 5" */
  onWardTap?: (wardGeoName: string) => void;
  /** Called when a user opens a report from its map-pin popup. */
  onReportClick?: (report: RoleMapReport) => void;
  /** Highlight one ward and dim all others; also flies the map to that ward's bounds */
  focusedWardGeoName?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_PALETTE = [
  "#6366f1", "#f59e0b", "#10b981", "#ec4899",
  "#0ea5e9", "#f97316", "#8b5cf6", "#14b8a6",
];

const STATUS_COLORS: Record<string, string> = {
  reported: "#ef4444",
  cleaning: "#3b82f6",
  cleaned:  "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  reported: "New",
  cleaning: "In Progress",
  cleaned:  "Cleaned",
};

type LayerKey = "all" | "reported" | "cleaning" | "cleaned";

const LAYER_TABS: { key: LayerKey; label: string; color: string }[] = [
  { key: "all",      label: "All",         color: "#6366f1" },
  { key: "reported", label: "New",         color: "#ef4444" },
  { key: "cleaning", label: "In Progress", color: "#3b82f6" },
  { key: "cleaned",  label: "Cleaned",     color: "#22c55e" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function RoleMap({
  reports,
  wardGeoNames,
  wardGroups,
  showLayerToggle,
  title,
  subtitle,
  height = "320px",
  highlightBacklogWards,
  onWardTap,
  onReportClick,
  focusedWardGeoName,
}: RoleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const fittedRef    = useRef(false);
  const timersRef    = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("all");

  // ── Derived lookup maps (stable across renders) ───────────────────────────
  const wardColorMap = useMemo(() => {
    const m = new Map<string, string>();
    wardGroups?.forEach((grp, i) => {
      const color = GROUP_PALETTE[i % GROUP_PALETTE.length];
      grp.wardGeoNames.forEach(wn => m.set(wn, color));
    });
    return m;
  }, [wardGroups]);

  const groupColorMap = useMemo(() => {
    const m = new Map<number | string, string>();
    wardGroups?.forEach((grp, i) => m.set(grp.id, GROUP_PALETTE[i % GROUP_PALETTE.length]));
    return m;
  }, [wardGroups]);

  const wardGroupResRate = useMemo(() => {
    const m = new Map<string, number>();
    wardGroups?.forEach(grp => {
      const rate = grp.totalCount > 0 ? Math.round((grp.cleanedCount / grp.totalCount) * 100) : 100;
      grp.wardGeoNames.forEach(wn => m.set(wn, rate));
    });
    return m;
  }, [wardGroups]);

  // Per-ward open / reported counts for badges and backlog highlighting
  const wardOpenCount     = useMemo(() => {
    const m = new Map<string, number>();
    reports.forEach(r => {
      if (r.wardName && r.status !== "cleaned")
        m.set(r.wardName, (m.get(r.wardName) ?? 0) + 1);
    });
    return m;
  }, [reports]);

  const wardReportedCount = useMemo(() => {
    const m = new Map<string, number>();
    reports.forEach(r => {
      if (r.wardName && r.status === "reported")
        m.set(r.wardName, (m.get(r.wardName) ?? 0) + 1);
    });
    return m;
  }, [reports]);

  // ── Leaflet init ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Default to a wide Udupi view; fitBounds effect will zoom to wards
      map.setView([13.34, 74.75], 13);
      const t0 = setTimeout(() => { if (mapRef.current) map.invalidateSize(); }, 0);
      const t1 = setTimeout(() => { if (mapRef.current) map.invalidateSize(); }, 300);
      timersRef.current = [t0, t1];
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ── Fit to ward bounds (once, when wards arrive) ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || fittedRef.current || wardGeoNames.length === 0) return;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map) return;
      const feats = geofencesData.features.filter(
        f => f.geometry.type === "Polygon" && wardGeoNames.includes((f.properties as any)?.name)
      );
      if (!feats.length) return;
      const allLats = feats.flatMap(f => (f.geometry.coordinates[0] as [number,number][]).map(([,lat]) => lat));
      const allLngs = feats.flatMap(f => (f.geometry.coordinates[0] as [number,number][]).map(([lng]) => lng));
      map.fitBounds(
        [[Math.min(...allLats), Math.min(...allLngs)], [Math.max(...allLats), Math.max(...allLngs)]],
        { padding: [28, 28] }
      );
      fittedRef.current = true;
    })();
  }, [mapReady, wardGeoNames]);

  // ── Draw layers (re-runs when data or filter changes) ─────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    let rafId: number;

    rafId = requestAnimationFrame(async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map) return;

      // Clear non-tile layers
      map.eachLayer((layer: any) => {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
      });

      const filteredReports = activeLayer === "all"
        ? reports
        : reports.filter(r => r.status === activeLayer);

      // ── Ward polygons ──────────────────────────────────────────────────
      for (const feature of geofencesData.features) {
        if (feature.geometry.type !== "Polygon") continue;
        const props = feature.properties as any;
        const wardName: string = props?.name ?? "";
        if (!wardGeoNames.includes(wardName)) continue;

        const latlngs = (feature.geometry.coordinates[0] as [number,number][]).map(
          ([lon, lat]) => [lat, lon] as [number, number]
        );
        const color      = wardColorMap.get(wardName) ?? "#6366f1";
        const openCnt    = wardOpenCount.get(wardName) ?? 0;
        const reportedCnt = wardReportedCount.get(wardName) ?? 0;
        const isBacklog  = !!highlightBacklogWards && reportedCnt >= 3;
        const resRate    = wardGroupResRate.get(wardName);
        const isLowRes   = resRate !== undefined && resRate < 50 && (wardGroups?.length ?? 0) > 0;

        // Focus mode: highlight the selected ward, dim all others
        const isFocusActive    = focusedWardGeoName !== undefined;
        const isThisWardFocused = isFocusActive && focusedWardGeoName === wardName;
        const isOtherWardFocused = isFocusActive && !isThisWardFocused;

        const polyColor       = isOtherWardFocused ? "#9ca3af"
                              : isBacklog           ? "#ef4444"
                              : isLowRes            ? "#f97316"
                              :                       color;
        const polyFillColor   = isOtherWardFocused ? "#9ca3af" : color;
        const polyFillOpacity = isOtherWardFocused ? 0.03
                              : isThisWardFocused   ? 0.35
                              :                       0.13;
        const polyWeight      = isOtherWardFocused ? 1
                              : isThisWardFocused   ? 2.5
                              : isBacklog           ? 2.5
                              : isLowRes            ? 2
                              :                       1.5;
        const polyDash        = isOtherWardFocused             ? "4 3"
                              : (isBacklog || isLowRes || isThisWardFocused) ? undefined
                              :                                                 "5 3";

        const poly = L.polygon(latlngs, {
          color:       polyColor,
          weight:      polyWeight,
          dashArray:   polyDash,
          fillColor:   polyFillColor,
          fillOpacity: polyFillOpacity,
        });
        if (onWardTap) {
          poly.options.interactive = true;
          poly.on("click", () => onWardTap(wardName));
        }
        poly.addTo(map);

        // Centroid badge
        if (openCnt > 0) {
          const lats = latlngs.map(([lat]) => lat);
          const lngs = latlngs.map(([, lng]) => lng);
          const cLat = lats.reduce((s, v) => s + v, 0) / lats.length;
          const cLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;
          const badgeColor = isBacklog ? "#ef4444" : color;
          const html = `<div style="background:${badgeColor};color:#fff;font-size:9px;font-weight:900;padding:2px 6px;border-radius:99px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;">${openCnt} open</div>`;
          const icon = L.divIcon({ html, className: "", iconAnchor: [22, 8] });
          L.marker([cLat, cLng], { icon, interactive: false }).addTo(map);
        }
      }

      // ── Report pins ────────────────────────────────────────────────────
      for (const r of filteredReports) {
        if (!r.latitude || !r.longitude) continue;
        const color    = STATUS_COLORS[r.status] ?? "#6b7280";
        const isCleaned = r.status === "cleaned";

        const iconHtml = isCleaned
          ? `<div style="width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}50,0 1px 4px rgba(0,0,0,0.2);"></div>`
          : `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
               <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.18;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
               <div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.22);position:relative;"></div>
             </div>`;

        const icon = L.divIcon({
          html: iconHtml,
          className: "role-map-report-marker",
          iconSize:   isCleaned ? [13, 13] : [20, 20],
          iconAnchor: isCleaned ? [6, 6]   : [10, 10],
        });

        // Build popup DOM
        const popup = document.createElement("div");
        popup.style.cssText = "font-family:system-ui,sans-serif;min-width:170px;max-width:230px;padding:4px 0;";

        // Resolve before/after photo arrays
        const beforeUrls: string[] =
          r.imageUrls && r.imageUrls.length > 0
            ? r.imageUrls.map(i => i.url)
            : r.imageUrl ? [r.imageUrl] : [];
        const afterUrls: string[] =
          r.status === "cleaned"
            ? r.cleanupImageUrls && r.cleanupImageUrls.length > 0
              ? r.cleanupImageUrls.map(i => i.url)
              : r.cleanupImageUrl ? [r.cleanupImageUrl] : []
            : [];

        // Helper to build a single thumbnail with optional pill label
        const buildThumb = (
          src: string,
          alt: string,
          pill: string | null,
          wrapStyle: string,
        ): HTMLElement => {
          const wrap = document.createElement("div");
          wrap.style.cssText = wrapStyle;
          const img = document.createElement("img");
          img.src = src;
          img.alt = alt;
          img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
          wrap.appendChild(img);
          if (pill) {
            const tag = document.createElement("span");
            tag.style.cssText =
              "position:absolute;bottom:3px;left:3px;font-size:9px;font-weight:800;" +
              "letter-spacing:0.04em;text-transform:uppercase;color:#fff;" +
              "background:rgba(0,0,0,0.55);padding:1px 5px;border-radius:99px;";
            tag.textContent = pill;
            wrap.appendChild(tag);
          }
          return wrap;
        };

        // Photo section — mirrors the public map layout
        if (beforeUrls.length > 0 || afterUrls.length > 0) {
          const photoSection = document.createElement("div");

          if (beforeUrls.length === 1 && afterUrls.length === 0) {
            // Single complaint photo — full-width
            photoSection.style.cssText =
              "margin:-4px -4px 8px -4px;border-radius:8px 8px 0 0;overflow:hidden;height:110px;";
            photoSection.appendChild(
              buildThumb(beforeUrls[0], "Waste photo", null,
                "width:100%;height:100%;")
            );
          } else if (beforeUrls.length === 1 && afterUrls.length === 1) {
            // Side-by-side before/after
            photoSection.style.cssText = "display:flex;gap:3px;margin:-4px -4px 8px -4px;";
            photoSection.appendChild(
              buildThumb(beforeUrls[0], "Before", "Before",
                "flex:1;position:relative;border-radius:8px 0 0 8px;overflow:hidden;height:110px;")
            );
            photoSection.appendChild(
              buildThumb(afterUrls[0], "After", "After",
                "flex:1;position:relative;border-radius:0 8px 8px 0;overflow:hidden;height:110px;")
            );
          } else {
            // Scrollable strip for multiple photos
            photoSection.style.cssText =
              "display:flex;gap:3px;margin:-4px -4px 8px -4px;" +
              "overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;";
            beforeUrls.forEach((url, i) => {
              photoSection.appendChild(
                buildThumb(url, `Photo ${i + 1}`,
                  afterUrls.length > 0 ? "Before" : null,
                  "flex-shrink:0;width:70px;position:relative;border-radius:6px;overflow:hidden;height:100px;")
              );
            });
            afterUrls.forEach((url, i) => {
              photoSection.appendChild(
                buildThumb(url, `After ${i + 1}`, "After",
                  "flex-shrink:0;width:70px;position:relative;border-radius:6px;overflow:hidden;height:100px;")
              );
            });
          }

          popup.appendChild(photoSection);
        }

        // Status chip
        const chip = document.createElement("span");
        chip.style.cssText = `display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#fff;background:${color};padding:1px 7px;border-radius:99px;margin-bottom:5px;`;
        chip.textContent = STATUS_LABELS[r.status] ?? r.status;
        popup.appendChild(chip);

        // Ward label
        if (r.wardName) {
          const wEl = document.createElement("div");
          wEl.style.cssText = "font-size:10px;font-weight:700;color:#6b7280;margin-bottom:3px;";
          wEl.textContent = formatWardLabel(r.wardName); popup.appendChild(wEl);
        }

        // Waste type tags
        if (r.wasteTypes?.length) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px;";
          r.wasteTypes.slice(0, 3).forEach(wt => {
            const tag = document.createElement("span");
            tag.style.cssText = "background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:1px 5px;border-radius:99px;border:1px solid #fde68a;";
            tag.textContent = wt; row.appendChild(tag);
          });
          popup.appendChild(row);
        }

        // Role-specific context lines
        const lines: string[] = [];
        if (r.officerName) {
          const line = r.officerPhone
            ? `Officer: ${r.officerName} · <a href="tel:${r.officerPhone}" style="color:#2563eb;">${r.officerPhone}</a>`
            : `Officer: ${r.officerName}`;
          lines.push(line);
        }
        if (r.supervisorName) lines.push(`Supervisor: ${r.supervisorName}`);
        if (r.healthInspectorName) lines.push(`HI: ${r.healthInspectorName}`);

        if (lines.length) {
          const ctx = document.createElement("div");
          ctx.style.cssText = "font-size:11px;color:#374151;line-height:1.5;margin-bottom:4px;";
          ctx.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
          popup.appendChild(ctx);
        }

        // Date
        if (r.createdAt) {
          const dateEl = document.createElement("div");
          dateEl.style.cssText = "font-size:10px;color:#9ca3af;margin-top:2px;";
          try { dateEl.textContent = format(new Date(r.createdAt), "MMM d, h:mm a"); }
          catch { dateEl.textContent = r.createdAt; }
          popup.appendChild(dateEl);
        }

        if (onReportClick) {
          const action = document.createElement("button");
          action.type = "button";
          action.dataset.reportId = String(r.id);
          action.dataset.reportStatus = r.status;
          action.style.cssText = "display:block;width:100%;margin-top:9px;padding:7px 10px;border:0;border-radius:7px;background:#0f766e;color:#fff;font-size:11px;font-weight:800;text-align:center;cursor:pointer;";
          action.textContent = "View Report";
          action.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onReportClick(r);
          });
          popup.appendChild(action);
        } else {
          // No sheet callback — render a direct navigation link (e.g. commissioner map)
          const link = document.createElement("a");
          link.href = `/track/${r.id}`;
          link.style.cssText =
            "display:inline-block;margin-top:8px;font-size:12px;font-weight:700;" +
            "color:#0f766e;text-decoration:none;background:#f0fdf4;padding:4px 10px;border-radius:6px;";
          link.textContent = "View Report →";
          popup.appendChild(link);
        }

        L.marker([r.latitude, r.longitude], { icon })
          .bindPopup(popup)
          .addTo(map);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [reports, wardGeoNames, wardGroups, mapReady, activeLayer,
      wardColorMap, wardGroupResRate, wardOpenCount, wardReportedCount, highlightBacklogWards, onWardTap,
       onReportClick, focusedWardGeoName]);

  // ── Fly to focused ward ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !focusedWardGeoName) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (!map) return;
      const feat = geofencesData.features.find(
        f => f.geometry.type === "Polygon" && (f.properties as any)?.name === focusedWardGeoName
      );
      if (!feat) return;
      const coords = feat.geometry.coordinates[0] as [number, number][];
      const lats = coords.map(([, lat]) => lat);
      const lngs = coords.map(([lng]) => lng);
      map.flyToBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [20, 20], duration: 0.5 }
      );
    })();
  }, [mapReady, focusedWardGeoName]);

  // ── Render ────────────────────────────────────────────────────────────────
  const showLegend = wardGroups && wardGroups.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-border/50 shadow-sm bg-card">
      {/* Header row */}
      {(title || showLayerToggle) && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/50 bg-card flex-wrap">
          {title && (
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          {showLayerToggle && (
            <div className="flex gap-1 flex-wrap">
              {LAYER_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveLayer(tab.key)}
                  className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                  style={
                    activeLayer === tab.key
                      ? { background: tab.color, color: "#fff" }
                      : { background: "var(--muted)", color: "var(--muted-foreground)" }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Map canvas */}
      <div ref={containerRef} style={{ height }} className="w-full z-0" />

      {/* Group legend */}
      {showLegend && (
        <div className="px-4 py-3 border-t border-border/50 bg-muted/30">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Teams</p>
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
            {wardGroups!.map(grp => {
              const color   = groupColorMap.get(grp.id) ?? "#6366f1";
              const rate    = grp.totalCount > 0 ? Math.round((grp.cleanedCount / grp.totalCount) * 100) : 0;
              const isLow   = grp.totalCount > 0 && rate < 50;
              const barFill = Math.round(((grp.cleanedCount + grp.cleaningCount) / Math.max(grp.totalCount, 1)) * 100);
              return (
                <div key={grp.id} className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-semibold text-foreground flex-1 truncate min-w-0">{grp.name}</span>
                  <span className="text-xs text-destructive font-bold shrink-0">{grp.openCount} new</span>
                  <span className={`text-xs font-bold shrink-0 ${isLow ? "text-orange-500" : "text-emerald-600"}`}>
                    {rate}%
                  </span>
                  {/* mini resolution bar */}
                  <div className="w-10 h-1.5 rounded-full bg-border shrink-0 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barFill}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status legend dots */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 bg-card/80">
        {[
          { color: "#ef4444", label: "New",         pulse: true  },
          { color: "#3b82f6", label: "In Progress",  pulse: true  },
          { color: "#22c55e", label: "Cleaned",      pulse: false },
        ].map(({ color, label, pulse }) => (
          <div key={label} className="flex items-center gap-1.5">
            {pulse ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
              </span>
            ) : (
              <span className="inline-flex rounded-full h-2 w-2" style={{ background: color }} />
            )}
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {reports.length} report{reports.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
