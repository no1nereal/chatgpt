import legacyWorker from "./index.js";

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthorized(request, env) {
  const token = request.headers.get("x-chairman-token");
  return Boolean(env.CHAIRMAN_TOKEN && token && token === env.CHAIRMAN_TOKEN);
}

function retryDelayMs(message) {
  const match = String(message || "").match(/after\s+(\d+)\s+seconds?/i);
  return Math.min(Math.max(Number(match?.[1] || 1), 1), 5) * 1000;
}

async function moonshotRequest(env, path, { method = "GET", body, timeoutMs = 45_000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const options = {
        method,
        headers: {
          authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(`https://api.moonshot.ai/v1${path}`, options);
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
      await sleep(1000);
    }
  }
  throw lastError || new Error("Moonshot request failed");
}

async function runLiveScout(env) {
  const formulaUri = "moonshot/web-search:latest";
  const toolDeclaration = await moonshotRequest(env, `/formulas/${formulaUri}/tools`);
  const tools = toolDeclaration?.tools;
  if (!Array.isArray(tools) || !tools.length) throw new Error("Kimi web-search tool declaration was empty");

  const messages = [
    {
      role: "system",
      content: [
        "You are Scout-1 inside a tightly controlled autonomous micro-business foundry.",
        "Today is 2026-08-13.",
        "Research the live web for self-serve digital product or micro-SaaS opportunities that could become mostly autonomous.",
        "Target eventually $10k-$20k monthly profit without sales calls, custom client work, inventory, regulated products, deception, spam, or gray-market tactics.",
        "Prefer boring repetitive pain, existing buyer spend, obvious search intent, recurring or usage-based revenue, and products agents can build/support.",
        "You have an absolute budget of FOUR executed web searches. Combine queries aggressively. If the budget is exhausted, synthesize from existing evidence.",
        "You cannot spend money, contact anyone, deploy anything, open accounts, or make external changes.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Scout the live market and return exactly 3 ranked opportunities.",
        "For each include: buyer, repetitive pain, live-web evidence, alternatives/prices when found, tiny product, suggested self-serve price, autonomy fit, biggest risk, cheapest validation test.",
        "End with one winner and why it deserves the first build. Include source names or URLs when available.",
      ].join(" "),
    },
  ];

  let searchCalls = 0;
  let lastUsage = null;

  for (let step = 0; step < 6; step++) {
    const body = {
      model: "kimi-k3",
      messages,
      max_completion_tokens: 5000,
      reasoning_effort: "low",
    };

    if (searchCalls < 4) body.tools = tools;
    else {
      messages.push({
        role: "user",
        content: "The web-search budget is exhausted. Do not request more tools. Produce the final ranked report now using only the evidence already gathered.",
      });
    }

    const data = await moonshotRequest(env, "/chat/completions", { method: "POST", body });
    lastUsage = data.usage ?? lastUsage;
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Kimi returned no choice");

    const assistantMessage = choice.message || {};
    const toolCalls = assistantMessage.tool_calls || [];

    if (!toolCalls.length) {
      return {
        model: data.model,
        result: assistantMessage.content ?? "",
        search_calls: searchCalls,
        usage: lastUsage,
      };
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const fn = toolCall?.function;

      if (!fn || fn.name !== "web_search") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "tool denied: only web_search is available to Scout-1" }),
        });
        continue;
      }

      if (searchCalls >= 4) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "web-search budget exhausted; synthesize final answer from existing evidence" }),
        });
        continue;
      }

      // Exactly one POST is allowed per counted search. No automatic retry here,
      // so a lost response cannot silently execute the same search twice.
      searchCalls += 1;
      const fiber = await moonshotRequest(env, `/formulas/${formulaUri}/fibers`, {
        method: "POST",
        retries: 0,
        timeoutMs: 30_000,
        body: {
          name: fn.name,
          arguments: fn.arguments,
        },
      });

      if (fiber?.status && fiber.status !== "succeeded") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `web search failed with status ${fiber.status}` }),
        });
        continue;
      }

      const context = fiber?.context || {};
      const result = context.output || context.encrypted_output || "";
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result || JSON.stringify({ error: "web search returned no output" }),
      });
    }
  }

  throw new Error("Scout stopped after 6 model turns without a final answer");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/chairman/scout" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);

      try {
        const scout = await runLiveScout(env);
        return json({
          warning: "research evidence is directional, not a guarantee of demand or profitability",
          ...scout,
          external_actions_taken: [],
          hard_search_cap: 4,
          next_gate: "chairman reviews winner before any build",
        });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    return legacyWorker.fetch(request, env, ctx);
  },
};
