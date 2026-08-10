import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair } from "lucide-react";

const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];

function ensureYouAreHereStyle() {
  if (document.getElementById("ck-you-here-style")) return;
  const style = document.createElement("style");
  style.id = "ck-you-here-style";
  style.textContent = `
    @keyframes ck-you-pulse {
      0%, 100% { transform: scale(1); opacity: 0.55; }
      50% { transform: scale(1.9); opacity: 0; }
    }
    .ck-you-pulse { animation: ck-you-pulse 2.2s ease-out infinite; }
  `;
  document.head.appendChild(style);
}

function buildIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 32px; height: 40px;
      display: flex; align-items: flex-start; justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#0e6b7c"/>
        <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

function buildYouAreHereIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
      <div class="ck-you-pulse" style="position:absolute;inset:-5px;background:rgba(37,99,235,0.28);border-radius:50%;"></div>
      <div style="position:relative;z-index:1;width:14px;height:14px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [0, -13],
  });
}

interface MapPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (loc: { lat: number; lng: number }) => void;
  height?: string;
  geofenceRing?: [number, number][]; // GeoJSON [lon, lat] pairs
  wardRings?: { name: string; ring: [number, number][] }[]; // GeoJSON [lon, lat] pairs
  outsideFence?: boolean;
  readonly?: boolean;
  userLocation?: { lat: number; lng: number } | null;
  onRecenter?: () => void;
}

