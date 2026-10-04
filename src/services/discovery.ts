import type { ContentType } from "./modrinth";
export interface DiscoveryState {
  type: ContentType;
  query: string;
  sort: string;
  filters: {
    loader: string;
    game: string;
    category: string;
    environment: string;
  };
  page: number;
}
export const initialDiscovery: DiscoveryState = {
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
