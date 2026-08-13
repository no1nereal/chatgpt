const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const html = (body) => new Response(body, {
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  },
});

function isAuthorized(request, env) {
  const token = request.headers.get("x-chairman-token");
  return Boolean(env.CHAIRMAN_TOKEN && token && token === env.CHAIRMAN_TOKEN);
}

async function kimiRequest(env, body) {
  const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Kimi API error ${response.status}`);
  return data;
}

async function callKimi(env, messages, { maxCompletionTokens = 6000, reasoningEffort = "low" } = {}) {
  return kimiRequest(env, {
    model: "kimi-k3",
    messages,
    max_completion_tokens: maxCompletionTokens,
    reasoning_effort: reasoningEffort,
  });
}

async function runLiveScout(env) {
  const tools = [{
    type: "builtin_function",
    function: { name: "$web_search" },
  }];

  const messages = [
    {
      role: "system",
      content: [
        "You are Scout-1 inside a tightly controlled autonomous micro-business foundry.",
        "Today is 2026-08-13.",
        "Your job is market discovery only: research the live web and identify self-serve digital products or micro-SaaS opportunities that could plausibly become mostly autonomous.",
        "The owner's target is eventually $10k-$20k monthly profit without sales calls, custom client work, inventory, regulated products, deception, spam, or gray-market tactics.",
        "Prefer boring painful repetitive jobs, existing buyer spend, obvious search intent, recurring or usage-based revenue, and products AI agents can build/support.",
        "Use no more than FOUR web searches total. Seek evidence, not vibes. Do not claim validation beyond what sources support.",
        "You cannot spend money, contact anyone, deploy anything, open accounts, or make external changes.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Scout the live market. Search for concrete pain signals, buyer complaints, existing paid alternatives, pricing, and gaps.",
        "Return exactly 3 ranked opportunities. For each give: specific buyer; repetitive painful job; evidence observed on the live web; existing alternatives/prices when found; proposed tiny product; suggested self-serve pricing; autonomy fit; biggest risk; and cheapest validation test.",
        "End with one winner and a short explanation of why it deserves the first build. Include source URLs or source names when available in your search output.",
      ].join(" "),
    },
  ];

  let searchCalls = 0;
  let lastUsage = null;

  for (let step = 0; step < 8; step++) {
    const data = await kimiRequest(env, {
      model: "kimi-k2.6",
      messages,
      tools,
      max_tokens: 32768,
      thinking: { type: "disabled" },
    });

    lastUsage = data.usage ?? lastUsage;
    const choice = data.choices?.[0];
    if (!choice) throw new Error("Kimi returned no choice");

    if (choice.finish_reason !== "tool_calls") {
      return {
        model: data.model,
        result: choice.message?.content ?? "",
        search_calls: searchCalls,
        usage: lastUsage,
      };
    }

    messages.push(choice.message);

    for (const toolCall of choice.message?.tool_calls ?? []) {
      if (toolCall.function?.name !== "$web_search") {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function?.name || "unknown",
          content: JSON.stringify({ error: "tool not allowed" }),
        });
        continue;
      }

      searchCalls += 1;
      if (searchCalls > 4) throw new Error("Scout safety cap reached: more than 4 web searches requested");

      let args;
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: "$web_search",
        content: JSON.stringify(args),
      });
    }
  }

  throw new Error("Scout stopped after 8 tool-loop steps");
}

function cockpit() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sefi Foundry — Chairman</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark}
    body{margin:0;background:#090a0c;color:#f5f5f5;min-height:100vh;display:grid;place-items:center;padding:24px}
    main{width:min(920px,100%)}
    .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8d939d}
    h1{font-size:clamp(34px,7vw,68px);margin:8px 0 6px;line-height:.95}
    .sub{color:#a9afb8;margin:0 0 28px;max-width:720px}
    .panel{border:1px solid #252932;background:#101217;border-radius:18px;padding:18px;margin:14px 0}
    label{display:block;font-size:13px;color:#a9afb8;margin-bottom:8px}
    input{box-sizing:border-box;width:100%;padding:13px 14px;border-radius:12px;border:1px solid #303642;background:#080a0d;color:white;font:inherit}
    .buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
    button{border:1px solid #343a46;background:#171a20;color:#fff;border-radius:11px;padding:11px 14px;font:inherit;cursor:pointer}
    button:hover{background:#20242c}
    button.primary{background:#f3f3f3;color:#0b0c0e;border-color:#f3f3f3}
    button:disabled{opacity:.5;cursor:wait}
    pre{white-space:pre-wrap;word-break:break-word;background:#080a0d;border:1px solid #242932;border-radius:14px;padding:16px;min-height:150px;color:#d8dce3;line-height:1.4}
    .safe{display:flex;flex-wrap:wrap;gap:14px;align-items:center;color:#9ba2ac;font-size:13px}
    .dot{width:8px;height:8px;border-radius:50%;background:#5ee28a;display:inline-block;margin-right:6px}
    .amber{color:#d7b46a}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">private control surface · v0.3.0</div>
  <h1>sefi foundry</h1>
  <p class="sub">the creature can now think and scout the live web. it still cannot spend ad money, contact people, deploy products, or touch payment accounts.</p>

  <section class="panel">
    <label for="token">chairman token — kept only in this open tab, never saved by this page</label>
    <input id="token" type="password" autocomplete="off" placeholder="paste your chairman token">
    <div class="buttons">
      <button id="ping">check authorization</button>
      <button id="brain">brain test</button>
      <button id="ideas">3 hypotheses</button>
      <button id="scout" class="primary">run live scout · max 4 searches</button>
    </div>
  </section>

  <section class="panel">
    <div class="safe">
      <span><span class="dot"></span>paid calls locked behind chairman token</span>
      <span class="amber">live scout can incur Kimi token + web-search charges</span>
    </div>
    <pre id="output">ready.</pre>
  </section>
</main>
<script>
  const output = document.getElementById('output');
  const tokenInput = document.getElementById('token');
  const buttons = [...document.querySelectorAll('button')];

  async function call(path, method='GET') {
    const token = tokenInput.value.trim();
    if (!token) { output.textContent = 'paste the chairman token first.'; return; }
    buttons.forEach(b => b.disabled = true);
    output.textContent = 'working…';
    try {
      const res = await fetch(path, { method, headers: { 'x-chairman-token': token } });
      const data = await res.json();
      output.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      output.textContent = 'error: ' + err.message;
    } finally {
      buttons.forEach(b => b.disabled = false);
    }
  }

  document.getElementById('ping').onclick = () => call('/chairman/ping');
  document.getElementById('brain').onclick = () => call('/chairman/brain-test', 'POST');
  document.getElementById('ideas').onclick = () => call('/chairman/hypotheses', 'POST');
  document.getElementById('scout').onclick = () => call('/chairman/scout', 'POST');
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        foundry: "alive",
        version: "0.3.0",
        deployment_source: "github",
        paid_actions_locked: true,
        capabilities: ["kimi_reasoning", "chairman_cockpit", "business_hypotheses", "live_web_scout"],
        external_actions_enabled: false,
        live_search_enabled: true,
        scout_search_cap: 4,
        kimi_secret_present: Boolean(env.MOONSHOT_API_KEY),
        chairman_secret_present: Boolean(env.CHAIRMAN_TOKEN),
      });
    }

    if (url.pathname === "/chairman" && request.method === "GET") return html(cockpit());

    if (url.pathname === "/chairman/ping") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      return json({ chairman: "recognized", foundry: "ready", version: "0.3.0" });
    }

    if (url.pathname === "/chairman/brain-test" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);
      try {
        const data = await callKimi(env, [
          { role: "system", content: "You are the reasoning engine inside a tightly controlled autonomous micro-business foundry. Be concise and never claim actions you did not perform." },
          { role: "user", content: "Return exactly one short sentence confirming your current role is reasoning only and you have no authority to spend money, deploy products, contact people, or make external changes." },
        ], { maxCompletionTokens: 1200, reasoningEffort: "low" });
        return json({ foundry: "alive", kimi_connected: true, model: data.model, reply: data.choices?.[0]?.message?.content ?? null, usage: data.usage ?? null });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    if (url.pathname === "/chairman/hypotheses" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);
      try {
        const data = await callKimi(env, [
          { role: "system", content: "You are the opportunity strategist for a tightly controlled autonomous micro-SaaS foundry. The owner wants a mostly autonomous digital business that can eventually reach $10k-$20k monthly profit without sales calls or custom client work. Prefer self-serve software, recurring or usage-based revenue, digital fulfillment, low legal risk, and operations feasible for agents. These are hypotheses only; do not claim live research." },
          { role: "user", content: "Generate exactly 3 sharply different micro-SaaS hypotheses. For each: buyer, repetitive pain, product behavior, likely self-serve price, autonomy fit, biggest risk, cheapest validation test. Rank 1-3 and keep it compact." },
        ], { maxCompletionTokens: 7000, reasoningEffort: "low" });
        return json({ warning: "hypotheses only — not live-market validated", model: data.model, result: data.choices?.[0]?.message?.content ?? null, usage: data.usage ?? null, next_gate: "use live scout before build or ad spend" });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    if (url.pathname === "/chairman/scout" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);
      try {
        const scout = await runLiveScout(env);
        return json({
          warning: "research evidence is directional, not a guarantee of demand or profitability",
          ...scout,
          external_actions_taken: [],
          next_gate: "chairman reviews winner before any build",
        });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
