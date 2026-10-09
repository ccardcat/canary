import {useEffect, useMemo, useState} from "react";
import {motion} from "motion/react";
import {Search} from "lucide-react";
import GlassSelect from "./GlassSelect";
import {useAnchoredPopover} from "../hooks/useAnchoredPopover";
import {api, type ContentType} from "../services/modrinth";
import {categoriesForType, fallbackCategories, loaderNames, tagLabel, type CatalogCategory} from "../services/catalog";
import {providerInvoke, type Provider} from "../services/providers";
import {initialDiscovery, type DiscoveryFilters} from "../services/discovery";
import type {T} from "../locales";

export function CatalogFilters({provider, t, filters, setFilters, type}: {
  provider: Provider; t: T; filters: DiscoveryFilters; setFilters: (filters: DiscoveryFilters) => void; type: ContentType;
}) {
  const ref = useAnchoredPopover(420);
  const russian = t("home") === "Главная";
  const [metadata, setMetadata] = useState<{categories: {id: string; name: string}[]; versions: string[]} | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    setMetadata(null); setFailed(false); setLoading(true); setQuery("");
    const controller = new AbortController();
    const load = async () => {
      if (provider === "curseforge") return providerInvoke<{categories: {id: string; name: string}[]; versions: string[]}>("catalog_filters", {kind: type, provider}, controller.signal);
      const results = await Promise.allSettled([
        api<CatalogCategory[]>("tag/category", controller.signal),
        api<{version: string; version_type: string}[]>("tag/game_version", controller.signal),
      ]);
      if (results.some(result => result.status === "rejected") && !controller.signal.aborted) setFailed(true);
      return {
        categories: (results[0].status === "fulfilled" && Array.isArray(results[0].value) ? categoriesForType(results[0].value, type) : fallbackCategories(type)).map(name => ({id: name, name})),
        versions: results[1].status === "fulfilled" && Array.isArray(results[1].value) ? results[1].value.filter(item => item.version_type === "release").map(item => item.version) : ["1.21.1", "1.21", "1.20.1", "1.20", "1.19.2", "1.16.5"],
      };
    };
    void load().then(data => {if (!controller.signal.aborted) setMetadata(data);})
      .catch(() => {if (!controller.signal.aborted) setFailed(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [provider, type, revision]);
  const update = (key: "game" | "loader" | "category" | "environment", value: string) => setFilters({...filters, [key]: value});
  const selected = [...new Set([filters.category, ...(filters.categories || [])].filter(Boolean))];
  const items = useMemo(() => (metadata?.categories || (provider === "modrinth" ? fallbackCategories(type).map(name => ({id: name, name})) : []))
    .map(item => ({...item, label: tagLabel(item.name, t)})).sort((a, b) => a.label.localeCompare(b.label)), [metadata, provider, type, t]);
  const matching = items.filter(item => `${item.label} ${item.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <motion.div ref={ref} popover="manual" className="popover filter-popover anchored-popover catalog-filter-popover" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}>
    <div className="filter-head"><b>{t("filters")}</b><button onClick={() => setFilters({...initialDiscovery.filters})}>{t("reset")}</button></div>
    <label>{t("gameVersion")}<GlassSelect value={filters.game} onChange={e => update("game", e.target.value)}>
      <option value="">{t("any")}</option>{[...new Set([filters.game, ...(metadata?.versions || [])].filter(Boolean))].map(version => <option key={version}>{version}</option>)}
    </GlassSelect></label>
    {type !== "resourcepack" && type !== "shader" && type !== "datapack" && <label>{t("loader")}<GlassSelect value={filters.loader} onChange={e => update("loader", e.target.value)}>
      <option value="">{t("any")}</option>{["fabric", "forge", "neoforge", "quilt"].map(loader => <option value={loader} key={loader}>{loaderNames[loader]}</option>)}
    </GlassSelect></label>}
    {provider === "curseforge" ? <label>{t("category")}<GlassSelect value={filters.category} onChange={e => update("category", e.target.value)}>
      <option value="">{t("any")}</option>{items.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
    </GlassSelect></label> : <fieldset className="catalog-category-field">
      <legend>{t("category")}{selected.length ? ` · ${selected.length}` : ""}</legend>
      <div className="search-field category-search"><Search size={15}/><input aria-label={russian ? "Найти тег" : "Find a tag"} placeholder={russian ? "Найти тег…" : "Find a tag…"} value={query} onChange={e => setQuery(e.target.value)}/></div>
      <div className="category-checklist" aria-busy={loading}>{matching.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setFilters({...filters, category: "", categories: e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id)})}/><span>{item.label}</span></label>)}</div>
      {!matching.length && <small role="status">{russian ? "Теги не найдены" : "No matching tags"}</small>}
      {selected.length > 0 && <div className="selected-filter-tags">{selected.map(tag => <button key={tag} className="project-tag" aria-label={`${t("reset")}: ${tagLabel(tag, t)}`} onClick={() => setFilters({...filters, category: "", categories: selected.filter(id => id !== tag)})}>{tagLabel(tag, t)} ×</button>)}</div>}
      <label className="category-match">{russian ? "Совпадение тегов" : "Match tags"}<GlassSelect value={filters.categoryMatch || "all"} onChange={e => setFilters({...filters, categoryMatch: e.target.value as "all" | "any"})}>
        <option value="all">{russian ? "Все выбранные" : "All selected"}</option><option value="any">{russian ? "Любой выбранный" : "Any selected"}</option>
      </GlassSelect></label>
    </fieldset>}
    {(type === "mod" || type === "modpack") && provider === "modrinth" && <label>{t("environment")}<GlassSelect value={filters.environment} onChange={e => update("environment", e.target.value)}>
      <option value="">{t("any")}</option><option value="client">{t("client")}</option><option value="server">{t("serverSide")}</option>
    </GlassSelect></label>}
    {failed && <div className="filter-load-status" role="status"><small>{russian ? "Часть фильтров не загрузилась." : "Some filters could not be loaded."}</small><button className="quiet-button" onClick={() => setRevision(value => value + 1)}>{t("retry")}</button></div>}
  </motion.div>;
}
