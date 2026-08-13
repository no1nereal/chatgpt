export const POLICY = Object.freeze({
  version: "1.0.0",
  objective: "Build and operate self-serve digital products that can generate profit for the owner while remaining inside externally enforced limits.",

  // The runtime model never receives credentials that can change this controller,
  // its own limits, or its own tool permissions.
  controller_self_modification: false,
  controller_repo_write_access_for_agents: false,
  permission_escalation_by_agents: false,
  credential_creation_by_agents: false,
  logging_disable_by_agents: false,

  autonomy: {
    market_research: true,
    product_design: true,
    product_code_generation: true,
    product_qa: true,
    product_deployment: false,
    customer_support: false,
    refunds: false,
    paid_marketing: false,
    outbound_sales_or_cold_contact: false,
    payment_account_changes: false,
    bank_transfers: false,
  },

  hard_caps: {
    live_experiments: 3,
    new_products_per_24h: 1,
    scout_web_searches_per_run: 4,
    external_spend_usd_per_24h: 0,
    automatic_refund_usd_per_transaction: 0,
    spawned_agents: 0,
  },

  future_autonomy_rules: {
    // These can only be changed by changing controller code outside the agent runtime.
    max_external_spend_usd_per_24h: 25,
    max_automatic_refund_usd_per_transaction: 25,
    max_spawned_agents: 5,
    max_live_experiments: 3,
    max_reinvestment_fraction_of_realized_revenue: 0.20,
    revenue_does_not_auto_raise_caps: true,
    agent_cannot_modify_these_rules: true,
  },

  prohibited: [
    "deception or impersonation",
    "spam or unsolicited bulk outreach",
    "regulated or illegal goods/services",
    "credential exfiltration",
    "self-replication outside explicit caps",
    "attempts to bypass authorization, budgets, logging, or shutdown controls",
  ],
});

export function publicPolicy() {
  return JSON.parse(JSON.stringify(POLICY));
}
