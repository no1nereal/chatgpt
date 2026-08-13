export async function tavilySearch(apiKey, query) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(18000),
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "general",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      auto_parameters: false,
    }),
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.detail || data?.error?.message || `Tavily HTTP ${response.status}`);

  return {
    query: data.query || query,
    response_time: data.response_time ?? null,
    credits: data.usage?.credits ?? null,
    results: (data.results || []).slice(0, 5).map((r) => ({
      title: r.title || "",
      url: r.url || "",
      content: String(r.content || "").slice(0, 1600),
      score: r.score ?? null,
      published_date: r.published_date ?? null,
    })),
  };
}
