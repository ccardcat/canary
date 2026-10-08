import {searchProvider,providerAvailable,useProviderAvailability,type Provider} from "../services/providers";
import { useEffect, useReducer, useState } from "react";
import {

  type ContentType,
  type Project,
} from "../services/modrinth";
import {
  discoveryReducer,
  initialDiscovery,
  type DiscoveryState,
} from "../services/discovery";

export function useDiscovery(enabled=true) {
  const availability=useProviderAvailability();
  const [state, dispatch] = useReducer(discoveryReducer, initialDiscovery);
  const [result, setResult] = useState<{
    projects: Project[];
    total: number;
    loading: boolean;
    error: string | null;
  }>({ projects: [], total: 0, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if(!enabled)return;
    const controller = new AbortController();
    let active = true;
    if (state.type === "server" || !providerAvailable(state.provider)) {
      setResult({ projects: [], total: 0, loading: false, error: null });
      return () => controller.abort();
    }
    setResult({ projects: [], total: 0, loading: true, error: null });
    // Debounce while aborting the old request immediately, including during pagination.
    const timer = setTimeout(async () => {
      try {
        const data = await searchProvider(state,controller.signal);
        if (active)
          setResult({
            projects: data.hits,
            total: data.total_hits,
            loading: false,
            error: null,
          });
      } catch (error) {
        if (active && !controller.signal.aborted)
          setResult({
            projects: [],
            total: 0,
            loading: false,
            error: typeof error==="object"&&error&&"message" in error?String(error.message):String(error),
          });
      }
    }, 240);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [state, revision,availability,enabled]);
  return {
    ...state,
    ...(providerAvailable(state.provider) ? result : {projects:[],total:0,loading:false,error:null}),
    setProvider:(provider:Provider)=>dispatch({type:"criteria",value:{provider,sort:provider==="curseforge"&&state.sort==="follows"?"downloads":state.sort,filters:initialDiscovery.filters}}),
    setType: (type: ContentType) =>
      dispatch({
        type: "criteria",
        value: { type, filters: initialDiscovery.filters },
      }),
    setQuery: (query: string) =>
      dispatch({ type: "criteria", value: { query } }),
    setSort: (sort: string) => dispatch({ type: "criteria", value: { sort } }),
    setFilters: (filters: DiscoveryState["filters"]) =>
      dispatch({ type: "criteria", value: { filters } }),
    setPage: (page: number) => dispatch({ type: "page", page }),
    retry: () => setRevision((x) => x + 1),
  };
}