export function MapPicker({
  value,
  onChange,
  height = "260px",
  geofenceRing,
  wardRings = [],
  outsideFence,
  readonly = false,
  userLocation,
  onRecenter,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const fenceLayerRef = useRef<L.Polygon | null>(null);
  const wardLayersRef = useRef<L.Polygon[]>([]);
  const youAreHereRef = useRef<L.Marker | null>(null);
  const readonlyRef = useRef(readonly);
  const onChangeRef = useRef(onChange);
  const onRecenterRef = useRef(onRecenter);

  useEffect(() => { readonlyRef.current = readonly; }, [readonly]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onRecenterRef.current = onRecenter; }, [onRecenter]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureYouAreHereStyle();

    const center: [number, number] = value ? [value.lat, value.lng] : UDUPI_CENTER;
    const zoom = value ? 15 : 13;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (geofenceRing) {
      const latlngs = geofenceRing.map(([lon, lat]) => [lat, lon] as [number, number]);
      const poly = L.polygon(latlngs, {
        color: "#0e6b7c",
        weight: 2,
        dashArray: "6 4",
        fillColor: "#0e6b7c",
        fillOpacity: 0.06,
      }).addTo(map);
      fenceLayerRef.current = poly;

      if (!value) {
        map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      }
    }

    // The first geofence is Saligrama's outer boundary. Udupi is represented by
    // its individual ward polygons, so draw those separately instead of relying
    // on the district boundary layer above.
    wardLayersRef.current = wardRings.map(({ name, ring }) => {
      const layer = L.polygon(
        ring.map(([lon, lat]) => [lat, lon] as [number, number]),
        {
          color: "#0e6b7c",
          weight: 2,
          opacity: 0.9,
          fillColor: "#14b8a6",
          fillOpacity: 0.08,
          bubblingMouseEvents: false,
        },
      ).addTo(map);
      layer.bindTooltip(name, {
        sticky: true,
        direction: "center",
        className: "text-xs font-bold",
      });
      return layer;
    });

    if (value) {
      const m = L.marker([value.lat, value.lng], { draggable: !readonly, icon: buildIcon() }).addTo(map);
      markerRef.current = m;
      if (!readonly) {
        m.on("dragend", () => {
          const { lat, lng } = m.getLatLng();
          onChangeRef.current({ lat, lng });
        });
      }
    }

    if (userLocation) {
      const um = L.marker([userLocation.lat, userLocation.lng], {
        icon: buildYouAreHereIcon(),
        interactive: false,
        zIndexOffset: -100,
      }).addTo(map);
      um.bindTooltip("You are here", { permanent: false, direction: "top", className: "text-xs font-bold" });
      youAreHereRef.current = um;
    }

    // Always register click handler — gate on readonlyRef so it respects
    // runtime changes (e.g. switching from GPS to Manual in test mode)
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (readonlyRef.current) return;
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const m = L.marker([lat, lng], { draggable: true, icon: buildIcon() }).addTo(map);
        markerRef.current = m;
        m.on("dragend", () => {
          const { lat: dlat, lng: dlng } = m.getLatLng();
          onChangeRef.current({ lat: dlat, lng: dlng });
        });
      }
      onChangeRef.current({ lat, lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      fenceLayerRef.current = null;
      wardLayersRef.current = [];
      youAreHereRef.current = null;
    };
  }, []);

  // Dynamically toggle marker draggability when readonly prop changes
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    if (!readonly) {
      (m as any).dragging?.enable();
      m.off("dragend");
      m.on("dragend", () => {
        const { lat, lng } = m.getLatLng();
        onChangeRef.current({ lat, lng });
      });
    } else {
      (m as any).dragging?.disable();
      m.off("dragend");
    }
  }, [readonly]);

  // Update fence colour and zoom when outside state changes.
  // When outside, fit bounds to include BOTH the geofence and the user's GPS location
  // so the "You Are Here" marker is always visible alongside the service boundary.
  useEffect(() => {
    if (!fenceLayerRef.current) return;
    fenceLayerRef.current.setStyle({
      color: outsideFence ? "#dc2626" : "#0e6b7c",
      fillColor: outsideFence ? "#dc2626" : "#0e6b7c",
      fillOpacity: outsideFence ? 0.08 : 0.06,
    });
    if (outsideFence && mapRef.current) {
      const bounds = fenceLayerRef.current.getBounds();
      if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng] as [number, number]);
      }
      for (const wardLayer of wardLayersRef.current) {
        bounds.extend(wardLayer.getBounds());
      }
      mapRef.current.fitBounds(bounds, { padding: [32, 32], animate: true });
    }
  }, [outsideFence, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    if (!mapRef.current || !value) return;
    const latlng: [number, number] = [value.lat, value.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      const m = L.marker(latlng, { draggable: !readonly, icon: buildIcon() }).addTo(mapRef.current);
      markerRef.current = m;
      if (!readonly) {
        m.on("dragend", () => {
          const { lat, lng } = m.getLatLng();
          onChangeRef.current({ lat, lng });
        });
      }
    }
    // Don't recenter on the pin when it's outside the zone — the outsideFence
    // effect zooms to the boundary so the user can see where the service area is.
    if (!outsideFence) {
      mapRef.current.setView(latlng, Math.max(mapRef.current.getZoom(), 15));
    }
  }, [value?.lat, value?.lng, outsideFence, readonly]);

  // Update "You Are Here" marker position when userLocation changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (!userLocation) return;
    const latlng: [number, number] = [userLocation.lat, userLocation.lng];
    if (youAreHereRef.current) {
      youAreHereRef.current.setLatLng(latlng);
    } else {
      const um = L.marker(latlng, {
        icon: buildYouAreHereIcon(),
        interactive: false,
        zIndexOffset: -100,
      }).addTo(mapRef.current);
      um.bindTooltip("You are here", { permanent: false, direction: "top", className: "text-xs font-bold" });
      youAreHereRef.current = um;
    }
  }, [userLocation?.lat, userLocation?.lng]);

  const recenter = () => {
    // In test-mode manual placement, recenter the map view without moving the
    // manually selected report pin. GPS mode asks the parent to refresh GPS,
    // which updates both the pin and the map view.
    if (!readonlyRef.current && userLocation && mapRef.current) {
      mapRef.current.setView([userLocation.lat, userLocation.lng], Math.max(mapRef.current.getZoom(), 15), {
        animate: true,
      });
      return;
    }
    onRecenterRef.current?.();
  };

  return (
    <div className="relative" style={{ height, width: "100%" }}>
      <div
        ref={containerRef}
        style={{ height: "100%", width: "100%", borderRadius: "inherit" }}
        className="z-0"
      />
      <button
        type="button"
        aria-label="Recenter map on my location"
        title="Recenter map on my location"
        onClick={(event) => {
          event.stopPropagation();
          recenter();
        }}
        className="absolute right-3 bottom-7 z-[1000] flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50 active:scale-95"
      >
        <Crosshair className="h-5 w-5" />
      </button>
    </div>
  );
}
