import { useEffect, useRef, useState } from "react";
import { MapPin, Globe, Building2 } from "lucide-react";
import geofencesData from "@/data/geofences.json";

const ZONE_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
];

const STATUS_COLORS: Record<string, string> = {
  reported: "#ef4444",
  cleaning: "#3b82f6",
  cleaned: "#22c55e",
};

interface GeoZone {
  name: string;
  bounds: [[number, number], [number, number]];
  latlngs: [number, number][];
  centroid: [number, number];
}

const DISTRICT_BOUNDS: [[number, number], [number, number]] = [
  [13.1, 74.55],
  [13.95, 74.95],
];

interface GeoFeatureMeta extends GeoZone {
  featureType: "district" | "ward";
  panchayat?: string;
}

const allGeoFeatures: GeoFeatureMeta[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon")
  .map((f) => {
    const coords = f.geometry.coordinates[0] as [number, number][];
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    const centroidLat = lats.reduce((s, v) => s + v, 0) / lats.length;
    const centroidLon = lons.reduce((s, v) => s + v, 0) / lons.length;
    return {
      name: (f.properties as any)?.name ?? "Zone",
      featureType: ((f.properties as any)?.type === "ward" ? "ward" : "district") as "district" | "ward",
      panchayat: (f.properties as any)?.panchayat as string | undefined,
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      centroid: [centroidLat, centroidLon],
    };
  });

const geoZones: GeoZone[] = allGeoFeatures;

// Bounding box that fits ALL district polygons — used for the "All Panchayats" view.
const allDistrictsBounds: [[number, number], [number, number]] = (() => {
  const districts = allGeoFeatures.filter((f) => f.featureType === "district");
  if (districts.length === 0) return DISTRICT_BOUNDS;
  const allLats = districts.flatMap((d) => [d.bounds[0][0], d.bounds[1][0]]);
  const allLngs = districts.flatMap((d) => [d.bounds[0][1], d.bounds[1][1]]);
  return [
    [Math.min(...allLats), Math.min(...allLngs)],
    [Math.max(...allLats), Math.max(...allLngs)],
  ];
})();

export type MapReport = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  assignedOfficerId?: number | null;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
};

export type MapOfficer = {
  id: number;
  name: string;
  areaName?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  panchayatName?: string | null;
};

interface AdminDistrictMapProps {
  reports: MapReport[];
  officers: MapOfficer[];
  selectedOfficerId: number | null;
  onZoneSelect: (id: number | null) => void;
  activePanchayat: string | null;
  panchayatOptions: string[];
  onPanchayatChange: (name: string | null) => void;
  onWardSelect: (wardName: string | null) => void;
}

