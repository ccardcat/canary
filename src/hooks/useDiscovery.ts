import { useEffect, useReducer, useState } from "react";
import {
  searchProjects,
  type ContentType,
  type Project,
} from "../services/modrinth";
import {
  discoveryReducer,
  initialDiscovery,
  type DiscoveryState,
} from "../services/discovery";

export function useDiscovery() {
  const [state, dispatch] = useReducer(discoveryReducer, initialDiscovery);
  const [result, setResult] = useState<{
    projects: Project[];
    total: number;
    loading: boolean;
    error: string | null;
  }>({ projects: [], total: 0, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (state.type === "server") {
      setResult({ projects: [], total: 0, loading: false, error: null });
      return () => controller.abort();
    }
    setResult((prev) => ({ ...prev, loading: true, error: null }));
    // Debounce while aborting the old request immediately, including during pagination.
    const timer = setTimeout(async () => {
      try {
        const data = await searchProjects(
          state.type,
          state.query,
          state.sort,
          (state.page - 1) * 12,
          state.filters,
          controller.signal,
        );
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
            error: String(error),
          });
      }
    }, 240);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [state, revision]);
  return {
    ...state,
    ...result,
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
