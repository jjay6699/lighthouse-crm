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
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  assert(response.ok, `Dashboard request failed: ${response.status} ${url}`);
  return response.json();
}

function line(data, section, lineItem) {
  return amount(data.pAndL.find((row) => row.section === section && row.line_item === lineItem)?.amount);
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1);
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

const fullClass = exactResults.get("full class");
const fullCustomer = exactResults.get("full customer");
const excludedRevenue = Math.abs(amount(fullCustomer.intercompany?.candidates?.revenue));
const excludedNetEarnings = Math.abs(amount(fullCustomer.intercompany?.candidates?.net_earnings));
assert(excludedRevenue > tolerance, "Customer view should identify intercompany revenue for elimination");
assert(
  Math.abs(amount(fullClass.kpis.revenue) - amount(fullCustomer.kpis.revenue) - excludedRevenue) <= tolerance,
  "Customer-view revenue does not reconcile to the intercompany exclusion"
);
assert(
  Math.abs(amount(fullClass.kpis.net_earnings) - amount(fullCustomer.kpis.net_earnings) - excludedNetEarnings) <= tolerance,
  "Customer-view net earnings do not reconcile to the intercompany exclusion"
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
assert(full.meta.fxPolicy?.basis === "live_refresh_rate", "FX conversion basis is missing");
assert(full.intercompany?.excluded === true, "Intercompany transactions must be excluded from consolidated totals");

const automaticComparisons = await dashboard({
  dimension: "class",
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
});
assert(automaticComparisons.meta.pnlComparison.p2.start === "2026-03-02", "Period A must be the immediately preceding equal-length range");
assert(automaticComparisons.meta.pnlComparison.p2.end === "2026-03-31", "Period A must end the day before the selected period");
assert(daysBetween(automaticComparisons.meta.pnlComparison.p1.start, automaticComparisons.meta.pnlComparison.p1.end) === daysBetween(automaticComparisons.meta.pnlComparison.p2.start, automaticComparisons.meta.pnlComparison.p2.end), "Period A must match the selected period length");
assert(automaticComparisons.meta.pnlComparison.p3.start === "2025-04-01", "Period B must default to the same dates last year");
assert(automaticComparisons.meta.pnlComparison.p3.end === "2025-04-30", "Period B end date is wrong");

const matchedCompanyComparisons = await dashboard({
  dimension: "class",
  dateFrom: "2023-01-01",
  dateTo: "2026-05-22",
  dateFrom2: "2023-01-01",
  dateTo2: "2026-05-22",
  dateFrom3: "2023-01-01",
  dateTo3: "2026-05-22",
});
for (const row of matchedCompanyComparisons.companyPerformance) {
  assert(row.revenue_growth_status_p2 === "ok" && row.revenue_growth_status_p3 === "ok", `Company revenue comparisons are unavailable: ${row.company}`);
  assert(row.net_earnings_growth_status_p2 === "ok" && row.net_earnings_growth_status_p3 === "ok", `Company net earnings comparisons are unavailable: ${row.company}`);
  assert(Math.abs(amount(row.revenue_growth_p2)) <= 0.000001 && Math.abs(amount(row.revenue_growth_p3)) <= 0.000001, `Company revenue comparison is not normalized: ${row.company}`);
  assert(Math.abs(amount(row.net_earnings_growth_p2)) <= 0.000001 && Math.abs(amount(row.net_earnings_growth_p3)) <= 0.000001, `Company net earnings comparison is not normalized: ${row.company}`);
  assert(Math.abs(amount(row.comparison_revenue_p2) - amount(row.revenue)) <= tolerance, `Company Period A revenue does not reconcile: ${row.company}`);
  assert(Math.abs(amount(row.comparison_net_earnings_p2) - amount(row.net_earnings)) <= tolerance, `Company Period A net earnings does not reconcile: ${row.company}`);
}

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

const companyA = "Lighthouse Mart Trading Limited";
const companyB = "Moment Health Limited";
const companyPair = await dashboard({
  dimension: "class",
  company: [companyA, companyB],
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
});
const companyAData = await dashboard({ dimension: "class", company: companyA, dateFrom: "2026-04-01", dateTo: "2026-04-30" });
const companyBData = await dashboard({ dimension: "class", company: companyB, dateFrom: "2026-04-01", dateTo: "2026-04-30" });
assert(companyPair.meta.pnlCoverage.exact, "Two-company selection should retain exact P&L coverage");
assert(companyPair.companyPerformance.length === 2, "Two-company selection should return two company rows");
for (const key of ["revenue", "gross_profit", "expenses", "net_earnings"]) {
  const expected = amount(companyAData.kpis[key]) + amount(companyBData.kpis[key]);
  assert(Math.abs(amount(companyPair.kpis[key]) - expected) <= tolerance, `Two-company ${key} total mismatch`);
}
assert(amount(companyPair.sku.totals.revenue) < amount(full.sku.totals.revenue), "Two-company SKU scope did not narrow revenue");

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

console.log(`Finance audit passed: ${exactCases.length} exact P&L cases, intercompany elimination reconciliation, ${unavailableCases.length} blocked estimate cases, costed SKU margins, Period A/B comparisons, and FX basis.`);
