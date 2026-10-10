import {test, expect} from "@playwright/test";
import {catalogDefaults, normalizeCatalog, categoriesForType, projectTags, tagLabel} from "../src/services/catalog";
import {searchFacets, type Project} from "../src/services/modrinth";
import {activeFilterCount, discoveryReducer, initialDiscovery} from "../src/services/discovery";
import {en, ru, type T} from "../src/locales";

const t: T = key => en[key];
test("old visual preferences get catalog defaults and corrupted values are bounded", () => {
  expect(normalizeCatalog({app: "meadow", fontScale: 120})).toEqual(catalogDefaults);
  expect(normalizeCatalog({catalogLayout: "broken", catalogDensity: null, catalogTagLimit: Infinity, catalogDescription: "false"})).toEqual(catalogDefaults);
  expect(normalizeCatalog({catalogLayout: "grid", catalogDensity: "compact", catalogTagLimit: 999, catalogDescription: false})).toMatchObject({catalogLayout: "grid", catalogDensity: "compact", catalogTagLimit: 12, catalogDescription: false});
  expect(normalizeCatalog({catalogTagLimit: -5}).catalogTagLimit).toBe(0);
});
test("tag data includes secondary categories, keeps loaders first and removes duplicates", () => {
  const project: Project = {project_id: "test", title: "Test", description: "", downloads: 0, categories: ["adventure", "fabric", "optimization"], display_categories: ["multiplayer", "fabric"], loaders: ["Fabric", "forge"]};
  expect(projectTags(project)).toEqual(["fabric", "forge", "multiplayer", "adventure", "optimization"]);
  expect(tagLabel("neoforge", t)).toBe("NeoForge");
  expect(tagLabel("new-category_name", t)).toBe("New Category Name");
  expect(tagLabel("optimization", key => ru[key])).toBe("Оптимизация");
});
test("category metadata is scoped to content and is never truncated at ten", () => {
  const metadata = Array.from({length: 24}, (_, i) => ({name: `category-${i}`, project_type: "modpack"}));
  expect(categoriesForType([...metadata, {name: "fabric", project_type: "modpack"}, {name: "utility", project_type: "mod"}], "modpack")).toHaveLength(24);
  expect(categoriesForType([{name: "utility", project_type: "mod"}, {name: "datapack", project_type: "mod"}], "datapack")).toEqual(["utility"]);
});
test("all tags use AND, any tags use OR and both retain loader/version constraints", () => {
  const filters = {...initialDiscovery.filters, game: "1.21.1", loader: "fabric", categories: ["optimization", "multiplayer", "optimization"]};
  expect(searchFacets("modpack", filters)).toEqual([["project_type:modpack"], ["categories:fabric"], ["versions:1.21.1"], ["categories:optimization"], ["categories:multiplayer"]]);
  expect(searchFacets("modpack", {...filters, categoryMatch: "any"})).toEqual([["project_type:modpack"], ["categories:fabric"], ["versions:1.21.1"], ["categories:optimization", "categories:multiplayer"]]);
  expect(activeFilterCount({...filters, categoryMatch: "any"})).toBe(4);
  expect(activeFilterCount({...initialDiscovery.filters, categories: [], categoryMatch: "all"})).toBe(0);
});
test("legacy filters still work, datapacks retain both constraints and category changes reset pagination", () => {
  expect(searchFacets("datapack", {...initialDiscovery.filters, category: "utility"})).toEqual([["categories:datapack"], ["project_type:mod"], ["categories:utility"]]);
  const paged = {...initialDiscovery, page: 4};
  expect(discoveryReducer(paged, {type: "criteria", value: {filters: {...paged.filters, categories: ["optimization"]}}}).page).toBe(1);
  expect(discoveryReducer(paged, {type: "criteria", value: {filters: {...paged.filters}}})).toBe(paged);
});
test("environment filters use the supported environment facet", () => {
  const facets = searchFacets("modpack", {...initialDiscovery.filters, environment: "client"});
  expect(facets[1]).toContain("environment:client_only");
  expect(facets[1]).toContain("environment:client_and_server");
  expect(facets.flat()).not.toContain("client:required");
});
