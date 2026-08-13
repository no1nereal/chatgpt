import base from "./v033.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function isAuthorized(request, env) {
  const token = request.headers.get("x-chairman-token");
  return Boolean(env.CHAIRMAN_TOKEN && token && token === env.CHAIRMAN_TOKEN);
}

function retryDelayMs(message) {
  const match = String(message || "").match(/after\s+(\d+)\s+seconds?/i);
  return Math.min(Math.max(Number(match?.[1] || 1), 1), 3) * 1000;
}

async function moonshotRequest(env, path, { method = "GET", body, timeoutMs = 30_000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://api.moonshot.ai/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (response.ok) return data;
      const message = data?.error?.message || `Kimi API error ${response.status}`;
      if (response.status === 429 && attempt < retries) {
        await sleep(retryDelayMs(message));
        continue;
      }
      throw new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || error?.name === "TimeoutError") break;
      await sleep(750);
    }
  }
  throw lastError || new Error("Moonshot request failed");
}

async function runBoundedScout(env) {
  const formulaUri = "moonshot/web-search:latest";
  const toolDeclaration = await moonshotRequest(env, `/formulas/${formulaUri}/tools`, { timeoutMs: 15_000, retries: 1 });
  const tools = toolDeclaration?.tools;
  if (!Array.isArray(tools) || !tools.length) throw new Error("Kimi web-search tool declaration was empty");

  const messages = [
    {
      role: "system",
      content: [
        "You are Scout-1, a research-only market scout.",
        "Today is 2026-08-13.",
        "Find self-serve digital product or micro-SaaS opportunities that could become mostly autonomous.",
        "The owner's target is eventually $10k-$20k monthly profit without sales calls, custom client work, inventory, regulated products, deception, spam, or gray-market tactics.",
        "Prefer repetitive pain, existing buyer spend, obvious intent, recurring or usage-based revenue, and products agents can build/support.",
        "You have a HARD budget of four executed web searches. Combine queries aggressively.",
        "You cannot spend money, contact anyone, deploy anything, open accounts, or make external changes.",
      ].join(" "),
    },
    {
      role: "user",
      content: "Plan the live-market research needed to rank exactly 3 opportunities. Request the web searches you need now in one batch. After search results are returned, you will be asked to synthesize a final report.",
    },
  ];

  const planning = await moonshotRequest(env, "/chat/completions", {
    method: "POST",
    timeoutMs: 35_000,
    retries: 1,
    body: {
      model: "kimi-k3",
      messages,
      tools,
      max_completion_tokens: 2200,
      reasoning_effort: "low",
    },
  });

  const planChoice = planning.choices?.[0];
  if (!planChoice) throw new Error("Kimi returned no planning choice");
  const assistantMessage = planChoice.message || {};
  const requestedCalls = assistantMessage.tool_calls || [];

  if (!requestedCalls.length) {
    return {
      model: planning.model,
      result: assistantMessage.content || "Scout returned no search requests and no report.",
      search_calls: 0,
      denied_searches: 0,
      usage: planning.usage || null,
    };
  }

  const allowedCalls = requestedCalls.filter((call) => call?.function?.name === "web_search").slice(0, 4);
  const deniedCount = Math.max(requestedCalls.length - allowedCalls.length, 0);

  const executed = await Promise.all(allowedCalls.map(async (toolCall) => {
    try {
      const fiber = await moonshotRequest(env, `/formulas/${formulaUri}/fibers`, {
        method: "POST",
        retries: 0,
        timeoutMs: 25_000,
        body: { name: "web_search", arguments: toolCall.function.arguments },
      });
      const context = fiber?.context || {};
      const output = context.output || context.encrypted_output || "";
      return { toolCall, content: output || JSON.stringify({ error: "web search returned no output" }) };
    } catch (error) {
      return { toolCall, content: JSON.stringify({ error: `web search failed: ${error.message}` }) };
    }
  }));

  const allToolCalls = requestedCalls.map((call) => ({
    ...call,
    function: call.function,
  }));

  const synthesisMessages = [...messages, {
    role: "assistant",
    content: assistantMessage.content ?? null,
    tool_calls: allToolCalls,
  }];

  const executedById = new Map(executed.map((x) => [x.toolCall.id, x.content]));
  for (const toolCall of requestedCalls) {
    const content = executedById.get(toolCall.id) || JSON.stringify({ error: "search denied: hard four-search budget exhausted" });
    synthesisMessages.push({ role: "tool", tool_call_id: toolCall.id, content });
  }

  synthesisMessages.push({
    role: "user",
    content: [
      "Search phase is over. No tools are available now.",
      "Using only the evidence returned, produce exactly 3 ranked opportunities.",
      "For each include: buyer, repetitive pain, live-web evidence, alternatives/prices when found, tiny product, suggested self-serve price, autonomy fit, biggest risk, cheapest validation test.",
      "End with one winner and why it deserves the first build. Include source names or URLs when available. Be explicit when evidence is weak.",
    ].join(" "),
  });

  const final = await moonshotRequest(env, "/chat/completions", {
    method: "POST",
    timeoutMs: 40_000,
    retries: 1,
    body: {
      model: "kimi-k3",
      messages: synthesisMessages,
      max_completion_tokens: 5000,
      reasoning_effort: "low",
    },
  });

  const finalChoice = final.choices?.[0];
  if (!finalChoice) throw new Error("Kimi returned no synthesis choice");

  return {
    model: final.model,
    result: finalChoice.message?.content ?? "",
    search_calls: allowedCalls.length,
    denied_searches: deniedCount,
    usage: final.usage ?? null,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/chairman/scout" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);
      try {
        const scout = await runBoundedScout(env);
        return json({
          warning: "research evidence is directional, not a guarantee of demand or profitability",
          version: "0.3.4",
          architecture: "one planning turn -> max 4 parallel searches -> one no-tools synthesis turn",
          ...scout,
          external_actions_taken: [],
          next_gate: "review winner before any build",
        });
      } catch (error) {
        return json({ error: error.message, version: "0.3.4" }, 502);
      }
    }

    const response = await base.fetch(request, env, ctx);
    if (url.pathname === "/chairman" && request.method === "GET") {
      const text = await response.text();
      return new Response(text.replaceAll("v0.3.3", "v0.3.4"), { status: response.status, headers: response.headers });
    }
    if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
      try {
        const data = await response.json();
        return json({ ...data, version: "0.3.4", scout_architecture: "bounded_parallel" }, response.status);
      } catch {
        return response;
      }
    }
    return response;
  },
};
