const baseUrl = process.env.FINANCE_AUDIT_URL || "http://127.0.0.1:3000/api/dashboard";
const tolerance = 0.02;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function amount(value) {
  return Number(value || 0);
}

async function dashboard(params = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  assert(response.ok, `Dashboard request failed: ${response.status} ${url}`);
  return response.json();
}

function line(data, section, lineItem) {
  return amount(data.pAndL.find((row) => row.section === section && row.line_item === lineItem)?.amount);
}

function auditExactPnl(data, label) {
  assert(data.meta.pnlCoverage.exact, `${label}: expected exact P&L coverage`);
  const revenue = line(data, "Income", "Total for Income");
  const costOfSales = line(data, "Cost of Sales", "Total for Cost of Sales");
  const grossProfit = line(data, "Cost of Sales", "Gross Profit");
  const otherIncome = line(data, "Other Income(Loss)", "Total for Other Income(Loss)");
  const expenses = line(data, "Expenses", "Total for Expenses");
  const otherExpenses = line(data, "Other Expenses", "Total for Other Expenses");
  const netEarnings = line(data, "Other Expenses", "Net Earnings");

  assert(Math.abs(grossProfit - (revenue - costOfSales)) <= tolerance, `${label}: gross profit does not reconcile`);
  assert(
    Math.abs(netEarnings - (grossProfit + otherIncome - expenses - otherExpenses)) <= tolerance,
    `${label}: net earnings do not reconcile`
  );
  assert(Math.abs(amount(data.kpis.revenue) - revenue) <= tolerance, `${label}: revenue KPI mismatch`);
  assert(Math.abs(amount(data.kpis.gross_profit) - grossProfit) <= tolerance, `${label}: gross profit KPI mismatch`);
  assert(Math.abs(amount(data.kpis.expenses) - expenses) <= tolerance, `${label}: expense KPI mismatch`);
  assert(Math.abs(amount(data.kpis.net_earnings) - netEarnings) <= tolerance, `${label}: net earnings KPI mismatch`);
}

const exactCases = [
  ["full class", { dimension: "class", dateFrom: "2023-01-01", dateTo: "2026-05-22" }],
  ["full customer", { dimension: "customer", dateFrom: "2023-01-01", dateTo: "2026-05-22" }],
  ["April 2026 class", { dimension: "class", dateFrom: "2026-04-01", dateTo: "2026-04-30" }],
];

const exactResults = new Map();
for (const [label, params] of exactCases) {
  const data = await dashboard(params);
  auditExactPnl(data, label);
  exactResults.set(label, data);
}

assert(
  Math.abs(amount(exactResults.get("full class").kpis.revenue) - amount(exactResults.get("full customer").kpis.revenue)) <= tolerance,
  "Class and customer dimensions changed consolidated revenue without an explicit entity filter"
);
assert(
  Math.abs(amount(exactResults.get("full class").kpis.net_earnings) - amount(exactResults.get("full customer").kpis.net_earnings)) <= tolerance,
  "Class and customer dimensions changed consolidated net earnings without an explicit entity filter"
);

const unavailableCases = [
  ["April 2026 customer", { dimension: "customer", dateFrom: "2026-04-01", dateTo: "2026-04-30" }],
  ["May 2026 class", { dimension: "class", dateFrom: "2026-05-01", dateTo: "2026-05-21" }],
  ["calendar 2024 class", { dimension: "class", dateFrom: "2024-01-01", dateTo: "2024-12-31" }],
];

for (const [label, params] of unavailableCases) {
  const data = await dashboard(params);
  assert(!data.meta.pnlCoverage.exact, `${label}: inexact source coverage was marked exact`);
  assert(Object.values(data.kpis).every((value) => value === null), `${label}: estimated KPI escaped the accuracy gate`);
  assert(data.pAndL.length === 0 && data.companyPerformance.length === 0, `${label}: estimated P&L rows escaped the accuracy gate`);
}

