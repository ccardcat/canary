import {categories, type T} from "../locales";
import type {ContentType, Project} from "./modrinth";

export type CatalogPreferences = {
  catalogLayout: "list" | "grid";
  catalogDensity: "comfortable" | "compact";
  catalogDescription: boolean;
  catalogAuthor: boolean;
  catalogStats: boolean;
  catalogTagLimit: number;
};
export const catalogDefaults: CatalogPreferences = {
  catalogLayout: "list", catalogDensity: "comfortable", catalogDescription: true,
  catalogAuthor: true, catalogStats: true, catalogTagLimit: 6,
};
export function normalizeCatalog(input: Record<string, unknown>): CatalogPreferences {
  const result = {...catalogDefaults};
  if (input.catalogLayout === "grid" || input.catalogLayout === "list") result.catalogLayout = input.catalogLayout;
  if (input.catalogDensity === "compact" || input.catalogDensity === "comfortable") result.catalogDensity = input.catalogDensity;
  for (const key of ["catalogDescription", "catalogAuthor", "catalogStats"] as const)
    if (typeof input[key] === "boolean") result[key] = input[key];
  if (typeof input.catalogTagLimit === "number" && Number.isFinite(input.catalogTagLimit))
    result.catalogTagLimit = Math.min(12, Math.max(0, Math.round(input.catalogTagLimit)));
  return result;
}
export const loaderNames: Record<string, string> = {
  fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", quilt: "Quilt",
  liteloader: "LiteLoader", rift: "Rift", iris: "Iris", optifine: "OptiFine",
};
const extraLabels: Record<string, [string, string]> = {
  multiplayer: ["Multiplayer", "Мультиплеер"], singleplayer: ["Singleplayer", "Одиночная игра"],
  lightweight: ["Lightweight", "Лёгкая"], optimization: ["Optimization", "Оптимизация"],
  challenging: ["Challenging", "Сложная"], combat: ["Combat", "Сражения"],
  "vanilla-like": ["Vanilla-like", "Ванильная"], "world-generation": ["World Generation", "Генерация мира"],
  quests: ["Quests", "Квесты"], kitchen_sink: ["Kitchen Sink", "Всё в одном"],
  "kitchen-sink": ["Kitchen Sink", "Всё в одном"],
};
export function tagLabel(tag: string, t: T): string {
  const key = tag.toLowerCase();
  const label = loaderNames[key] || (categories[key] ? t(categories[key]) : extraLabels[key]?.[t("home") === "Главная" ? 1 : 0])
    || tag.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, letter => letter.toUpperCase());
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}
export function projectTags(p: Project): string[] {
  const values = [...(p.loaders || []), ...(p.display_categories || []), ...(p.categories || [])];
  const unique = [...new Set(values.filter(Boolean).map(value => value.toLowerCase()))];
  return [...unique.filter(value => value in loaderNames), ...unique.filter(value => !(value in loaderNames))];
}
export type CatalogCategory = {name: string; project_type: string; header?: string};
export function categoriesForType(items: CatalogCategory[], type: ContentType): string[] {
  const applicable = type === "datapack" ? "mod" : type;
  return [...new Set(items.filter(item => item.project_type === applicable && item.name && !(item.name in loaderNames) && item.name !== "datapack").map(item => item.name))];
}
export const fallbackCategories = (type: ContentType): string[] => type === "modpack"
  ? ["adventure", "challenging", "combat", "kitchen-sink", "lightweight", "magic", "multiplayer", "optimization", "quests", "technology", "vanilla-like"]
  : Object.keys(categories).filter(name => !(name in loaderNames));
