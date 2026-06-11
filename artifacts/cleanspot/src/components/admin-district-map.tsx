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
  cleaning: "#f59e0b",
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
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      centroid: [centroidLat, centroidLon],
    };
  });

const geoZones: GeoZone[] = allGeoFeatures;

export type MapReport = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  assignedOfficerId?: number | null;
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
}

export function AdminDistrictMap({
  reports,
  officers,
  selectedOfficerId,
  onZoneSelect,
  activePanchayat,
  panchayatOptions,
  onPanchayatChange,
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

      const initialBounds: [[number, number], [number, number]] =
        geoZones[0]?.bounds ?? [[13.46988, 74.6863], [13.52115, 74.73806]];

      const map = L.map(containerRef.current, {
        zoomControl: false,
      });
      mapRef.current = map;

      map.fitBounds(initialBounds, { padding: [24, 24] });
      setTimeout(() => map.invalidateSize(), 0);
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(initialBounds, { padding: [24, 24] });
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

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    function focusGeoZone() {
      if (activeZone === null) {
        map.flyToBounds(DISTRICT_BOUNDS, { padding: [20, 20], duration: 0.7 });
      } else {
        const zone = geoZones.find((z) => z.name === activeZone);
        if (zone) {
          map.flyToBounds(zone.bounds, { padding: [32, 32], duration: 0.7 });
        }
      }
    }

    const t = setTimeout(focusGeoZone, 60);
    return () => clearTimeout(t);
  }, [activeZone]);

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
    let scheduled = false;

    function drawLayers() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(async () => {
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

        allGeoFeatures.forEach((zone, zoneIdx) => {
          if (zone.featureType === "district") {
            // Outer Saligrama boundary — thick solid teal, no fill, clearly frames the wards
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

          // Ward polygon — amber interior lines, clearly inside the teal frame
          const assignedOfficer = officers.find((o) => o.areaName === zone.name);
          const wardColor = assignedOfficer
            ? ZONE_PALETTE[
                officers.indexOf(assignedOfficer) % ZONE_PALETTE.length
              ]
            : WARD_AMBER;
          const isSelected = assignedOfficer
            ? selectedOfficerId === assignedOfficer.id
            : false;

          const poly = L.polygon(zone.latlngs, {
            color: wardColor,
            weight: isSelected ? 2.5 : 1,
            dashArray: isSelected ? undefined : "4 3",
            fillColor: wardColor,
            fillOpacity: isSelected ? 0.18 : 0.06,
          }).addTo(map);

          // Ward number label in amber when unassigned, officer name when assigned
          const wardNum = zone.name.replace("Ward ", "");
          const labelHtml = assignedOfficer
            ? `<div style="background:${wardColor};color:#fff;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);cursor:pointer;opacity:${isSelected ? "1" : "0.85"};">${assignedOfficer.name}</div>`
            : `<div style="color:${WARD_AMBER};font-size:10px;font-weight:800;opacity:0.75;pointer-events:none;">${wardNum}</div>`;

          const icon = L.divIcon({ html: labelHtml, className: "", iconAnchor: [0, 8] });
          L.marker(zone.centroid, { icon, interactive: false }).addTo(map);

          poly.bindTooltip(
            assignedOfficer ? `${zone.name} — ${assignedOfficer.name}` : zone.name,
            { permanent: false, direction: "center", className: "zone-label" }
          );

          if (assignedOfficer) {
            poly.on("click", () => {
              onZoneSelect(selectedOfficerId === assignedOfficer.id ? null : assignedOfficer.id);
            });
            poly.on("mouseover", () => poly.setStyle({ fillOpacity: 0.22 }));
            poly.on("mouseout", () =>
              poly.setStyle({ fillOpacity: isSelected ? 0.18 : 0.07 })
            );
          }
        });

        reports.forEach((report) => {
          const color = STATUS_COLORS[report.status] || "#6b7280";
          const dimmed =
            selectedOfficerId !== null &&
            report.assignedOfficerId !== selectedOfficerId;

          const marker = L.circleMarker([report.latitude, report.longitude], {
            radius: 6,
            fillColor: color,
            color: "#fff",
            weight: 1.5,
            fillOpacity: dimmed ? 0.2 : 0.88,
            opacity: dimmed ? 0.35 : 1,
          });

          const popup = document.createElement("div");
          popup.style.cssText = "min-width:170px;padding:4px 0;";

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
  }, [reports, officers, selectedOfficerId, onZoneSelect, mapReady]);

  const chipBase =
    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer";
  const chipActive = "bg-primary text-primary-foreground border-primary shadow-sm";
  const chipInactive =
    "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-primary/5";

  const visibleWards = allGeoFeatures
    .filter((zone) => zone.featureType === "ward")
    .filter((zone) => {
      if (!activePanchayat) return true;
      const officer = officers.find((o) => o.areaName === zone.name);
      return officer?.panchayatName === activePanchayat;
    });

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
              onClick={() => onPanchayatChange(null)}
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

        {/* Ward chips row (scoped to panchayat) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {activePanchayat ? `${activePanchayat} wards` : "Service area"}
            </span>
          </div>
          <button
            onClick={() => setActiveZone(null)}
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
          {visibleWards.map((zone) => {
            const assignedOfficer = officers.find((o) => o.areaName === zone.name);
            const color = assignedOfficer
              ? ZONE_PALETTE[officers.indexOf(assignedOfficer) % ZONE_PALETTE.length]
              : "#f59e0b";
            return (
              <button
                key={zone.name}
                onClick={() => setActiveZone(zone.name)}
                className={`${chipBase} ${activeZone === zone.name ? chipActive : chipInactive}`}
                style={
                  activeZone === zone.name
                    ? { background: color, borderColor: color }
                    : { borderColor: color, color }
                }
              >
                <MapPin className="w-3 h-3 shrink-0" />
                {zone.name}
                {assignedOfficer && (
                  <span className="opacity-70 font-medium">· {assignedOfficer.name}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div
        ref={containerRef}
        className="z-0 h-[220px] md:h-[340px] w-full rounded-xl overflow-hidden"
      />
    </div>
  );
}
