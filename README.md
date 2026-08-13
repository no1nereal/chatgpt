# sefi foundry

cloudflare worker skeleton for a tightly controlled autonomous micro-business foundry.

## current safety posture

- public health endpoint is free and harmless
- paid kimi calls require a separate `CHAIRMAN_TOKEN`
- `MOONSHOT_API_KEY` stays in cloudflare secrets
- no spending, outreach, deployment, billing, or external write actions are autonomous yet

## cloudflare secrets

set these in the worker dashboard:

- `MOONSHOT_API_KEY`
- `CHAIRMAN_TOKEN`

## endpoints

- `GET /health`
- `GET /chairman/ping` with header `x-chairman-token`
- `POST /chairman/brain-test` with header `x-chairman-token`

## deployment

connect this repository to the existing `sefi-foundry` cloudflare worker using workers builds / git integration. use the repository root and deploy command `npx wrangler deploy` if prompted.
