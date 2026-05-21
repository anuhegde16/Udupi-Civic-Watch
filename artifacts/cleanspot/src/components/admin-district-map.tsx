import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [13.3409, 74.7421],
        zoom: 10,
        zoomControl: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
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

  // Fly to selected zone (or zoom out to all zones) whenever selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    async function focusZone() {
      const L = (await import("leaflet")).default;

      // Compute bounding box from center + radius without adding to map
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
      } else {
        // Fit all zones that have geo data
        let combined: ReturnType<typeof L.latLngBounds> | null = null;
        officers.forEach((o) => {
          if (o.centerLat && o.centerLng && o.radiusKm) {
            const b = circleBounds(o.centerLat, o.centerLng, o.radiusKm);
            combined = combined ? combined.extend(b) : b;
          }
        });
        if (combined) {
          map.flyToBounds(combined, { padding: [30, 30], duration: 0.7 });
        }
      }
    }

    // Defer slightly so drawLayers' rAF doesn't race with flyTo
    const t = setTimeout(focusZone, 80);
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
          if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
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

  return (
    <div ref={containerRef} className="z-0 h-[220px] md:h-[340px] w-full" />
  );
}
