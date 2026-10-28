export type DirectoryFilters = { search: string; specialty: string };

export function parseDirectoryFilters(params: { q?: string; specialty?: string } | URLSearchParams): DirectoryFilters {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : params[key as keyof typeof params];
  return {
    search: (get("q") ?? "").trim().slice(0, 100),
    specialty: (get("specialty") ?? "").trim().slice(0, 100),
  };
}