const full = await dashboard(exactCases[0][1]);
assert(full.insights.revenueGrowth.status_p2 === "no_prior", "P&L growth should require an exact comparison report");
assert(full.insights.revenueGrowth.growth_p2 === null, "Estimated P&L growth must not be returned");
assert(full.meta.fxPolicy?.basis === "stored_import_rate", "FX conversion basis is missing");

const initialClass = await dashboard({ dimension: "class" });
assert(initialClass.meta.preferredPnlRange?.start === "2026-04-01", "Complete monthly P&L should be the preferred initial range");
assert(initialClass.meta.preferredPnlRange?.end === "2026-04-30", "Preferred monthly P&L end date is wrong");
const historicalBatch = initialClass.meta.batches.find((batch) => batch.name === "Historical backfill 2023-2026");
assert(historicalBatch, "Historical-only regression batch is missing");
const historicalOnly = await dashboard({ dimension: "class", batch: historicalBatch.batch_key });
assert(historicalOnly.meta.preferredPnlRange?.start === "2023-01-01", "Historical-only data should fall back to its exact P&L start");
assert(historicalOnly.meta.preferredPnlRange?.end === "2026-05-22", "Historical-only data should fall back to its exact P&L end");
const quickBatch = initialClass.meta.batches.find((batch) => batch.name === "Quick upload 2026-05-21");
assert(quickBatch, "Quick-upload regression batch is missing");
const mixedCustomerPeriods = await dashboard({ dimension: "customer", batch: quickBatch.batch_key });
assert(mixedCustomerPeriods.meta.pnlScopeCompanyCount === 5, "Quick-upload customer scope should contain five companies");
assert(mixedCustomerPeriods.meta.preferredPnlRange === null, "Mixed customer report periods must not advertise a false exact range");

for (const row of [...full.sku.rows, ...full.sku.brands, ...full.sku.customers]) {
  const costedRevenue = amount(row.costed_revenue);
  const expectedCoverage = amount(row.revenue) ? costedRevenue / amount(row.revenue) : 0;
  assert(Math.abs(amount(row.margin_coverage) - expectedCoverage) <= 0.000001, "SKU margin coverage mismatch");
  if (!costedRevenue) {
    assert(row.gross_profit === null, `Uncosted row exposed a margin: ${row.sku || row.brand || row.customer}`);
  } else if (row.cogs_hkd !== null) {
    const expectedProfit = costedRevenue - amount(row.cogs_hkd);
    assert(Math.abs(amount(row.gross_profit) - expectedProfit) <= tolerance, "SKU costed margin mismatch");
    assert(Math.abs(amount(row.gross_margin) - expectedProfit / costedRevenue) <= 0.000001, "SKU costed margin rate mismatch");
  }
}

const aprilMonthly = await dashboard({
  dimension: "class",
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
  dateFrom2: "2025-04-01",
  dateTo2: "2025-04-30",
  dateFrom3: "2026-02-01",
  dateTo3: "2026-04-30",
});
assert(aprilMonthly.sku.comparison.p3m.start === "2026-02-01", "P3 must start at the first day of the trailing three-month window");
assert(aprilMonthly.sku.comparison.p3m.end === "2026-04-30", "P3 must end on the selected period end date");
assert(aprilMonthly.insights.skuGrowth.growth_p2 !== null, "Monthly P2 sales growth is missing");
assert(aprilMonthly.insights.skuGrowth.growth_p3 !== null, "Trailing P3 sales growth is missing");
for (const row of aprilMonthly.sku.rows.filter((item) => item.growth_status_p3 === "ok")) {
  const expectedValue = amount(row.revenue) * amount(row.growth_p3) / (1 + amount(row.growth_p3));
  assert(Math.abs(amount(row.growth_value_p3) - expectedValue) <= tolerance, `P3 growth dollars are not normalized: ${row.sku}`);
}

console.log(`Finance audit passed: ${exactCases.length} exact P&L cases, dimension parity, ${unavailableCases.length} blocked estimate cases, costed SKU margins, monthly P2/P3 comparisons, and FX basis.`);
