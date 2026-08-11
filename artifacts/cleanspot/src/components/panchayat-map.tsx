import { useEffect, useMemo, useRef, useState } from "react";
import geofencesData from "@/data/geofences.json";
import { formatWardLabel } from "@/lib/ward-names";
import { useImageLightbox } from "@/components/image-lightbox";

const STATUS_COLORS: Record<string, string> = {
  reported: "#ef4444",
  cleaning: "#3b82f6",
  cleaned: "#22c55e",
};

const OFFICER_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
  "#eab308",
];

const FALLBACK_BOUNDS: [[number, number], [number, number]] = [
  [13.46, 74.67],
  [13.54, 74.74],
];

type WardFeature = {
  name: string;
  panchayat?: string;
  latlngs: [number, number][];
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
};

// All wards from all municipalities — filtered per-component by panchayatName prop
const allWardFeatures: WardFeature[] = geofencesData.features
  .filter(
    (f) =>
      f.geometry.type === "Polygon" &&
      (f.properties as any)?.type === "ward"
  )
  .map((f) => {
    const coords = f.geometry.coordinates[0] as [number, number][];
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    return {
      name: (f.properties as any)?.name ?? "Ward",
      panchayat: (f.properties as any)?.panchayat as string | undefined,
      latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      centroid: [
        lats.reduce((s, v) => s + v, 0) / lats.length,
        lons.reduce((s, v) => s + v, 0) / lons.length,
      ],
    };
  });

// All district outlines — selected per-component by panchayatName prop
const allDistrictFeatures: { panchayat: string; latlngs: [number, number][] }[] =
  geofencesData.features
    .filter(
      (f) =>
        f.geometry.type === "Polygon" &&
        (f.properties as any)?.type === "district"
    )
    .map((f) => {
      const coords = f.geometry.coordinates[0] as [number, number][];
      return {
        panchayat: ((f.properties as any)?.panchayat as string) ?? "",
        latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      };
    });

export type PanchayatMapOfficer = {
  id: number;
  name: string;
  areaName?: string | null;
};

export type PanchayatMapReport = {
  id: number;
  latitude: number;
  longitude: number;
  status: string;
  address?: string | null;
  assignedOfficerId?: number | null;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
  reporterEmail?: string | null;
  createdAt?: string | null;
  /** Set for Udupi reports — the geofence ward name the report falls inside, e.g. "Udupi Ward 11". */
  geographicWardName?: string | null;
};

interface PanchayatMapProps {
  officers: PanchayatMapOfficer[];
  reports: PanchayatMapReport[];
  highlightedWard?: string | null;
  onReportClick?: (report: PanchayatMapReport) => void;
  /** When set, only wards and the district outline for this panchayat are drawn. */
  panchayatName?: string | null;
  /**
   * When true, a missing/null panchayatName renders an empty map rather than
   * the full all-municipality fallback. Use this in authenticated admin views to
   * prevent another panchayat's wards leaking when the prop is accidentally omitted.
   */
  requirePanchayat?: boolean;
}

