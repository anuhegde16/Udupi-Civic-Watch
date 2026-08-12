/**
 * Shared types and helpers for the Command Center's unified staff roster.
 *
 * The roster merges two very different staff models — legacy Saligrama field
 * officers (one ward each, explicit report assignment) and the Udupi hierarchy
 * (EE → HI → supervisor, wards assigned geographically) — into one list.
 */
import geofencesData from "@/data/geofences.json";
import { formatWardLabel } from "@/lib/ward-names";

export const STAFF_TYPES = [
  "environmental_engineer",
  "health_inspector",
  "supervisor",
  "field_officer",
  "community_mobiliser",
] as const;

export type StaffType = (typeof STAFF_TYPES)[number];

export interface StaffMember {
  key: string;
  staffType: StaffType;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  panchayatName: string | null;
  wardKeys: string[];
  wardNames: string[];
  centerLat: number | null;
  centerLng: number | null;
  reportCount: number | null;
  pendingCount: number | null;
  parentId: number | null;
  parentName: string | null;
  hasLogin: boolean;
  createdAt: string | null;
}

export interface StaffRosterResponse {
  staff: StaffMember[];
  total: number;
  panchayats: { name: string; wards: string[] }[];
}

export const STAFF_LABELS: Record<StaffType, string> = {
  environmental_engineer: "Environmental Engineer",
  health_inspector: "Health Inspector",
  supervisor: "Supervisor",
  field_officer: "Field Officer",
  community_mobiliser: "Community Mobiliser",
};

export const STAFF_SHORT_LABELS: Record<StaffType, string> = {
  environmental_engineer: "Engineer",
  health_inspector: "Inspector",
  supervisor: "Supervisor",
  field_officer: "Field Officer",
  community_mobiliser: "Mobiliser",
};

/** One accent colour per staff type so the roster reads by role at a glance. */
export const STAFF_COLORS: Record<StaffType, string> = {
  environmental_engineer: "#7c3aed",
  health_inspector: "#0d9488",
  supervisor: "#2563eb",
  field_officer: "#f97316",
  community_mobiliser: "#db2777",
};

/** Rank used for grouping the roster top-down through the chain of command. */
export const STAFF_ORDER: Record<StaffType, number> = {
  environmental_engineer: 0,
  health_inspector: 1,
  supervisor: 2,
  field_officer: 3,
  community_mobiliser: 4,
};

/**
 * Supervisors persist wards as "Ward 5/Kalmady"; every other surface uses the
 * canonical geofence key "Udupi Ward 5". These two convert between them.
 */
export function supervisorWardToKey(raw: string): string | null {
  const m = String(raw).match(/^Ward (\d+)/);
  return m ? `Udupi Ward ${m[1]}` : null;
}

export function keyToSupervisorWard(key: string): string | null {
  const m = key.match(/^Udupi Ward (\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const feature = (geofencesData.features as any[]).find((f) => f.properties?.name === key);
  const wardName = feature?.properties?.wardName;
  return wardName ? `Ward ${num}/${wardName}` : `Ward ${num}`;
}

export function wardChipLabel(key: string): string {
  return formatWardLabel(key) || key;
}

export const PANCHAYAT_WARDS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const f of geofencesData.features as any[]) {
    if (f.properties?.type !== "ward") continue;
    const p = f.properties?.panchayat;
    if (!p) continue;
    (out[p] ??= []).push(f.properties.name as string);
  }
  for (const wards of Object.values(out)) {
    wards.sort((a, b) => {
      const na = parseInt(a.match(/(\d+)$/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)$/)?.[1] ?? "0", 10);
      return na - nb;
    });
  }
  return out;
})();

export const PANCHAYAT_NAMES: string[] = Object.keys(PANCHAYAT_WARDS).sort();

/**
 * Which staff types make sense for a given municipality.
 *
 * Udupi includes "field officer" because the municipality uses that title
 * interchangeably with "supervisor" for the same ward-level job. A Udupi field
 * officer is ward-scoped like a supervisor, unlike a Saligrama field officer
 * who works from per-report assignments.
 */
export function staffTypesForPanchayat(panchayat: string): StaffType[] {
  return panchayat === "Udupi"
    ? ["environmental_engineer", "health_inspector", "supervisor", "field_officer", "community_mobiliser"]
    : ["field_officer"];
}

/** Udupi staff log in with a phone number; legacy field officers use email. */
export function usesPhoneLogin(staffType: StaffType): boolean {
  return staffType !== "field_officer";
}

export function supportsMultipleWards(staffType: StaffType): boolean {
  return staffType === "supervisor";
}

/** Staff types whose ward coverage is derived from the people beneath them. */
export function hasDerivedWards(staffType: StaffType): boolean {
  return staffType === "environmental_engineer" || staffType === "health_inspector";
}
