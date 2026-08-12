import { useEffect, useRef, useState } from "react";
import geofencesData from "@/data/geofences.json";
import { formatWardLabel } from "@/lib/ward-names";

export type UdupiSupervisorMapReport = {
  id: number;
  status: string;
  address: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  imageUrls?: { url: string }[] | null;
  cleanupImageUrl?: string | null;
  wardName?: string | null;
};

interface UdupiSupervisorZoneMapProps {
  reports: UdupiSupervisorMapReport[];
  wardGeoNames: string[];
  wardNames: string[];
  onReportClick: (report: UdupiSupervisorMapReport) => void;
}

const statusColor = (status: string) =>
  status === "reported" ? "#ef4444" : status === "cleaning" ? "#3b82f6" : "#22c55e";

const statusLabel = (status: string) =>
  status === "reported" ? "New" : status === "cleaning" ? "In Progress" : "Cleaned";

export function UdupiSupervisorZoneMap({
  reports,
  wardGeoNames,
  wardNames,
  onReportClick,
}: UdupiSupervisorZoneMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any[]>([]);
  const boundsRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapElementRef.current || mapRef.current) return;
      const map = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

      const wardPolygons: any[] = [];
      for (const feature of geofencesData.features) {
        if (feature.geometry.type !== "Polygon") continue;
        const properties = feature.properties as { name?: string; type?: string };
        if (properties.type !== "ward" || !wardGeoNames.includes(properties.name ?? "")) continue;
        const latlngs = (feature.geometry.coordinates[0] as [number, number][]).map(
          ([longitude, latitude]) => [latitude, longitude] as [number, number],
        );
        const polygon = L.polygon(latlngs, {
          color: "#f59e0b",
          weight: 2.5,
          fillColor: "#f59e0b",
          fillOpacity: 0.15,
        }).addTo(map);
        polygon.bindTooltip(formatWardLabel(properties.name) || properties.name || "Ward", {
          direction: "center",
          className: "zone-label",
        });
        wardPolygons.push(polygon);
      }

      if (wardPolygons.length) {
        boundsRef.current = L.featureGroup(wardPolygons).getBounds();
        map.fitBounds(boundsRef.current, { padding: [20, 20] });
      }
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [wardGeoNames]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    let active = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!active || !mapRef.current) return;
      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current = [];
      reports.forEach((report) => {
        const color = statusColor(report.status);
        const isCleaned = report.status === "cleaned";
        const icon = L.divIcon({
          html: isCleaned
            ? `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 2px ${color}60,0 2px 6px rgba(0,0,0,.2)"></div>`
            : `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center"><div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.25;animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite"></div><div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2);position:relative"></div></div>`,
          className: "udupi-supervisor-report-marker",
          iconSize: isCleaned ? [14, 14] : [20, 20],
          iconAnchor: isCleaned ? [7, 7] : [10, 10],
        });
        const popup = document.createElement("div");
        popup.style.cssText = "font-family:sans-serif;padding:4px;";
        const photo = report.imageUrls?.[0]?.url ?? report.imageUrl;
        if (photo && /^(https?:\/\/|\/)/.test(photo)) {
          const image = document.createElement("img");
          image.src = photo;
          image.alt = "Waste photo";
          image.style.cssText = "width:calc(100% + 8px);height:100px;object-fit:cover;display:block;margin:-4px -4px 8px;border-radius:8px 8px 0 0;";
          popup.appendChild(image);
        }
        const status = document.createElement("div");
        status.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${color};margin-bottom:3px;`;
        status.textContent = statusLabel(report.status);
        popup.appendChild(status);
        const address = document.createElement("div");
        const displayAddress = report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`;
        address.style.cssText = "font-size:12px;font-weight:600;color:#1a1a1a;margin-bottom:6px;line-height:1.4;";
        address.textContent = displayAddress.length > 60 ? `${displayAddress.slice(0, 60)}…` : displayAddress;
        popup.appendChild(address);
        const action = document.createElement("button");
        action.type = "button";
        action.dataset.reportId = String(report.id);
        action.dataset.reportStatus = report.status;
        action.style.cssText = "display:block;width:100%;font-size:11px;font-weight:800;color:#fff;border:0;background:#0f766e;padding:7px 9px;border-radius:7px;cursor:pointer;";
        action.textContent = report.status === "reported" ? "Start Cleanup" : report.status === "cleaning" ? "Manage Cleanup" : "View Report";
        action.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onReportClick(report);
        });
        popup.appendChild(action);
        markerRef.current.push(
          L.marker([report.latitude, report.longitude], { icon })
            .bindPopup(L.popup({ maxWidth: 220, className: "waste-popup" }).setContent(popup))
            .addTo(mapRef.current),
        );
      });
    })();
    return () => { active = false; };
  }, [reports, mapReady, onReportClick]);

  const buttonClass = "w-9 h-9 flex items-center justify-center bg-white/95 backdrop-blur-sm text-gray-700 shadow rounded-xl border border-gray-200/80 hover:bg-primary/10 hover:text-primary active:scale-95 transition-all cursor-pointer select-none text-base font-bold";
  const recenter = () => mapRef.current?.fitBounds(boundsRef.current, { padding: [20, 20], animate: true });

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border/50 shadow-md bg-card">
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-3 py-2 bg-card/90 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" />
          <span className="text-xs font-bold text-foreground truncate">{wardNames.map(formatWardLabel).join(", ") || "My Zones"}</span>
          <span className="text-xs text-muted-foreground shrink-0">Officer Zone</span>
        </div>
        <span className="text-xs text-muted-foreground font-medium shrink-0">{reports.length} report{reports.length === 1 ? "" : "s"}</span>
      </div>
      <div ref={mapElementRef} className="z-0 h-[200px] md:h-[280px] w-full" />
      <div className="absolute top-[44px] right-2.5 z-[1000] flex flex-col gap-1">
        <button className={buttonClass} onClick={() => mapRef.current?.zoomIn()} title="Zoom in">+</button>
        <button className={buttonClass} onClick={() => mapRef.current?.zoomOut()} title="Zoom out">−</button>
        <button className={buttonClass} onClick={recenter} title="Re-center" style={{ fontSize: "10px" }}>⌖</button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-4 px-3 py-1.5 bg-card/90 backdrop-blur-md border-t border-border/50">
        {[["#ef4444", "New", true], ["#3b82f6", "In Progress", true], ["#22c55e", "Cleaned", false]].map(([color, label, pulse]) => (
          <div key={String(label)} className="flex items-center gap-1.5">
            <span className={pulse ? "relative flex h-2 w-2" : "inline-flex rounded-full h-2 w-2"} style={!pulse ? { background: String(color) } : undefined}>
              {pulse && <><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: String(color) }} /><span className="relative inline-flex rounded-full h-2 w-2" style={{ background: String(color) }} /></>}
            </span>
            <span className="text-xs text-muted-foreground font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}