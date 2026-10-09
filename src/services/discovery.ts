import type { ContentType } from "./modrinth";
export type DiscoveryFilters = {
  loader: string; game: string; category: string; environment: string;
  categories?: string[]; categoryMatch?: "all" | "any";
};
export function activeFilterCount(filters: DiscoveryFilters): number {
  return [filters.loader, filters.game, filters.environment].filter(Boolean).length
    + new Set([filters.category, ...(filters.categories || [])].filter(Boolean)).size;
}
export interface DiscoveryState {
  provider:"modrinth"|"curseforge";
  type: ContentType;
  query: string;
  sort: string;
  filters: DiscoveryFilters;
  page: number;
}
export const initialDiscovery: DiscoveryState = {
  provider:"modrinth",
  type: "modpack",
  query: "",
  sort: "downloads",
  page: 1,
  filters: { loader: "", game: "", category: "", environment: "" },
};
export function discoveryReducer(
  state: DiscoveryState,
  action:
    | { type: "criteria"; value: Partial<Omit<DiscoveryState, "page">> }
    | { type: "page"; page: number },
): DiscoveryState {
  if (action.type === "page")
    return { ...state, page: Math.max(1, action.page) };
  const next = { ...state, ...action.value };
  return JSON.stringify({ ...next, page: 1 }) ===
    JSON.stringify({ ...state, page: 1 })
    ? state
    : { ...next, page: 1 };
}