export function AdminDistrictMap({
  reports,
  officers,
  selectedOfficerId,
  onZoneSelect,
  activePanchayat,
  panchayatOptions,
  onPanchayatChange,
  onWardSelect,
}: AdminDistrictMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [activeZone, setActiveZone] = useState<string | null>(
    geoZones[0]?.name ?? null
  );
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
      });
      mapRef.current = map;

      // Start showing all service areas so users see that the app covers
      // multiple municipalities from the very first render.
      map.fitBounds(allDistrictsBounds, { padding: [24, 24] });
      setTimeout(() => map.invalidateSize(), 0);
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(allDistrictsBounds, { padding: [24, 24] });
      }, 300);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      setMapReady(true);
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setActiveZone(null);
  }, [activePanchayat]);

  // Single camera effect — priority: ward > panchayat > all districts.
  // Keeping this as one effect (rather than two) avoids races where both fire
  // at the same tick and the second call overrides the first.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    const t = setTimeout(() => {
      if (activeZone !== null) {
        // A specific ward is selected — zoom to it
        const zone = geoZones.find((z) => z.name === activeZone);
        if (zone) {
          map.flyToBounds(zone.bounds, { padding: [32, 32], duration: 0.7 });
        }
      } else if (activePanchayat !== null) {
        // A panchayat is selected but no ward — zoom to that district
        const districtZone = allGeoFeatures.find(
          (z) => z.featureType === "district" && z.panchayat === activePanchayat
        );
        if (districtZone) {
          map.flyToBounds(districtZone.bounds, { padding: [32, 32], duration: 0.7 });
        }
      } else {
        // All Panchayats / no selection — show every service area
        map.flyToBounds(allDistrictsBounds, { padding: [24, 24], duration: 0.7 });
      }
    }, 60);

    return () => clearTimeout(t);
  }, [activeZone, activePanchayat, mapReady]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    async function focusOfficerZone() {
      if (selectedOfficerId === null) return;
      const officer = officers.find((o) => o.id === selectedOfficerId);
      if (!officer) return;

      const zone = geoZones.find((z) => z.name === officer.areaName);
      if (zone) {
        map.flyToBounds(zone.bounds, { padding: [40, 40], duration: 0.7 });
        return;
      }

      if (officer.centerLat && officer.centerLng) {
        const L = (await import("leaflet")).default;
        map.flyToBounds(
          L.latLngBounds(
            [officer.centerLat - 0.01, officer.centerLng - 0.01],
            [officer.centerLat + 0.01, officer.centerLng + 0.01]
          ),
          { padding: [40, 40], duration: 0.7 }
        );
      }
    }

    const t = setTimeout(focusOfficerZone, 80);
    return () => clearTimeout(t);
  }, [selectedOfficerId, officers]);

  useEffect(() => {
    if (!mapRef.current) return;
    let rafId: number | undefined;

    function drawLayers() {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(async () => {
        if (!mapRef.current) return;
        const L = (await import("leaflet")).default;
        const map = mapRef.current;

        map.eachLayer((layer: any) => {
          if (!(layer instanceof L.TileLayer)) {
            map.removeLayer(layer);
          }
        });

        // Draw district boundary (teal) first, then ward polygons (amber), then officer markers
        const WARD_AMBER = "#f59e0b";

        allGeoFeatures.forEach((zone) => {
          if (zone.featureType === "district") {
            L.polygon(zone.latlngs, {
              color: "#0d9488",
              weight: 3.5,
              dashArray: undefined,
              fillColor: "#0d9488",
              fillOpacity: 0,
              interactive: false,
            }).addTo(map);
            return;
          }

          const assignedOfficer = officers.find((o) => o.areaName === zone.name);
          const wardColor = assignedOfficer
            ? ZONE_PALETTE[
                officers.indexOf(assignedOfficer) % ZONE_PALETTE.length
              ]
            : WARD_AMBER;

          // A ward is highlighted if its chip is active OR its officer is selected
          const isSelected =
            zone.name === activeZone ||
            (assignedOfficer ? selectedOfficerId === assignedOfficer.id : false);

          // Use the ward's own panchayat from geofences.json — no need to guess
          // from officer assignment any more.
          const isInActivePanchayat =
            !activePanchayat ||
            zone.panchayat === activePanchayat;

          const poly = L.polygon(zone.latlngs, {
            color: isInActivePanchayat ? wardColor : "#d1d5db",
            weight: isSelected ? 3 : (isInActivePanchayat ? 1.25 : 0.5),
            dashArray: isSelected ? undefined : (isInActivePanchayat ? "4 3" : "3 8"),
            fillOpacity: 0,
            interactive: isInActivePanchayat,
          }).addTo(map);

          if (isInActivePanchayat) {
            const wardNum = zone.name.replace(/\D+/g, "");
            const labelColor = assignedOfficer ? wardColor : WARD_AMBER;
            // Plain text only — no background, border, or chip of any kind.
            const labelHtml = `<div style="color:${labelColor};font-size:11px;font-weight:800;line-height:1.3;white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9);pointer-events:none;opacity:${isSelected ? "1" : "0.85"};">${wardNum}</div>`;
            const icon = L.divIcon({ html: labelHtml, className: "", iconAnchor: [0, 8] });
            L.marker(zone.centroid, { icon, interactive: false }).addTo(map);
          }

          poly.bindTooltip(
            assignedOfficer ? `${zone.name} — ${assignedOfficer.name}` : zone.name,
            { permanent: false, direction: "center", className: "zone-label" }
          );

          if (isInActivePanchayat) {
            poly.on("click", () => {
              const alreadyActive = zone.name === activeZone;
              if (alreadyActive) {
                setActiveZone(null);
                onZoneSelect(null);
                onWardSelect(null);
              } else {
                setActiveZone(zone.name);
                onZoneSelect(assignedOfficer ? assignedOfficer.id : null);
                onWardSelect(zone.name);
              }
            });
            poly.on("mouseover", () => poly.setStyle({ weight: isSelected ? 3 : 2 }));
            poly.on("mouseout", () =>
              poly.setStyle({ weight: isSelected ? 3 : 1.25 })
            );
          }
        });

        reports.forEach((report) => {
          const color = STATUS_COLORS[report.status] || "#6b7280";
          const dimmed =
            selectedOfficerId !== null &&
            report.assignedOfficerId !== selectedOfficerId;

          const isCleaned = report.status === "cleaned";
          const iconHtml = isCleaned
            ? `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 2px ${color}40,0 2px 6px rgba(0,0,0,0.18);opacity:${dimmed ? 0.35 : 1};"></div>`
            : `<div class="pulse-marker" style="--pulse-color: ${color}; opacity:${dimmed ? 0.35 : 1}; width:28px; height:28px;">
                 <div class="pulse-ring pulse-ring-1" style="width:18px;height:18px;"></div>
                 <div class="pulse-ring pulse-ring-2" style="width:26px;height:26px;"></div>
                 <div class="pulse-core" style="width:10px;height:10px;"></div>
               </div>`;

          const icon = L.divIcon({
            html: iconHtml,
            className: "",
            iconSize: isCleaned ? [16, 16] : [28, 28],
            iconAnchor: isCleaned ? [8, 8] : [14, 14],
          });

          const marker = L.marker([report.latitude, report.longitude], { icon });

          const popup = document.createElement("div");
          popup.style.cssText = "min-width:170px;padding:4px 0;";

          const beforeUrl =
            (report.imageUrls && report.imageUrls[0]?.url) || report.imageUrl || null;
          const afterUrl =
            report.status === "cleaned"
              ? (report.cleanupImageUrls && report.cleanupImageUrls[0]?.url) || report.cleanupImageUrl || null
              : null;

          if (beforeUrl) {
            const imgRow = document.createElement("div");
            imgRow.style.cssText = afterUrl
              ? "display:flex;gap:3px;margin:-4px -4px 8px -4px;"
              : "margin:-4px -4px 8px -4px;border-radius:8px 8px 0 0;overflow:hidden;height:100px;";

            const buildThumb = (src: string, label: string, side: "left" | "right" | "full") => {
              const wrap = document.createElement("div");
              const radius = side === "left" ? "8px 0 0 0" : side === "right" ? "0 8px 0 0" : "8px 8px 0 0";
              wrap.style.cssText = `flex:1;position:relative;border-radius:${radius};overflow:hidden;height:100px;`;
              const img = document.createElement("img");
              img.src = src;
              img.alt = label;
              img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
              wrap.appendChild(img);
              const tag = document.createElement("span");
              tag.style.cssText =
                "position:absolute;bottom:2px;left:2px;font-size:8px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,0.55);padding:1px 4px;border-radius:99px;";
              tag.textContent = label;
              wrap.appendChild(tag);
              return wrap;
            };

            if (afterUrl) {
              imgRow.appendChild(buildThumb(beforeUrl, "Before", "left"));
              imgRow.appendChild(buildThumb(afterUrl, "After", "right"));
            } else {
              imgRow.appendChild(buildThumb(beforeUrl, "Photo", "full"));
            }
            popup.appendChild(imgRow);
          }

          const statusSpan = document.createElement("span");
          statusSpan.style.cssText = `
            display:inline-block;font-size:10px;font-weight:800;
            text-transform:uppercase;letter-spacing:.06em;
            color:#fff;background:${color};
            padding:1px 7px;border-radius:99px;margin-bottom:5px;
          `;
          statusSpan.textContent =
            report.status === "reported"
              ? "New"
              : report.status === "cleaning"
              ? "In Progress"
              : "Cleaned";
          popup.appendChild(statusSpan);

          const addrEl = document.createElement("div");
          addrEl.style.cssText =
            "font-size:12px;font-weight:600;color:#111827;margin-bottom:6px;line-height:1.4;max-width:220px;white-space:normal;";
          addrEl.textContent =
            report.address ||
            `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
          popup.appendChild(addrEl);

          const link = document.createElement("a");
          const safeId = Number(report.id);
          if (Number.isInteger(safeId) && safeId > 0) {
            link.href = `/admin/reports`;
            link.style.cssText =
              "font-size:11px;font-weight:700;color:#2563eb;text-decoration:none;";
            link.textContent = "See all reports →";
            popup.appendChild(link);
          }

          marker.bindPopup(popup).addTo(map);
        });
      });
    }

    drawLayers();
    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [reports, officers, selectedOfficerId, onZoneSelect, mapReady, activePanchayat, activeZone]);

  const chipBase =
    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer";
  const chipActive = "bg-primary text-primary-foreground border-primary shadow-sm";
  const chipInactive =
    "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-primary/5";

  const visibleWards = allGeoFeatures.filter(
    (zone) => zone.featureType === "ward" && (!activePanchayat || zone.panchayat === activePanchayat)
  );

  return (
    <div>
      <div className="flex flex-col gap-2 mb-3 px-1">
        {/* Panchayat selector row */}
        {panchayatOptions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 mr-1">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Panchayat
              </span>
            </div>
            <button
              onClick={() => { onPanchayatChange(null); setActiveZone(null); }}
              className={`${chipBase} ${activePanchayat === null ? chipActive : chipInactive}`}
            >
              All Panchayats
            </button>
            {panchayatOptions.map((p) => (
              <button
                key={p}
                onClick={() => onPanchayatChange(activePanchayat === p ? null : p)}
                className={`${chipBase} ${activePanchayat === p ? chipActive : chipInactive}`}
              >
                <Building2 className="w-3 h-3 shrink-0" />
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Service area / Ward chips row — drills down from panchayat → wards */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {activePanchayat ? "Wards" : "Service area"}
            </span>
          </div>
          <button
            onClick={() => { setActiveZone(null); onZoneSelect(null); onWardSelect(null); }}
            className={`${chipBase} ${activeZone === null ? chipActive : chipInactive}`}
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            All areas
          </button>

          {activePanchayat === null
            ? /* No panchayat selected: show panchayat chips as drill-in targets */
              panchayatOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => onPanchayatChange(p)}
                  className={`${chipBase} ${chipInactive}`}
                >
                  <Building2 className="w-3 h-3 shrink-0" />
                  {p}
                </button>
              ))
            : /* Panchayat selected: show ward chips scoped to that panchayat */
              visibleWards.map((zone) => {
                const assignedOfficer = officers.find((o) => o.areaName === zone.name);
                const color = assignedOfficer
                  ? ZONE_PALETTE[officers.indexOf(assignedOfficer) % ZONE_PALETTE.length]
                  : "#f59e0b";
                return (
                  <button
                    key={zone.name}
                    onClick={() => {
                      setActiveZone(zone.name);
                      onZoneSelect(assignedOfficer ? assignedOfficer.id : null);
                      onWardSelect(zone.name);
                    }}
                    className={`${chipBase} ${activeZone === zone.name ? chipActive : chipInactive}`}
                    style={
                      activeZone === zone.name
                        ? { background: color, borderColor: color }
                        : { borderColor: color, color }
                    }
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    {zone.name}
                  </button>
                );
              })
          }
        </div>
      </div>
      <div
        ref={containerRef}
        className="z-0 h-[220px] md:h-[340px] w-full rounded-xl overflow-hidden"
      />
    </div>
  );
}
