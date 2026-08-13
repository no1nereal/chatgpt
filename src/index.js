const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

function isAuthorized(request, env) {
  const token = request.headers.get("x-chairman-token");
  return Boolean(env.CHAIRMAN_TOKEN && token && token === env.CHAIRMAN_TOKEN);
}

async function callKimi(env, messages, temperature = 0.2) {
  const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
    },
    body: JSON.stringify({
      model: "kimi-k3",
      messages,
      temperature,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Kimi API error ${response.status}`);
  return data;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        foundry: "alive",
        version: "0.1.0",
        paid_actions_locked: true,
        kimi_secret_present: Boolean(env.MOONSHOT_API_KEY),
      });
    }

    if (url.pathname === "/chairman/ping") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      return json({ chairman: "recognized", foundry: "ready" });
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
        ]);

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

    return json({ error: "not found" }, 404);
  },
};