export function PanchayatMap({ officers, reports, highlightedWard, onReportClick, panchayatName, requirePanchayat }: PanchayatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasZoomedRef = useRef(false);
  const { lightbox, open: openLightbox } = useImageLightbox();
  const openLightboxRef = useRef(openLightbox);
  useEffect(() => { openLightboxRef.current = openLightbox; }, [openLightbox]);

  // Filter wards and district to the relevant municipality when panchayatName is set.
  // When requirePanchayat is true and panchayatName is falsy, return empty rather
  // than falling back to all municipalities — prevents cross-panchayat data leaks
  // in authenticated admin contexts.
  const wardFeatures = useMemo(
    () =>
      panchayatName
        ? allWardFeatures.filter((w) => w.panchayat === panchayatName)
        : requirePanchayat
          ? []
          : allWardFeatures,
    [panchayatName, requirePanchayat]
  );

  const districtFeature = useMemo(() => {
    if (!panchayatName && requirePanchayat) return null;
    const match = panchayatName
      ? allDistrictFeatures.find((d) => d.panchayat === panchayatName)
      : allDistrictFeatures[0];
    return match?.latlngs ?? null;
  }, [panchayatName, requirePanchayat]);

  // Init effect: create map + tiles only; all layer drawing is in the redraw effect
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false });
      mapRef.current = map;

      map.fitBounds(FALLBACK_BOUNDS, { padding: [28, 28] });
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(FALLBACK_BOUNDS, { padding: [28, 28] });
      }, 200);

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

  // Redraw effect: draws all ward polygons, labels, and report markers.
  // Also zooms to assigned wards on first data arrival.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let rafId: number | undefined;
    let cancelled = false;

    rafId = requestAnimationFrame(async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      // Zoom to assigned wards once when officer data first arrives
      if (!hasZoomedRef.current && officers.length > 0) {
        const assignedWardNames = new Set(
          officers.map((o) => o.areaName).filter(Boolean)
        );
        const assignedWards = wardFeatures.filter((w) =>
          assignedWardNames.has(w.name)
        );
        if (assignedWards.length > 0) {
          const allLats = assignedWards.flatMap((w) => [
            w.bounds[0][0],
            w.bounds[1][0],
          ]);
          const allLons = assignedWards.flatMap((w) => [
            w.bounds[0][1],
            w.bounds[1][1],
          ]);
          map.flyToBounds(
            [
              [Math.min(...allLats), Math.min(...allLons)],
              [Math.max(...allLats), Math.max(...allLons)],
            ],
            { padding: [28, 28], duration: 0.6 }
          );
        }
        hasZoomedRef.current = true;
      }

      map.eachLayer((layer: any) => {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
      });

      if (districtFeature) {
        L.polygon(districtFeature, {
          color: "#0d9488",
          weight: 2.5,
          fillOpacity: 0,
          interactive: false,
        }).addTo(map);
      }

      wardFeatures.forEach((ward) => {
        const officer = officers.find((o) => o.areaName === ward.name);
        const isHighlighted = highlightedWard === ward.name;
        const color = officer
          ? OFFICER_PALETTE[officers.indexOf(officer) % OFFICER_PALETTE.length]
          : "#d1d5db";

        L.polygon(ward.latlngs, {
          color: isHighlighted ? "#0d9488" : officer ? color : "#d1d5db",
          weight: isHighlighted ? 3 : officer ? 1.25 : 0.5,
          dashArray: officer ? undefined : "4 6",
          fillOpacity: 0,
          interactive: false,
        }).addTo(map);

        if (officer) {
          // Show compact ward label (number · name) instead of officer name to avoid clutter.
          // Plain text only — no background, border, or chip of any kind.
          const wardNum = ward.name.replace(/\D+/g, "");
          const labelText = formatWardLabel(ward.name) || (wardNum ? wardNum : ward.name.slice(0, 4));
          const labelColor = isHighlighted ? "#0d9488" : color;
          const icon = L.divIcon({
            html: `<div style="
              color:${labelColor};
              font-size:11px;
              font-weight:800;
              line-height:1.3;
              white-space:nowrap;
              text-shadow:0 1px 2px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9);
            ">${labelText}</div>`,
            className: "",
            iconAnchor: [0, 8],
          });
          L.marker(ward.centroid, { icon, interactive: false }).addTo(map);
        }
      });

      reports.forEach((report) => {
        const color = STATUS_COLORS[report.status] ?? "#6b7280";
        const isCleaned = report.status === "cleaned";
        const iconHtml = isCleaned
          ? `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 0 2px ${color}40,0 2px 6px rgba(0,0,0,0.18);"></div>`
          : `<div class="pulse-marker" style="--pulse-color: ${color}; width:28px; height:28px;">
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
        popup.style.cssText = "min-width:160px;padding:4px 0;";

        const beforeUrls: string[] =
          report.imageUrls?.length
            ? report.imageUrls.map((i) => i.url)
            : report.imageUrl
              ? [report.imageUrl]
              : [];
        const afterUrls: string[] =
          report.status === "cleaned"
            ? report.cleanupImageUrls?.length
              ? report.cleanupImageUrls.map((i) => i.url)
              : report.cleanupImageUrl
                ? [report.cleanupImageUrl]
                : []
            : [];
        const allPhotoUrls = [...beforeUrls, ...afterUrls];

        if (allPhotoUrls.length > 0) {
          const buildThumb = (
            src: string,
            label: string,
            cornerRadius: string,
            height: string,
            flex: string,
            onClick: () => void,
          ) => {
            const wrap = document.createElement("div");
            wrap.style.cssText = `${flex}position:relative;border-radius:${cornerRadius};overflow:hidden;height:${height};`;
            const img = document.createElement("img");
            img.src = src;
            img.alt = label;
            img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;";
            img.addEventListener("click", (ev: Event) => { ev.stopPropagation(); onClick(); });
            wrap.appendChild(img);
            const tag = document.createElement("span");
            tag.style.cssText =
              "position:absolute;bottom:2px;left:2px;font-size:8px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,0.55);padding:1px 4px;border-radius:99px;";
            tag.textContent = label;
            wrap.appendChild(tag);
            return wrap;
          };

          const imgSection = document.createElement("div");

          if (beforeUrls.length === 1 && afterUrls.length === 0) {
            // Single complaint photo — full-width
            imgSection.style.cssText = "margin:-4px -4px 8px -4px;border-radius:8px 8px 0 0;overflow:hidden;height:100px;";
            imgSection.appendChild(
              buildThumb(beforeUrls[0], "Photo", "8px 8px 0 0", "100px", "", () =>
                openLightboxRef.current(allPhotoUrls, 0)
              )
            );
          } else if (beforeUrls.length === 0 && afterUrls.length === 1) {
            // Only a cleanup photo (edge case)
            imgSection.style.cssText = "margin:-4px -4px 8px -4px;border-radius:8px 8px 0 0;overflow:hidden;height:100px;";
            imgSection.appendChild(
              buildThumb(afterUrls[0], "Cleaned", "8px 8px 0 0", "100px", "", () =>
                openLightboxRef.current(allPhotoUrls, 0)
              )
            );
          } else if (beforeUrls.length === 1 && afterUrls.length === 1) {
            // Classic side-by-side before/after
            imgSection.style.cssText = "display:flex;gap:3px;margin:-4px -4px 8px -4px;";
            imgSection.appendChild(
              buildThumb(beforeUrls[0], "Before", "8px 0 0 0", "100px", "flex:1;", () =>
                openLightboxRef.current(allPhotoUrls, 0)
              )
            );
            imgSection.appendChild(
              buildThumb(afterUrls[0], "After", "0 8px 0 0", "100px", "flex:1;", () =>
                openLightboxRef.current(allPhotoUrls, 1)
              )
            );
          } else {
            // Scrollable strip for multiple photos
            imgSection.style.cssText = "display:flex;gap:3px;margin:-4px -4px 8px -4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;";
            beforeUrls.forEach((url, i) => {
              imgSection.appendChild(
                buildThumb(
                  url,
                  afterUrls.length > 0 ? "Before" : "Photo",
                  "6px",
                  "95px",
                  "flex-shrink:0;width:74px;",
                  () => openLightboxRef.current(allPhotoUrls, i)
                )
              );
            });
            afterUrls.forEach((url, i) => {
              imgSection.appendChild(
                buildThumb(url, "After", "6px", "95px", "flex-shrink:0;width:74px;", () =>
                  openLightboxRef.current(allPhotoUrls, beforeUrls.length + i)
                )
              );
            });
          }

          popup.appendChild(imgSection);
        }

        const badge = document.createElement("span");
        badge.style.cssText = `display:inline-block;font-size:10px;font-weight:800;
          text-transform:uppercase;letter-spacing:.06em;color:#fff;background:${color};
          padding:1px 7px;border-radius:99px;margin-bottom:5px;`;
        badge.textContent =
          report.status === "reported"
            ? "New"
            : report.status === "cleaning"
            ? "In Progress"
            : "Cleaned";
        popup.appendChild(badge);

        const addr = document.createElement("div");
        addr.style.cssText =
          "font-size:12px;font-weight:600;color:#111827;line-height:1.4;max-width:200px;white-space:normal;";
        addr.textContent =
          report.address ??
          `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`;
        popup.appendChild(addr);

        if (onReportClick) {
          const btn = document.createElement("button");
          btn.textContent = "View details →";
          btn.style.cssText =
            "margin-top:8px;display:block;width:100%;text-align:center;font-size:11px;font-weight:700;" +
            "color:#4f46e5;background:#eef2ff;border:none;border-radius:8px;padding:5px 8px;cursor:pointer;";
          btn.addEventListener("click", () => onReportClick(report));
          popup.appendChild(btn);
        }

        marker.bindPopup(popup).addTo(map);
      });
    });

    return () => {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [officers, reports, mapReady, highlightedWard, onReportClick, wardFeatures, districtFeature]);

  return (
    <>
      <div
        ref={containerRef}
        className="z-0 w-full rounded-2xl overflow-hidden"
        style={{ height: 320 }}
      />
      {lightbox}
    </>
  );
}
