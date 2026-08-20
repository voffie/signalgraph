import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, fetch }) => {
  const response = await fetch(`/api/tempo/trace/${params.traceId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.status}`);
  }

  const data = await response.json();

  return {
    trace: data
  };
};
