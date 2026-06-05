import { useEffect, useRef, useState } from "react";
import { MapPin, Globe } from "lucide-react";
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
}

const geoZones: GeoZone[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon")
  .map((f) => {
    const coords = f.geometry.coordinates[0] as [number, number][];
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    return {
      name: (f.properties as any)?.name ?? "Zone",
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
    };
  });

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
  radiusKm?: number | null;
};

interface AdminDistrictMapProps {
  reports: MapReport[];
  officers: MapOfficer[];
  selectedOfficerId: number | null;
  onZoneSelect: (id: number | null) => void;
}

export function AdminDistrictMap({
  reports,
  officers,
  selectedOfficerId,
  onZoneSelect,
}: AdminDistrictMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [activeZone, setActiveZone] = useState<string | null>(
    geoZones[0]?.name ?? null
  );

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
      map.fitBounds(initialBounds, { padding: [24, 24] });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      for (const zone of geoZones) {
        const poly = L.polygon(zone.latlngs, {
          color: "#0e6b7c",
          weight: 2,
          dashArray: "7 5",
          fillColor: "#0e6b7c",
          fillOpacity: 0.07,
        }).addTo(map);
        poly.bindTooltip(zone.name, {
          permanent: false,
          direction: "center",
          className: "zone-label",
        });
      }
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
    if (!mapRef.current) return;
    const map = mapRef.current;

    async function focusGeoZone() {
      if (activeZone === null) {
        const L = (await import("leaflet")).default;
        let combined: ReturnType<typeof L.latLngBounds> | null = null;
        for (const zone of geoZones) {
          const b = L.latLngBounds(zone.bounds[0], zone.bounds[1]);
          combined = combined ? combined.extend(b) : b;
        }
        if (combined) {
          map.flyToBounds(combined, { padding: [30, 30], duration: 0.7 });
        }
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
      const L = (await import("leaflet")).default;

      function circleBounds(lat: number, lng: number, radiusKm: number) {
        const dLat = radiusKm / 111.32;
        const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        return L.latLngBounds(
          [lat - dLat, lng - dLng],
          [lat + dLat, lng + dLng]
        );
      }

      if (selectedOfficerId !== null) {
        const officer = officers.find((o) => o.id === selectedOfficerId);
        if (officer?.centerLat && officer?.centerLng && officer?.radiusKm) {
          map.flyToBounds(
            circleBounds(officer.centerLat, officer.centerLng, officer.radiusKm),
            { padding: [40, 40], duration: 0.7 }
          );
        }
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
          if (!(layer instanceof L.TileLayer) && !(layer instanceof L.Polygon)) {
            map.removeLayer(layer);
          }
        });

        officers.forEach((officer, idx) => {
          if (!officer.centerLat || !officer.centerLng || !officer.radiusKm) return;
          const color = ZONE_PALETTE[idx % ZONE_PALETTE.length];
          const isSelected = selectedOfficerId === officer.id;

          const circle = L.circle([officer.centerLat, officer.centerLng], {
            radius: officer.radiusKm * 1000,
            color,
            fillColor: color,
            fillOpacity: isSelected ? 0.18 : 0.07,
            weight: isSelected ? 2.5 : 1.5,
            dashArray: isSelected ? undefined : "6 4",
          }).addTo(map);

          const wrapper = document.createElement("div");
          wrapper.style.cssText = `
            background:${color};color:#fff;
            padding:2px 8px;border-radius:20px;
            font-size:11px;font-weight:700;
            white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,0.25);
            cursor:pointer;
            opacity:${isSelected ? "1" : "0.85"};
          `;
          wrapper.textContent = officer.areaName || officer.name;

          const icon = L.divIcon({ html: wrapper, className: "", iconAnchor: [0, 8] });
          L.marker([officer.centerLat, officer.centerLng], { icon, interactive: false }).addTo(map);

          circle.on("click", () => {
            onZoneSelect(selectedOfficerId === officer.id ? null : officer.id);
          });
          circle.on("mouseover", () => circle.setStyle({ fillOpacity: 0.22 }));
          circle.on("mouseout", () =>
            circle.setStyle({ fillOpacity: isSelected ? 0.18 : 0.07 })
          );
        });

        reports.forEach((report) => {
          const color = STATUS_COLORS[report.status] || "#6b7280";
          const dimmed = selectedOfficerId !== null && report.assignedOfficerId !== selectedOfficerId;

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
            report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
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
  }, [reports, officers, selectedOfficerId, onZoneSelect]);

  const chipBase =
    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer";
  const chipActive =
    "bg-primary text-primary-foreground border-primary shadow-sm";
  const chipInactive =
    "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-primary/5";

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3 px-1">
        <div className="flex items-center gap-1.5 mr-1">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Service area
          </span>
        </div>
        <button
          onClick={() => setActiveZone(null)}
          className={`${chipBase} ${activeZone === null ? chipActive : chipInactive}`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          All areas
        </button>
        {geoZones.map((zone) => (
          <button
            key={zone.name}
            onClick={() => setActiveZone(zone.name)}
            className={`${chipBase} ${activeZone === zone.name ? chipActive : chipInactive}`}
          >
            <MapPin className="w-3 h-3 shrink-0" />
            {zone.name}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="z-0 h-[220px] md:h-[340px] w-full rounded-xl overflow-hidden" />
    </div>
  );
}
