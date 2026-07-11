export type PaginatedSelectResult<T, E = unknown> = {
  data: T[] | null;
  error: E | null;
};

export async function collectExportPages<T, E = unknown>(
  fetchPage: (from: number, to: number) => PromiseLike<PaginatedSelectResult<T, E>>,
  pageSize = 1000,
): Promise<PaginatedSelectResult<T, E | unknown>> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("Export page size must be a positive integer.");
  }

  const rows: T[] = [];
  let from = 0;
  while (true) {
    let page: PaginatedSelectResult<T, E>;
    try {
      page = await fetchPage(from, from + pageSize - 1);
    } catch (error) {
      return { data: null, error };
    }
    if (page.error) return { data: null, error: page.error };
    const pageRows = page.data ?? [];
    if (pageRows.length === 0) return { data: rows, error: null };
    rows.push(...pageRows);
    from += pageRows.length;
  }
}
