import { useEffect, useRef } from "react";
import type { Report } from "@workspace/api-client-react";
import geofencesData from "@/data/geofences.json";

interface OfficerZoneMapProps {
  reports: Report[];
  areaName: string;
  highlightId?: number | null;
}

export function OfficerZoneMap({
  reports,
  areaName,
  highlightId,
}: OfficerZoneMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const boundsRef = useRef<any>(null);

  useEffect(() => {
    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Draw ward + district boundaries from geofences; highlight the officer's own ward
      let officerWard: any = null;
      let districtBounds: any = null;
      for (const feature of geofencesData.features) {
        if (feature.geometry.type !== "Polygon") continue;
        const props = feature.properties as any;
        const latlngs = (feature.geometry.coordinates[0] as [number, number][]).map(
          ([lon, lat]) => [lat, lon] as [number, number]
        );
        if (props?.type === "district") {
          // District = thick solid teal frame
          const poly = L.polygon(latlngs, {
            color: "#0d9488",
            weight: 3.5,
            fillColor: "#0d9488",
            fillOpacity: 0,
          }).addTo(map);
          districtBounds = poly.getBounds();
        } else if (props?.type === "ward") {
          const isMine = props?.name === areaName;
          const poly = L.polygon(latlngs, {
            color: "#f59e0b",
            weight: isMine ? 2.5 : 1,
            dashArray: isMine ? undefined : "4 3",
            fillColor: "#f59e0b",
            fillOpacity: isMine ? 0.15 : 0.04,
          }).addTo(map);
          poly.bindTooltip(props?.name ?? "Ward", {
            direction: "center",
            className: "zone-label",
          });
          if (isMine) officerWard = poly;
        }
      }

      // Fit to the officer's own ward if found, else fall back to the district
      if (officerWard) {
        boundsRef.current = officerWard.getBounds();
        map.fitBounds(boundsRef.current, { padding: [20, 20] });
      } else if (districtBounds) {
        boundsRef.current = districtBounds;
        map.fitBounds(boundsRef.current, { padding: [20, 20] });
      }

      leafletMapRef.current = map;
      placeMarkers(L, map, reports, highlightId ?? null);
    }

    init();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leafletMapRef.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      placeMarkers(L, leafletMapRef.current, reports, highlightId ?? null);
    })();
  }, [reports, highlightId]);

  function placeMarkers(L: any, map: any, data: Report[], highlight: number | null) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    data.forEach((r) => {
      const color =
        r.status === "reported"
          ? "#ef4444"
          : r.status === "cleaning"
          ? "#f97316"
          : "#22c55e";
      const label =
        r.status === "reported"
          ? "New"
          : r.status === "cleaning"
          ? "In Progress"
          : "Cleaned";

      const isHighlighted = highlight === r.id;
      const size = isHighlighted ? 20 : 14;

      const iconHtml =
        r.status === "cleaned"
          ? `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 2px ${color}60,0 2px 6px rgba(0,0,0,0.2);"></div>`
          : `<div style="position:relative;width:${isHighlighted ? 28 : 20}px;height:${isHighlighted ? 28 : 20}px;display:flex;align-items:center;justify-content:center;">
               <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
               <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.2);position:relative;"></div>
             </div>`;

      const icon = L.divIcon({
        html: iconHtml,
        className: "",
        iconSize: [isHighlighted ? 28 : 20, isHighlighted ? 28 : 20],
        iconAnchor: [isHighlighted ? 14 : 10, isHighlighted ? 14 : 10],
      });

      const addr = r.address || `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`;

      const popupEl = document.createElement("div");
      popupEl.style.cssText = "font-family:sans-serif;padding:4px;";

      if (r.imageUrl) {
        const safeUrl = /^(https?:\/\/|\/)/.test(r.imageUrl) ? r.imageUrl : "";
        if (safeUrl) {
          const imgWrap = document.createElement("div");
          imgWrap.style.cssText = "margin:-4px -4px 8px -4px;border-radius:8px 8px 0 0;overflow:hidden;height:100px;";
          const img = document.createElement("img");
          img.src = safeUrl;
          img.alt = "Waste photo";
          img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
          imgWrap.appendChild(img);
          popupEl.appendChild(imgWrap);
        }
      }

      const statusEl = document.createElement("div");
      statusEl.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${color};margin-bottom:3px;`;
      statusEl.textContent = label;
      popupEl.appendChild(statusEl);

      const addrEl = document.createElement("div");
      addrEl.style.cssText = "font-size:12px;font-weight:600;color:#1a1a1a;margin-bottom:6px;line-height:1.4;";
      addrEl.textContent = addr.length > 60 ? addr.slice(0, 60) + "…" : addr;
      popupEl.appendChild(addrEl);

      const link = document.createElement("a");
      link.href = `/officer/report/${Number(r.id)}`;
      link.style.cssText = "display:inline-block;font-size:11px;font-weight:700;color:#0f766e;text-decoration:none;background:#f0fdf4;padding:3px 9px;border-radius:6px;";
      link.textContent = "View Report →";
      popupEl.appendChild(link);

      const popup = L.popup({ maxWidth: 220, className: "waste-popup" }).setContent(popupEl);

      const marker = L.marker([r.latitude, r.longitude], { icon })
        .bindPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    });
  }

  const zoomIn = () => leafletMapRef.current?.zoomIn();
  const zoomOut = () => leafletMapRef.current?.zoomOut();
  const reCenter = () => {
    if (leafletMapRef.current && boundsRef.current) {
      leafletMapRef.current.fitBounds(boundsRef.current, {
        padding: [20, 20],
        animate: true,
      });
    }
  };

  const btn =
    "w-9 h-9 flex items-center justify-center bg-white/95 backdrop-blur-sm text-gray-700 shadow rounded-xl border border-gray-200/80 hover:bg-primary/10 hover:text-primary active:scale-95 transition-all cursor-pointer select-none text-base font-bold";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border/50 shadow-md bg-card">
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-3 py-2 bg-card/90 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" />
          <span className="text-xs font-bold text-foreground">{areaName}</span>
          <span className="text-xs text-muted-foreground">Officer Zone</span>
        </div>
        <span className="text-xs text-muted-foreground font-medium">{reports.length} report{reports.length !== 1 ? "s" : ""}</span>
      </div>

      <div ref={mapRef} className="z-0 h-[200px] md:h-[280px] w-full" />

      <div className="absolute top-[44px] right-2.5 z-[1000] flex flex-col gap-1">
        <button className={btn} onClick={zoomIn} title="Zoom in">+</button>
        <button className={btn} onClick={zoomOut} title="Zoom out">−</button>
        <button className={btn} onClick={reCenter} title="Re-center" style={{ fontSize: "10px" }}>⌖</button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-4 px-3 py-1.5 bg-card/90 backdrop-blur-md border-t border-border/50">
        {[
          { color: "#ef4444", label: "New", pulse: true },
          { color: "#f97316", label: "In Progress", pulse: true },
          { color: "#22c55e", label: "Cleaned", pulse: false },
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
      </div>
    </div>
  );
}
