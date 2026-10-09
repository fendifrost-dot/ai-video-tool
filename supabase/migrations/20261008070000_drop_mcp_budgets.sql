-- ============================================================================
-- DROP MCP BUDGETS — the owner's decision, 8 Oct 2026: "remove all budgets in
-- the tool … budget limitations are not needed". Spend is controlled on the
-- provider accounts themselves; avt-mcp calls functions as the owner with no
-- reservation, cap or ledger. Reverses 20261008040000_mcp_budgets.sql exactly.
-- ============================================================================
drop function if exists public.mcp_settle(uuid, text, numeric, integer, jsonb);
drop function if exists public.mcp_reserve(uuid, uuid, uuid, text, numeric, numeric, uuid, jsonb);
drop function if exists public.mcp_budget_committed(uuid);
drop table if exists public.mcp_spend;
drop table if exists public.mcp_budgets;
