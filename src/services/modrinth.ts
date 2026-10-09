import type {DiscoveryFilters} from "./discovery";
export type ContentType =
  "modpack" | "mod" | "resourcepack" | "datapack" | "shader" | "server";
export interface Project {
  download_allowed?:boolean;
  native_instance_id?:string;
  provider?: "modrinth" | "curseforge";
  project_id: string;
  slug?: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  author?: string;
  project_type?: ContentType;
  categories?: string[];
  display_categories?: string[];
  environment?: string | string[];
  client_side?: string;
  server_side?: string;
  versions?: string[];
  gallery?: string[];
  featured_gallery?: string;
  follows?: number;
  date_modified?: string;
  instance_path?: string;
  version_id?: string;
  version_name?: string;
  loaders?: string[];
  installed_at?: string;
}
export interface Version {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  changelog: string | null;
  date_published: string;
  dependencies: {
    project_id: string | null;
    version_id: string | null;
    dependency_type: string;
  }[];
  files: { filename: string; url: string }[];
}
export interface Detail {
  download_allowed?:boolean;
  provider?: "modrinth" | "curseforge";
  body_format?: "html" | "markdown";
  website_url?: string;
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url?: string;
  project_type: ContentType;
  downloads: number;
  followers: number;
  published: string;
  updated: string;
  categories: string[];
  game_versions: string[];
  loaders: string[];
  gallery: { url: string; title?: string; featured: boolean }[];
  source_url?: string;
  issues_url?: string;
}
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch("https://api.modrinth.com/v2/" + path, { signal });
  if (!r.ok) throw Error(`Modrinth HTTP ${r.status}`);
  return r.json();
}
export function searchFacets(type: ContentType, filters: DiscoveryFilters): string[][] {
  const facets: string[][] = [[type === "datapack" ? "categories:datapack" : "project_type:" + type]];
  if (type === "datapack") facets.push(["project_type:mod"]);
  if (filters.loader) facets.push(["categories:" + filters.loader]);
  if (filters.game) facets.push(["versions:" + filters.game]);
  const categories = [...new Set([filters.category, ...(filters.categories || [])].filter(Boolean))].map(category => "categories:" + category);
  if (categories.length) facets.push(...(filters.categoryMatch === "any" ? [categories] : categories.map(category => [category])));
  if (filters.environment) {
    const client = ["client_and_server", "client_only", "client_only_server_optional", "singleplayer_only", "client_or_server", "client_or_server_prefers_both"];
    const server = ["client_and_server", "server_only", "server_only_client_optional", "dedicated_server_only", "client_or_server", "client_or_server_prefers_both"];
    facets.push((filters.environment === "client" ? client : server).map(value => "environment:" + value));
  }
  return facets;
}
export function searchProjects(
  type: ContentType,
  q: string,
  sort: string,
  offset: number,
  filters: DiscoveryFilters,
  signal: AbortSignal,
) {
  const facets = searchFacets(type, filters);
  return api<{ hits: Project[]; total_hits: number }>(
    "search?" +
      new URLSearchParams({
        query: q,
        index: sort,
        offset: String(offset),
        limit: "12",
        facets: JSON.stringify(facets),
      }),
    signal,
  );
}
export const artwork = (p: Project) => p.featured_gallery || p.gallery?.[0];
export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
