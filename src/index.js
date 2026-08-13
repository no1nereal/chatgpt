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

async function callKimi(env, messages, maxTokens = 1000) {
  const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
    },
    body: JSON.stringify({
      model: "kimi-k3",
      messages,
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Kimi API error ${response.status}`);
  return data;
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
    main{width:min(880px,100%)}
    .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8d939d}
    h1{font-size:clamp(34px,7vw,68px);margin:8px 0 6px;line-height:.95}
    .sub{color:#a9afb8;margin:0 0 28px;max-width:680px}
    .panel{border:1px solid #252932;background:#101217;border-radius:18px;padding:18px;margin:14px 0}
    label{display:block;font-size:13px;color:#a9afb8;margin-bottom:8px}
    input{box-sizing:border-box;width:100%;padding:13px 14px;border-radius:12px;border:1px solid #303642;background:#080a0d;color:white;font:inherit}
    .buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
    button{border:1px solid #343a46;background:#171a20;color:#fff;border-radius:11px;padding:11px 14px;font:inherit;cursor:pointer}
    button:hover{background:#20242c}
    button.primary{background:#f3f3f3;color:#0b0c0e;border-color:#f3f3f3}
    button:disabled{opacity:.5;cursor:wait}
    pre{white-space:pre-wrap;word-break:break-word;background:#080a0d;border:1px solid #242932;border-radius:14px;padding:16px;min-height:120px;color:#d8dce3}
    .safe{display:inline-flex;gap:8px;align-items:center;color:#9ba2ac;font-size:13px}
    .dot{width:8px;height:8px;border-radius:50%;background:#5ee28a;display:inline-block}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">private control surface · v0.2.1</div>
  <h1>sefi foundry</h1>
  <p class="sub">the creature can think, but it still cannot spend money, contact people, or deploy products. chairman authorization is required for every paid Kimi call.</p>

  <section class="panel">
    <label for="token">chairman token — kept only in this open tab, never saved by this page</label>
    <input id="token" type="password" autocomplete="off" placeholder="paste your chairman token">
    <div class="buttons">
      <button id="ping">check authorization</button>
      <button id="brain">brain test</button>
      <button id="ideas" class="primary">generate 3 business hypotheses</button>
    </div>
  </section>

  <section class="panel">
    <div class="safe"><span class="dot"></span> paid actions locked behind chairman token</div>
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
      const res = await fetch(path, {
        method,
        headers: { 'x-chairman-token': token }
      });
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
        version: "0.2.1",
        deployment_source: "github",
        paid_actions_locked: true,
        capabilities: ["kimi_reasoning", "chairman_cockpit", "business_hypotheses"],
        external_actions_enabled: false,
        kimi_secret_present: Boolean(env.MOONSHOT_API_KEY),
        chairman_secret_present: Boolean(env.CHAIRMAN_TOKEN),
      });
    }

    if (url.pathname === "/chairman" && request.method === "GET") {
      return html(cockpit());
    }

    if (url.pathname === "/chairman/ping") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      return json({ chairman: "recognized", foundry: "ready", version: "0.2.1" });
    }

    if (url.pathname === "/chairman/brain-test" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);

      try {
        const data = await callKimi(env, [
          {
            role: "system",
            content: "You are the reasoning engine inside a tightly controlled autonomous micro-business foundry. Be concise, practical, skeptical, and never claim you performed actions you did not perform.",
          },
          {
            role: "user",
            content: "Return exactly one short sentence confirming you understand that your current job is only to reason, not spend money, deploy products, contact people, or make external changes.",
          },
        ], 150);

        return json({
          foundry: "alive",
          kimi_connected: true,
          model: data.model,
          reply: data.choices?.[0]?.message?.content ?? null,
          usage: data.usage ?? null,
        });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    if (url.pathname === "/chairman/hypotheses" && request.method === "POST") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.MOONSHOT_API_KEY) return json({ error: "missing MOONSHOT_API_KEY" }, 500);

      try {
        const data = await callKimi(env, [
          {
            role: "system",
            content: "You are the opportunity strategist for a tightly controlled autonomous micro-SaaS foundry. The owner wants a mostly autonomous digital business that can eventually reach $10k-$20k monthly profit without sales calls or custom client work. Prefer self-serve software with recurring or usage-based revenue, digitally fulfilled, low legal/regulatory risk, and feasible for AI agents to build and operate. You do NOT have live market research in this task, so label ideas as hypotheses, not validated opportunities. Do not claim you searched the web.",
          },
          {
            role: "user",
            content: "Generate exactly 3 sharply different micro-SaaS business hypotheses. For each include: name, specific buyer, painful repetitive job, product behavior, likely self-serve price, why agents can operate it, biggest risk, and the single cheapest validation experiment. Rank them 1-3. Keep the response compact and practical.",
          },
        ], 1200);

        return json({
          warning: "hypotheses only — not live-market validated yet",
          model: data.model,
          result: data.choices?.[0]?.message?.content ?? null,
          usage: data.usage ?? null,
          next_gate: "wire live research before any product build or ad spend",
        });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
