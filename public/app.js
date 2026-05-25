import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Database,
  FileUp,
  Filter,
  LayoutDashboard,
  LineChart,
  LogOut,
  RefreshCw,
  Search,
  TrendingUp,
  UploadCloud,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartColors = ["#1A7F78", "#E49A38", "#3E6FB1", "#A94867", "#5F9347", "#7861B0"];

function hkd(value) {
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function compact(value) {
  return new Intl.NumberFormat("en-HK", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function pctOrDash(value) {
  return value === null || value === undefined ? "n/a" : pct(value);
}

function hongKongTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function hkdOrDash(value) {
  return value === null || value === undefined ? "n/a" : hkd(value);
}

function margin(row) {
  const revenue = Number(row.revenue || 0);
  return revenue ? `${((Number(row.net_earnings || 0) / revenue) * 100).toFixed(1)}%` : "0.0%";
}

function currentMonthRange() {
  const today = hongKongTodayIso();
  const [year, month] = today.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  return {
    start,
    end: endDate.toISOString().slice(0, 10),
  };
}

function periodLabel(start, end) {
  if (!start && !end) return "No period set";
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

function ContributionList({ rows }) {
  return (
    <div className="contributionList">
      {rows.map((row) => (
        <div className="contributionRow" key={row.company}>
          <div>
            <strong>{row.company}</strong>
            <span>{hkd(row.revenue)} revenue</span>
          </div>
          <em>{pct(row.revenue_share)}</em>
          <div className="barTrack">
            <i style={{ width: `${Math.max(2, row.revenue_share * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightGrid({ insights }) {
  const growthWindow = insights.skuGrowth?.window?.current;
  const growthWindowLabel = growthWindow?.start && growthWindow?.end ? `${growthWindow.start} to ${growthWindow.end}` : "-";
  const cards = [
    {
      label: "Revenue",
      value: hkd(insights.revenueTotal),
      lines: [
        ["Recent vs LY", <Growth value={insights.skuGrowth?.growth_ly} />],
        ["Recent vs P3M", <Growth value={insights.skuGrowth?.growth_p3m} />],
        ["Growth window", growthWindowLabel],
        ["Top company", insights.topRevenueCompany ? `${insights.topRevenueCompany.company} · ${pct(insights.topRevenueCompany.revenue_share)}` : "-"],
        ["Top brand", insights.topRevenueBrand ? `${insights.topRevenueBrand.entity} · ${pct(insights.topRevenueBrand.revenue_share)}` : "-"],
      ],
    },
    {
      label: "Cost of sales",
      value: hkd(insights.costOfSalesTotal),
      lines: [
        ["% revenue", insights.revenueTotal ? pct(Number(insights.costOfSalesTotal || 0) / Number(insights.revenueTotal || 0)) : "0.0%"],
        ["Highest brand", insights.topCostOfSalesBrand ? insights.topCostOfSalesBrand.entity : "-"],
        ["Contribution", insights.topCostOfSalesBrand ? pct(insights.topCostOfSalesBrand.share_of_cost_of_sales) : "-"],
      ],
    },
    {
      label: "Expenses",
      value: hkd(insights.expenseTotal),
      lines: [
        ["% revenue", insights.revenueTotal ? pct(Number(insights.expenseTotal || 0) / Number(insights.revenueTotal || 0)) : "0.0%"],
        ["Highest item", insights.largestExpense?.line_item || "-"],
        ["Contribution", insights.largestExpense ? `${pct(insights.largestExpense.share_of_expenses)} of expenses` : "-"],
      ],
    },
    {
      label: "Net margin",
      value: pct(insights.netMargin),
      lines: [
        ["Net earnings", hkd(insights.netEarnings)],
        ["Best company", insights.bestMarginCompany ? `${insights.bestMarginCompany.company} · ${pct(insights.bestMarginCompany.net_margin)}` : "-"],
        ["Best brand", insights.bestMarginBrand ? `${insights.bestMarginBrand.entity} · ${pct(insights.bestMarginBrand.net_margin)}` : "-"],
      ],
    },
  ];

  return (
    <div className="insightGrid">
      {cards.map((card) => (
        <div className="insightCard" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <div className="insightLines">
            {card.lines.map(([label, value]) => (
              <em key={label}>
                <b>{label}</b>
                <i>{value}</i>
              </em>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceTable({ rows }) {
  const total = rows.reduce(
    (acc, row) => ({
      company: "Total",
      revenue: acc.revenue + Number(row.revenue || 0),
      gross_profit: acc.gross_profit + Number(row.gross_profit || 0),
      expenses: acc.expenses + Number(row.expenses || 0),
      net_earnings: acc.net_earnings + Number(row.net_earnings || 0),
    }),
    { company: "Total", revenue: 0, gross_profit: 0, expenses: 0, net_earnings: 0 }
  );
  total.revenue_share = 1;
  total.gross_margin = total.revenue ? total.gross_profit / total.revenue : 0;
  total.expense_ratio = total.revenue ? total.expenses / total.revenue : 0;
  total.net_margin = total.revenue ? total.net_earnings / total.revenue : 0;
  const tableRows = [...rows, total];

  return (
    <div className="tableWrap compactTable">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Revenue</th>
            <th>Revenue share</th>
            <th>Gross margin</th>
            <th>Expense ratio</th>
            <th>Net margin</th>
            <th>Net earnings</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr className={row.company === "Total" ? "totalRow" : ""} key={row.company}>
              <td>{row.company}</td>
              <td>{hkd(row.revenue)}</td>
              <td>{pct(row.revenue_share)}</td>
              <td><Badge value={row.gross_margin} /></td>
              <td>{pct(row.expense_ratio)}</td>
              <td><Badge value={row.net_margin} /></td>
              <td>{hkd(row.net_earnings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ value }) {
  const tone = value >= 0.25 ? "good" : value >= 0.05 ? "ok" : "weak";
  return <span className={`badge ${tone}`}>{pct(value)}</span>;
}

function ExpenseBars({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.amount || 0)), 1);
  return (
    <div className="expenseBars">
      {rows.map((row) => (
        <div className="expenseRow" key={row.line_item}>
          <div>
            <strong>{row.line_item}</strong>
            <span>{hkd(row.amount)} | {pct(row.share_of_expenses)} of expenses | {pct(row.share_of_revenue)} of revenue</span>
          </div>
          <div className="barTrack">
            <i style={{ width: `${Math.max(2, (Number(row.amount || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrandRevenueMix({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);
  return (
    <div className="brandMixList">
      <div className="brandMixHead">
        <span>Brand</span>
        <span>Revenue</span>
        <span>Margin $</span>
        <span>Share</span>
        <span>vs LY</span>
        <span>vs P3M</span>
      </div>
      {rows.map((row) => (
        <div className="brandMixRow" key={row.brand}>
          <div className="brandMixMain">
            <strong>{row.brand}</strong>
            <span>{hkd(row.revenue)} revenue</span>
            <div className="barTrack">
              <i style={{ width: `${Math.max(2, (Number(row.revenue || 0) / max) * 100)}%` }} />
            </div>
          </div>
          <em>{hkd(row.revenue)}</em>
          <em>{row.gross_profit === null || row.gross_profit === undefined ? "n/a" : hkd(row.gross_profit)}</em>
          <strong>{pct(row.revenue_share)}</strong>
          <Growth value={row.growth_ly} status={row.growth_status_ly} missingLabel="no LY" />
          <Growth value={row.growth_p3m} status={row.growth_status_p3m} missingLabel="no P3M" />
        </div>
      ))}
    </div>
  );
}

function Growth({ value, status, missingLabel = "n/a" }) {
  const numeric = Number(value);
  const empty = value === null || value === undefined || Number.isNaN(numeric);
  const tone = empty ? "na" : numeric >= 0 ? "up" : "down";
  const label = empty && status === "no_prior" ? missingLabel : pctOrDash(value);
  return <span className={`growth ${tone}`}>{label}</span>;
}

const skuSortOptions = [
  { value: "revenue", label: "Sales" },
  { value: "gross_profit", label: "Margin $" },
  { value: "growth_value_ly", label: "Sales growth $ vs LY" },
  { value: "growth_ly", label: "Sales growth % vs LY" },
  { value: "growth_value_p3m", label: "Sales growth $ vs P3M" },
  { value: "growth_p3m", label: "Sales growth % vs P3M" },
];

function sortSkuRows(rows, sortBy) {
  return [...rows].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    const aMissing = aValue === null || aValue === undefined || Number.isNaN(Number(aValue));
    const bMissing = bValue === null || bValue === undefined || Number.isNaN(Number(bValue));
    if (aMissing && bMissing) return Number(b.revenue || 0) - Number(a.revenue || 0);
    if (aMissing) return 1;
    if (bMissing) return -1;
    return Number(bValue || 0) - Number(aValue || 0);
  });
}

function isoDays(start, end) {
  if (!start || !end) return 0;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
}

function BrandSkuView({ sku, filters, setFilters }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("revenue");
  const rows = sortSkuRows(sku.rows.filter((row) =>
    `${row.brand} ${row.sku} ${row.product_name}`.toLowerCase().includes(query.toLowerCase())
  ), sortBy);
  const topRows = rows.slice(0, 8);
  const activeRange = sku.activeRange || {};
  const dataRange = sku.dataRange || {};
  const costCoverage = sku.costCoverage || {};
  const mappedRevenueShare = Number(costCoverage.revenue || 0)
    ? Number(costCoverage.matched_revenue || 0) / Number(costCoverage.revenue || 0)
    : 0;
  const missingCostMap = !Number(costCoverage.valid_cost_rows || 0);
  const lowCostCoverage = !missingCostMap && mappedRevenueShare < 0.7;
  const activeDays = isoDays(activeRange.from, activeRange.to);
  const narrowRange = activeDays > 0 && activeDays <= 7;
  const resetSkuFilters = () => {
    setQuery("");
    setFilters({
      ...filters,
      batch: "all",
      company: "all",
      entity: "all",
      dateFrom: dataRange.min || "",
      dateTo: dataRange.max || "",
    });
  };

  return (
    <section className="summaryStack">
      <section className="skuHeader panel">
        <div>
          <h2>Brand / SKU sales</h2>
          <p>Sales by Product/Service detail, external customers only, converted to HKD.</p>
        </div>
        <div className="skuStats">
          <div>
            <span>SKU revenue</span>
            <strong>{hkd(sku.totals.revenue)}</strong>
          </div>
          <div>
            <span>Units sold</span>
            <strong>{new Intl.NumberFormat("en-HK").format(Number(sku.totals.quantity || 0))}</strong>
          </div>
          <div>
            <span>Brands</span>
            <strong>{sku.totals.brand_count || 0}</strong>
          </div>
          <div>
            <span>SKUs</span>
            <strong>{sku.totals.sku_count || 0}</strong>
          </div>
        </div>
        <p className="sourceNote">
          SKU revenue may not equal P&L revenue because this view shows positive Sales by Product rows only. P&L can include discounts, shipping, funding, service income, credit notes, returns, and accounting adjustments. SKU margin uses mapped SKU COGS and stays n/a when SKU cost is missing.
        </p>
        {(missingCostMap || lowCostCoverage) && (
          <div className="skuRangeNotice warning">
            <div>
              <strong>{missingCostMap ? "SKU COGS mapping is not loaded" : "SKU COGS mapping coverage is incomplete"}</strong>
              <span>
                {missingCostMap
                  ? "Upload MAPPING DATA.xlsx with the Sales by Product files, then reimport finance data."
                  : `${pct(mappedRevenueShare)} of visible SKU revenue has mapped COGS. Rows without COGS show n/a margin.`}
              </span>
            </div>
          </div>
        )}
        <div className={`skuRangeNotice ${narrowRange ? "warning" : ""}`}>
          <div>
            <strong>Showing SKU sales from {activeRange.from || "-"} to {activeRange.to || "-"}</strong>
            <span>
              Available SKU range {dataRange.min || "-"} to {dataRange.max || "-"}
              {sku.comparison?.current?.start ? ` | Growth window ${sku.comparison.current.start} to ${sku.comparison.current.end}` : ""}
            </span>
          </div>
          <button type="button" onClick={resetSkuFilters}>Reset SKU filters</button>
        </div>
      </section>

      <section className="summaryTop">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Brand revenue mix</h2>
              <p>Revenue, margin dollars, share, and growth from Sales by Product reports</p>
            </div>
          </div>
          <BrandRevenueMix rows={sku.brands.slice(0, 15)} />
        </div>
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>SKU search</h2>
              <p>{query ? `${rows.length} matching SKU rows` : "Type to filter, or review top SKUs below"}</p>
            </div>
          </div>
          <label className="search wideSearch">
            <Search size={15} />
            <input value={query} placeholder="Search SKU, product, brand" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="skuResultList">
            {topRows.map((row) => (
              <button className="skuResult" key={`${row.brand}-${row.sku}-${row.product_name}`} type="button" onClick={() => setQuery(row.sku)}>
                <span>{row.brand}</span>
                <strong>{row.product_name}</strong>
                <em>{row.sku} | {hkd(row.revenue)}</em>
                <div className="skuResultMeta">
                  <span>
                    <b>Margin $</b>
                    {hkdOrDash(row.gross_profit)}
                  </span>
                  <span>
                    <b>vs LY</b>
                    <Growth value={row.growth_ly} status={row.growth_status_ly} missingLabel="no LY" />
                  </span>
                  <span>
                    <b>vs P3M</b>
                    <Growth value={row.growth_p3m} status={row.growth_status_p3m} missingLabel="no P3M" />
                  </span>
                </div>
              </button>
            ))}
            {!topRows.length && <p className="emptyMini">No SKU rows match this search.</p>}
          </div>
        </div>
      </section>

      <div className="panel">
        <div className="panelHeader">
          <div>
            <h2>SKU detail</h2>
            <p>{query ? `Filtered by "${query}"` : `Top SKU rows by ${skuSortOptions.find((option) => option.value === sortBy)?.label || "Sales"}`}</p>
          </div>
          <Select label="Sort by" value={sortBy} options={skuSortOptions} onChange={setSortBy} />
        </div>
        <div className="tableWrap compactTable">
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>SKU</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Revenue</th>
                <th>Share</th>
                <th>Avg price</th>
                <th>Margin $</th>
                <th>Growth $ vs LY</th>
                <th>Growth % vs LY</th>
                <th>Growth $ vs P3M</th>
                <th>Growth % vs P3M</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.brand}-${row.sku}-${row.product_name}`}>
                  <td>{row.brand}</td>
                  <td>{row.sku}</td>
                  <td>{row.product_name}</td>
                  <td>{new Intl.NumberFormat("en-HK").format(Number(row.quantity || 0))}</td>
                  <td>{hkd(row.revenue)}</td>
                  <td>{pct(row.revenue_share)}</td>
                  <td>{hkd(row.avg_price)}</td>
                  <td>{row.gross_profit === null || row.gross_profit === undefined ? "n/a" : hkd(row.gross_profit)}</td>
                  <td>{row.growth_value_ly === null || row.growth_value_ly === undefined ? "n/a" : hkd(row.growth_value_ly)}</td>
                  <td><Growth value={row.growth_ly} status={row.growth_status_ly} missingLabel="no LY" /></td>
                  <td>{row.growth_value_p3m === null || row.growth_value_p3m === undefined ? "n/a" : hkd(row.growth_value_p3m)}</td>
                  <td><Growth value={row.growth_p3m} status={row.growth_status_p3m} missingLabel="no P3M" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange, disabled = false }) {
  return (
    <label className="field dateField">
      <span>{label}</span>
      <input type="date" value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Kpi({ title, value, note, icon: Icon }) {
  return (
    <section className="metric">
      <div className="metricIcon">
        <Icon size={18} />
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </section>
  );
}

function EmptyState({ message }) {
  const monthRange = currentMonthRange();
  const [batchName, setBatchName] = useState(`Initial import ${hongKongTodayIso()}`);
  const [periodStart, setPeriodStart] = useState(monthRange.start);
  const [periodEnd, setPeriodEnd] = useState(monthRange.end);
  const [status, setStatus] = useState("");

  async function uploadInitial(files) {
    if (!files.length) return;
    setStatus("Uploading reports...");
    const form = new FormData();
    form.append("batchName", batchName || "Initial import");
    form.append("periodStart", periodStart);
    form.append("periodEnd", periodEnd);
    Array.from(files).forEach((file) => form.append("files", file));

    const upload = await fetch("/api/upload-finance", { method: "POST", body: form }).then((response) => response.json());
    if (!upload.ok) {
      setStatus(upload.message || upload.error || "Upload failed.");
      return;
    }

    setStatus("Building finance database...");
    const imported = await fetch("/api/reimport-finance", { method: "POST" }).then((response) => response.json());
    if (!imported.ok) {
      setStatus(imported.stderr || "Import failed. Check Railway logs.");
      return;
    }

    setStatus(imported.stdout || "Import complete. Reloading...");
    window.location.reload();
  }

  return (
    <main className="empty">
      <Database size={28} />
      <h1>Financial Consolidation</h1>
      <p>{message}</p>
      <label className="field emptyField">
        <span>Batch name</span>
        <input value={batchName} onChange={(event) => setBatchName(event.target.value)} />
      </label>
      <div className="datePair emptyField">
        <DateField label="Batch period from" value={periodStart} onChange={setPeriodStart} />
        <DateField label="Batch period to" value={periodEnd} onChange={setPeriodEnd} />
      </div>
      <label className="primaryButton emptyUpload">
        <input type="file" accept=".xlsx" multiple onChange={(event) => uploadInitial(event.target.files)} />
        <UploadCloud size={16} />
        Upload first finance reports
      </label>
      <small>For local development you can also run: python scripts/import_finance.py</small>
      {status && <p className="notice">{status}</p>}
    </main>
  );
}

function LoadingState() {
  return (
    <main className="loadingScreen">
      <section className="loadingCard" aria-live="polite">
        <p className="eyebrow">Lightmart CRM</p>
        <h1>Loading dashboard</h1>
        <p className="loadingCopy">Preparing finance data.</p>
        <div className="loadingBar" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}

function UploadPanel({ uploadState, onFiles }) {
  const monthRange = currentMonthRange();
  const [batchName, setBatchName] = useState(`Monthly upload ${hongKongTodayIso()}`);
  const [periodStart, setPeriodStart] = useState(monthRange.start);
  const [periodEnd, setPeriodEnd] = useState(monthRange.end);
  return (
    <section className="importPanel">
      <div>
        <div className="sectionTitle">
          <FileUp size={18} />
          <h2>Import new reports</h2>
        </div>
        <p>Upload QuickBooks Profit and Loss, Sales by Product, and MAPPING DATA `.xlsx` files. The system saves them, rebuilds SQLite, and refreshes the dashboard.</p>
        <p>Each upload becomes a separate batch, so new files do not disappear into one untracked pool.</p>
      </div>
      <label className="field">
        <span>Batch name</span>
        <input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="April 2026 closing pack" />
      </label>
      <div className="datePair">
        <DateField label="Batch period from" value={periodStart} onChange={setPeriodStart} />
        <DateField label="Batch period to" value={periodEnd} onChange={setPeriodEnd} />
      </div>
      <label className={`dropzone ${uploadState.busy ? "busy" : ""}`}>
        <input
          type="file"
          accept=".xlsx"
          multiple
          disabled={uploadState.busy}
          onChange={(event) => onFiles(event.target.files, { name: batchName, period_start: periodStart, period_end: periodEnd })}
        />
        <UploadCloud size={24} />
        <strong>Upload Excel reports</strong>
        <span>Include MAPPING DATA.xlsx for SKU margin dollars</span>
      </label>
      {uploadState.message && <p className="notice">{uploadState.message}</p>}
    </section>
  );
}

function BatchManager({ batches, uploadState, onRename, onDelete }) {
  const [editing, setEditing] = useState({});
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h2>Manage batches</h2>
          <p>Rename or delete uploaded report groups</p>
        </div>
      </div>
      <div className="batchList">
        {batches.map((batch) => {
          const locked = batch.batch_key === "initial-import";
          const value = editing[batch.batch_key] ?? {
            name: batch.name,
            period_start: batch.period_start || "",
            period_end: batch.period_end || "",
          };
          return (
            <div className="batchRow" key={batch.batch_key}>
              <div className="batchSummary">
                <strong>{batch.name}</strong>
                <span>{periodLabel(batch.period_start, batch.period_end)}</span>
                <span>{locked ? "Original local source files" : batch.uploaded_at || "Uploaded batch"}</span>
              </div>
              <div className="batchControls">
                <label className="field">
                  <span>Batch name</span>
                  <input
                    value={value.name}
                    disabled={locked || uploadState.busy}
                    onChange={(event) => setEditing({ ...editing, [batch.batch_key]: { ...value, name: event.target.value } })}
                  />
                </label>
                <DateField
                  label="From"
                  value={value.period_start}
                  disabled={locked || uploadState.busy}
                  onChange={(next) => setEditing({ ...editing, [batch.batch_key]: { ...value, period_start: next } })}
                />
                <DateField
                  label="To"
                  value={value.period_end}
                  disabled={locked || uploadState.busy}
                  onChange={(next) => setEditing({ ...editing, [batch.batch_key]: { ...value, period_end: next } })}
                />
                <div className="batchActions">
                  <button
                    type="button"
                    disabled={
                      locked ||
                      uploadState.busy ||
                      (value.name === batch.name && value.period_start === (batch.period_start || "") && value.period_end === (batch.period_end || ""))
                    }
                    onClick={() => onRename(batch.batch_key, value)}
                  >
                    Save
                  </button>
                  <button className="dangerButton" type="button" disabled={locked || uploadState.busy} onClick={() => onDelete(batch.batch_key)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Overview({ data, goFinance }) {
  const reports = data.meta.reports;
  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Lightmart CRM workspace</h1>
          <p className="subtitle">A clean control center for consolidated finance reporting across companies, brands, and customers.</p>
        </div>
        <button className="primaryButton" type="button" onClick={goFinance}>
          <CircleDollarSign size={16} />
          Open financial consolidation
        </button>
      </header>

      <section className="overviewGrid">
        <Kpi title="Companies" value={data.meta.companies.length} note="Source entities loaded" icon={LayoutDashboard} />
        <Kpi title="Reports" value={reports.length} note="Class and customer exports" icon={Database} />
        <Kpi title="Date coverage" value={`${data.meta.dateRange.min || "-"} to ${data.meta.dateRange.max || "-"}`} note="Parsed from report periods" icon={CalendarDays} />
        <Kpi title="Currency" value="HKD" note="Standardized reporting currency" icon={CircleDollarSign} />
      </section>

      <section className="cleanGrid">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>What is available</h2>
              <p>Current CRM modules</p>
            </div>
          </div>
          <div className="moduleList">
            <button className="moduleCard active" type="button" onClick={goFinance}>
              <CircleDollarSign size={18} />
              <strong>Financial Consolidation</strong>
              <span>HKD consolidated P&L analytics with company, brand, customer, date, and section filters.</span>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Source reports</h2>
              <p>Files currently included</p>
            </div>
          </div>
          <div className="compactList">
            {reports.map((report) => (
              <div key={`${report.batch_key}-${report.source_file}`}>
                <strong>{report.company}</strong>
                <span>
                  {report.batch_name}
                  {report.batch_period_start || report.batch_period_end ? ` (${periodLabel(report.batch_period_start, report.batch_period_end)})` : ""}
                  {" | "}
                  {report.dimension} | {report.period_label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function FinancialDashboard({ data, filters, setFilters, search, setSearch, uploadState, uploadFiles, renameBatch, deleteBatch, refresh }) {
  const [subtab, setSubtab] = useState("summary");
  const pnlCoverage = data.meta.pnlCoverage || {};
  const requestedPnlRange = pnlCoverage.requested || {};
  const activePnlRange = pnlCoverage.active || {};
  const showPnlCoverage =
    filters.dateFrom ||
    filters.dateTo ||
    (pnlCoverage.reportCount && !pnlCoverage.exact);
  const pnlCoverageMessage = pnlCoverage.reportCount
    ? `P&L is calculated from the best matching report periods ${activePnlRange.min || "-"} to ${activePnlRange.max || "-"} for the selected range ${requestedPnlRange.from || "-"} to ${requestedPnlRange.to || "-"}.`
    : `No P&L report period overlaps the selected range ${requestedPnlRange.from || "-"} to ${requestedPnlRange.to || "-"}. Upload or reimport reports for that period to show P&L values.`;

  const companyOptions = [
    { value: "all", label: "All companies" },
    ...data.meta.companies.map((company) => ({ value: company.name, label: company.name })),
  ];
  const dimensionOptions = data.meta.dimensions.map((dimension) => ({
    value: dimension,
    label: dimension === "class" ? "By class / brand" : "By customer",
  }));
  const entityOptions = [
    { value: "all", label: "All brands/customers" },
    ...data.meta.entities.map((entity) => ({ value: entity, label: entity })),
  ];
  const sectionOptions = [
    { value: "all", label: "All sections" },
    ...data.meta.sections.map((section) => ({ value: section, label: section })),
  ];
  const batchOptions = [
    { value: "all", label: "All batches" },
    ...data.meta.batches.map((batch) => ({
      value: batch.batch_key,
      label: batch.period_start || batch.period_end ? `${batch.name} (${periodLabel(batch.period_start, batch.period_end)})` : batch.name,
    })),
  ];

  const filteredLines = data.lines.filter((row) => `${row.line_item} ${row.section}`.toLowerCase().includes(search.toLowerCase()));
  const revenueBase = Number(data.kpis.revenue || 0);
  const grossMargin = revenueBase ? Number(data.kpis.gross_profit || 0) / revenueBase : 0;
  const expenseRatio = revenueBase ? Number(data.kpis.expenses || 0) / revenueBase : 0;
  const netMargin = revenueBase ? Number(data.kpis.net_earnings || 0) / revenueBase : 0;
  const skuRevenue = Number(data.sku?.totals?.revenue || 0);
  const skuCogs = data.sku?.totals?.cogs_hkd === null || data.sku?.totals?.cogs_hkd === undefined
    ? null
    : Number(data.sku.totals.cogs_hkd || 0);
  const skuGrossProfit = skuCogs === null ? null : skuRevenue - skuCogs;
  const skuGrossMargin = skuGrossProfit === null || !skuRevenue ? null : skuGrossProfit / skuRevenue;
  const statementContext = [
    filters.company !== "all" ? filters.company : "All companies",
    filters.entity !== "all" ? filters.entity : filters.dimension === "class" ? "All brands" : "All customers",
  ].join(" / ");
  const metricCards = subtab === "sku"
    ? [
        { title: "SKU revenue", value: hkd(skuRevenue), note: "Sales by Product rows", icon: TrendingUp },
        { title: "SKU gross margin", value: pctOrDash(skuGrossMargin), note: skuGrossProfit === null ? "COGS mapping needed" : hkd(skuGrossProfit), icon: LineChart },
        { title: "Units sold", value: new Intl.NumberFormat("en-HK").format(Number(data.sku?.totals?.quantity || 0)), note: "Filtered transaction dates", icon: WalletCards },
        { title: "SKUs", value: new Intl.NumberFormat("en-HK").format(Number(data.sku?.totals?.sku_count || 0)), note: `${data.sku?.totals?.brand_count || 0} brands`, icon: BarChart3 },
      ]
    : [
        { title: "Revenue", value: hkd(data.kpis.revenue), note: "Total for Income", icon: TrendingUp },
        { title: "Gross margin", value: pct(grossMargin), note: hkd(data.kpis.gross_profit), icon: LineChart },
        { title: "Expense ratio", value: pct(expenseRatio), note: hkd(data.kpis.expenses), icon: WalletCards },
        { title: "Net margin", value: pct(netMargin), note: hkd(data.kpis.net_earnings), icon: CircleDollarSign },
      ];

  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Financial Consolidation</p>
          <h1>Profit and loss analytics</h1>
          <p className="subtitle">Consolidated HKD dashboard with controls for period, company, view, entity, and P&L section.</p>
        </div>
        <div className="headerActions">
          <button className="primaryButton" type="button" onClick={() => setSubtab("import")}>
            <UploadCloud size={16} />
            Upload reports
          </button>
          <button className="ghostButton" type="button" onClick={refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <section className="filterBar">
        <Select label="Batch" value={filters.batch} options={batchOptions} onChange={(value) => setFilters({ ...filters, batch: value })} />
        <Select label="View" value={filters.dimension} options={dimensionOptions} onChange={(value) => setFilters({ ...filters, dimension: value, entity: "all" })} />
        <Select label="Company" value={filters.company} options={companyOptions} onChange={(value) => setFilters({ ...filters, company: value })} />
        <Select label="Brand / customer" value={filters.entity} options={entityOptions} onChange={(value) => setFilters({ ...filters, entity: value })} />
        <DateField label="From" value={filters.dateFrom} onChange={(value) => setFilters({ ...filters, dateFrom: value })} />
        <DateField label="To" value={filters.dateTo} onChange={(value) => setFilters({ ...filters, dateTo: value })} />
      </section>
      <p className="filterHelp">
        Batch keeps uploads separate. Date filters use full P&L report periods and transaction dates for Brand / SKU sales. Internal intercompany transactions are excluded from consolidated reporting.
      </p>
      {subtab !== "sku" && showPnlCoverage && <p className={`coverageNotice ${pnlCoverage.reportCount ? "" : "warning"}`}>{pnlCoverageMessage}</p>}

      <section className="metricGrid">
        {metricCards.map((card) => (
          <Kpi title={card.title} value={card.value} note={card.note} icon={card.icon} key={card.title} />
        ))}
      </section>
      <nav className="subtabs">
        {[
          ["summary", "Summary"],
          ["sku", "Brand / SKU"],
          ["lines", "P&L lines"],
          ["import", "Import"],
        ].map(([id, label]) => (
          <button className={subtab === id ? "active" : ""} type="button" onClick={() => setSubtab(id)} key={id}>
            {label}
          </button>
        ))}
      </nav>

      {subtab === "summary" && (
        <section className="summaryStack">
          <div className="summaryTop">
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Revenue contribution</h2>
                  <p>Share of total revenue by company</p>
                </div>
              </div>
              <ContributionList rows={data.companyPerformance} />
            </div>
            <div className="panel">
              <div className="panelHeader">
                <div>
                  <h2>Management insights</h2>
                  <p>Auto-highlighted from the current filters</p>
                </div>
              </div>
              <InsightGrid insights={data.insights} />
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Company profitability</h2>
                <p>Margins and ratios make companies easier to compare than bars</p>
              </div>
            </div>
            <PerformanceTable rows={data.companyPerformance} />
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Top expense categories</h2>
                <p>Amount, share of expenses, and % of revenue</p>
              </div>
            </div>
            <ExpenseBars rows={data.expenses.slice(0, 8)} />
          </div>
        </section>
      )}

      {subtab === "lines" && (
        <section className="cleanGrid statementGrid">
          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Consolidated P&L statement</h2>
                <p>Management view in HKD, ordered by source statement structure</p>
                <div className="contextLabel">
                  <span>Showing</span>
                  <strong>{statementContext}</strong>
                </div>
              </div>
              <Select label="P&L section" value={filters.section} options={sectionOptions} onChange={(value) => setFilters({ ...filters, section: value })} />
              <label className="search">
                <Search size={15} />
                <input value={search} placeholder="Search P&L" onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>
            <ProfitLossStatement
              rows={data.pAndL.filter((row) =>
                `${row.line_item} ${row.section}`.toLowerCase().includes(search.toLowerCase())
              )}
              revenueBase={revenueBase}
              comparison={data.meta.pnlComparison}
            />
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Largest line items</h2>
                <p>Quick scan by absolute value</p>
              </div>
            </div>
            <div className="lineTiles">
              {filteredLines.slice(0, 8).map((row) => (
                <div className="lineTile" key={`${row.section}-${row.line_item}`}>
                  <span>{row.section}</span>
                  <strong>{row.line_item}</strong>
                  <em>{hkd(row.amount)}</em>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {subtab === "sku" && <BrandSkuView sku={data.sku} filters={filters} setFilters={setFilters} />}

      {subtab === "import" && (
        <section className="cleanGrid">
          <UploadPanel uploadState={uploadState} onFiles={uploadFiles} />
          <BatchManager batches={data.meta.batches} uploadState={uploadState} onRename={renameBatch} onDelete={deleteBatch} />
          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Source reports</h2>
                <p>Included in consolidation</p>
              </div>
            </div>
            <div className="compactList">
              {data.meta.reports.map((report) => (
                <div key={`${report.batch_key}-${report.source_file}`}>
                  <strong>{report.company}</strong>
                  <span>
                    {report.batch_name}
                    {report.batch_period_start || report.batch_period_end ? ` (${periodLabel(report.batch_period_start, report.batch_period_end)})` : ""}
                    {" | "}
                    {report.dimension} | {report.period_label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function ProfitLossStatement({ rows, revenueBase, comparison }) {
  const [expanded, setExpanded] = useState({ Income: true });
  const [expandedExpenses, setExpandedExpenses] = useState({});
  const growthWindow = comparison?.current;
  const growthWindowLabel = growthWindow?.start && growthWindow?.end ? `${growthWindow.start} to ${growthWindow.end}` : "";
  const groups = rows.reduce((acc, row) => {
    if (!acc[row.section]) acc[row.section] = [];
    acc[row.section].push(row);
    return acc;
  }, {});

  function sectionAmount(section, sectionRows) {
    const preferred = {
      Income: "Total for Income",
      "Cost of Sales": "Gross Profit",
      "Other Income(Loss)": "Total for Other Income(Loss)",
      Expenses: "Total for Expenses",
      "Other Expenses": "Net Earnings",
    }[section];
    const row = sectionRows.find((item) => item.line_item === preferred) || sectionRows.find((item) => item.is_total);
    return row ? row.amount : sectionRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  return (
    <div className="statement">
      {growthWindowLabel && <div className="statementNote">Growth window {growthWindowLabel}</div>}
      <div className="statementHead">
        <span>Account</span>
        <span>HKD</span>
        <span>% revenue</span>
        <span>vs LY</span>
        <span>vs P3M</span>
      </div>
      {Object.entries(groups).map(([section, sectionRows]) => {
        const open = !!expanded[section];
        const amount = sectionAmount(section, sectionRows);
        const sectionPct = revenueBase ? `${((Number(amount || 0) / revenueBase) * 100).toFixed(1)}%` : "-";
        const visibleRows = open
          ? sectionRows
          : sectionRows.filter((row) => row.line_item === "Gross Profit" || row.line_item === "Net Earnings");

        return (
          <React.Fragment key={section}>
            <button className="statementSection" type="button" onClick={() => setExpanded({ ...expanded, [section]: !open })}>
              <span>{open ? "-" : "+"} {section}</span>
              <strong>{hkd(amount)}</strong>
              <em>{sectionPct}</em>
              <i />
              <i />
            </button>
            {visibleRows.map((row) => {
              const rowPct = revenueBase ? `${((Number(row.amount || 0) / revenueBase) * 100).toFixed(1)}%` : "-";
              const isKeyTotal = row.line_item === "Gross Profit" || row.line_item === "Net Earnings";
              const expenseKey = `${row.section}-${row.line_item}`;
              const contributors = row.expense_contributors || [];
              const showContributors = row.section === "Expenses" && contributors.length > 0;
              const contributorsOpen = !!expandedExpenses[expenseKey];
              return (
                <React.Fragment key={`${row.section}-${row.line_item}`}>
                  <div className={`statementRow ${row.is_total ? "total" : ""} ${isKeyTotal ? "keyTotal" : ""}`}>
                    <span>
                      {showContributors && (
                        <button
                          className="rowToggle"
                          type="button"
                          aria-label={`${contributorsOpen ? "Hide" : "Show"} contributors for ${row.line_item}`}
                          onClick={() => setExpandedExpenses({ ...expandedExpenses, [expenseKey]: !contributorsOpen })}
                        >
                          {contributorsOpen ? "-" : "+"}
                        </button>
                      )}
                      {row.line_item}
                    </span>
                    <strong>{hkd(row.amount)}</strong>
                    <em>{rowPct}</em>
                    <Growth value={row.growth_ly} status={row.growth_status_ly} missingLabel="no LY" />
                    <Growth value={row.growth_p3m} status={row.growth_status_p3m} missingLabel="no P3M" />
                  </div>
                  {showContributors && contributorsOpen && (
                    <div className="expenseContributors">
                      {contributors.map((item) => (
                        <div className="expenseContributor" key={`${expenseKey}-${item.company}-${item.entity}`}>
                          <span>{item.company}</span>
                          <strong>{item.entity}</strong>
                          <em>{hkd(item.amount)}</em>
                          <i>{pct(item.share_of_line)}</i>
                        </div>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [filters, setFilters] = useState({
    batch: "all",
    dimension: "class",
    company: "all",
    entity: "all",
    section: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadState, setUploadState] = useState({ busy: false, message: "" });
  const [datesInitialized, setDatesInitialized] = useState(false);
  const loadRequestId = useRef(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  async function load() {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?${query}`);
      const nextData = await response.json();
      if (requestId === loadRequestId.current) {
        setData(nextData);
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    load();
  }, [query]);

  useEffect(() => {
    if (!data?.ready || datesInitialized) return;
    const defaultRange = data.meta.availableDateRange || data.meta.skuDateRange || data.meta.dateRange || {};
    if (defaultRange.min || defaultRange.max) {
      setDatesInitialized(true);
      setFilters((current) => ({
        ...current,
        dateFrom: current.dateFrom || defaultRange.min || "",
        dateTo: current.dateTo || defaultRange.max || "",
      }));
    }
  }, [data, datesInitialized]);

  async function uploadFiles(files, batchDetails) {
    if (!files.length) return;
    setUploadState({ busy: true, message: "Uploading reports..." });
    const form = new FormData();
    const details = typeof batchDetails === "string" ? { name: batchDetails } : batchDetails || {};
    form.append("batchName", details.name || `Upload ${new Date().toISOString().slice(0, 10)}`);
    form.append("periodStart", details.period_start || "");
    form.append("periodEnd", details.period_end || "");
    Array.from(files).forEach((file) => form.append("files", file));

    const upload = await fetch("/api/upload-finance", { method: "POST", body: form }).then((response) => response.json());
    if (!upload.ok) {
      setUploadState({ busy: false, message: upload.message || upload.error || "Upload failed." });
      return;
    }

    await rebuildDatabase();
  }

  async function rebuildDatabase() {
    setLoading(true);
    setUploadState({ busy: true, message: "Rebuilding finance database..." });
    try {
      const imported = await fetch("/api/reimport-finance", { method: "POST" }).then((response) => response.json());
      setUploadState({ busy: false, message: imported.ok ? imported.stdout : imported.stderr || "Reimport failed." });
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function renameBatch(batchKey, details) {
    setUploadState({ busy: true, message: "Saving batch..." });
    const result = await fetch(`/api/batches/${encodeURIComponent(batchKey)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(typeof details === "string" ? { name: details } : details),
    }).then((response) => response.json());
    setUploadState({ busy: false, message: result.ok ? result.stdout || "Batch updated." : result.error || result.stderr || "Batch update failed." });
    await load();
  }

  async function deleteBatch(batchKey) {
    const confirmed = window.confirm("Delete this batch and rebuild the dashboard database?");
    if (!confirmed) return;
    setUploadState({ busy: true, message: "Deleting batch..." });
    const result = await fetch(`/api/batches/${encodeURIComponent(batchKey)}`, { method: "DELETE" }).then((response) => response.json());
    setUploadState({ busy: false, message: result.ok ? result.stdout || "Batch deleted." : result.error || result.stderr || "Batch delete failed." });
    await load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!data) return <LoadingState />;
  if (!data.ready) return <EmptyState message={data.message || data.error || "Finance database is not ready."} />;

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <strong>Lightmart CRM</strong>
          <span>Consolidated finance</span>
        </div>
        <nav className="mainNav">
          <button className={page === "overview" ? "active" : ""} type="button" onClick={() => setPage("overview")}>
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button className={page === "finance" ? "active" : ""} type="button" onClick={() => setPage("finance")}>
            <CircleDollarSign size={18} />
            Financial Consolidation
          </button>
        </nav>
        <div className="sidePanel">
          <span>Currency standard</span>
          <strong>HKD</strong>
          <small>{data.meta.fx.map((rate) => `${rate.source_currency}->HKD ${Number(rate.rate).toFixed(4)}`).join(" | ")}</small>
        </div>
        <button className="logoutButton" type="button" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      {page === "overview" ? (
        <Overview data={data} goFinance={() => setPage("finance")} />
      ) : (
        <FinancialDashboard
          data={data}
          filters={filters}
          setFilters={setFilters}
          search={search}
          setSearch={setSearch}
          uploadState={uploadState}
          uploadFiles={uploadFiles}
          renameBatch={renameBatch}
          deleteBatch={deleteBatch}
          refresh={rebuildDatabase}
        />
      )}

      {loading && <div className="loading">Updating dashboard...</div>}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
