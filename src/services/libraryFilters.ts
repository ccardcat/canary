const storageKey = "canary-library-filters";
export const defaultLibraryFilters = {
  query:"", favorites:false, sort:"installed", minecraftFilter:"", loaderFilter:"", attention:false,
};

export function readLibraryFilters():typeof defaultLibraryFilters | null {
  try {
    const value=JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!value || typeof value!=="object" || Array.isArray(value)) return null;
    const shortText=(value:unknown,max:number)=>typeof value==="string"?value.slice(0,max):"";
    return {
      query:shortText(value.query,160), favorites:value.favorites===true,
      sort:["installed","played","name"].includes(value.sort)?value.sort:"installed",
      minecraftFilter:shortText(value.minecraftFilter,40), loaderFilter:shortText(value.loaderFilter,40), attention:value.attention===true,
    };
  } catch {
    return null;
  }
}

export function storeLibraryFilters(filters:typeof defaultLibraryFilters | null):boolean {
  try {
    if (filters) localStorage.setItem(storageKey,JSON.stringify(filters));
    else localStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
