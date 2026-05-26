import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileUp,
  Filter,
  LayoutDashboard,
  LineChart,
  LogOut,
  X,
  RefreshCw,
  Search,
  TrendingUp,
  UploadCloud,
  WalletCards,
  Receipt,
  Package,
  Tags,
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

function jsShiftDate(val, { years = 0, months = 0, days = 0 }) {
  if (!val) return "";
  const d = new Date(`${val}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
          <div className="rowMeta">
            <strong>{row.company}</strong>
            <span className="amountBadge">
              <span className="amountText">{hkd(row.revenue)}</span>
              <span className="percentagePill">{pct(row.revenue_share)}</span>
            </span>
          </div>
          <div className="barTrack">
            <i style={{ width: `${Math.max(2, row.revenue_share * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightGrid({ insights }) {
  const cards = [
    {
      label: "Revenue",
      value: hkd(insights.revenueTotal),
      lines: [
        ["Growth vs P2", <Growth value={insights.skuGrowth?.growth_p2} />],
        ["Growth vs P3", <Growth value={insights.skuGrowth?.growth_p3} />],
        [
          "Top company",
          insights.topRevenueCompany ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.topRevenueCompany.company}</span>
              <span className="insightPercentageBadge">{pct(insights.topRevenueCompany.revenue_share)}</span>
            </span>
          ) : "-"
        ],
        [
          "Top brand",
          insights.topRevenueBrand ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.topRevenueBrand.entity}</span>
              <span className="insightPercentageBadge">{pct(insights.topRevenueBrand.revenue_share)}</span>
            </span>
          ) : "-"
        ]
      ],
    },
    {
      label: "Cost of sales",
      value: hkd(insights.costOfSalesTotal),
      lines: [
        [
          "% revenue",
          insights.revenueTotal ? (
            <span className="insightPercentageBadge highlight">{pct(Number(insights.costOfSalesTotal || 0) / Number(insights.revenueTotal || 0))}</span>
          ) : "0.0%"
        ],
        [
          "Highest brand",
          insights.topCostOfSalesBrand ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.topCostOfSalesBrand.entity}</span>
              <span className="insightPercentageBadge">{pct(insights.topCostOfSalesBrand.share_of_cost_of_sales)}</span>
            </span>
          ) : "-"
        ]
      ],
    },
    {
      label: "Expenses",
      value: hkd(insights.expenseTotal),
      lines: [
        [
          "% revenue",
          insights.revenueTotal ? (
            <span className="insightPercentageBadge highlight">{pct(Number(insights.expenseTotal || 0) / Number(insights.revenueTotal || 0))}</span>
          ) : "0.0%"
        ],
        [
          "Highest item",
          insights.largestExpense ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.largestExpense.line_item}</span>
              <span className="insightPercentageBadge">{pct(insights.largestExpense.share_of_expenses)}</span>
            </span>
          ) : "-"
        ]
      ],
    },
    {
      label: "Net margin",
      value: pct(insights.netMargin),
      lines: [
        ["Net earnings", <strong className="insightEarningsText">{hkd(insights.netEarnings)}</strong>],
        [
          "Best company",
          insights.bestMarginCompany ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.bestMarginCompany.company}</span>
              <span className="insightPercentageBadge positive">{pct(insights.bestMarginCompany.net_margin)}</span>
            </span>
          ) : "-"
        ],
        [
          "Best brand",
          insights.bestMarginBrand ? (
            <span className="insightValueWrap">
              <span className="insightName">{insights.bestMarginBrand.entity}</span>
              <span className="insightPercentageBadge positive">{pct(insights.bestMarginBrand.net_margin)}</span>
            </span>
          ) : "-"
        ]
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
          <div className="rowMeta">
            <strong>{row.line_item}</strong>
            <span className="amountBadge">
              <span className="amountText">{hkd(row.amount)}</span>
              <span className="percentagePill muted">{pct(row.share_of_expenses)} share</span>
              <span className="percentagePill blue">{pct(row.share_of_revenue)} rev</span>
            </span>
          </div>
          <div className="barTrack expenseTrack">
            <i style={{ width: `${Math.max(2, (Number(row.amount || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EntityRevenueMix({ rows, entityLabel = "Brand" }) {
  const max = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);
  return (
    <div className="brandMixList">
      <div className="brandMixHead">
        <span>{entityLabel}</span>
        <span>Revenue</span>
        <span>Margin $</span>
        <span>Share</span>
        <span>vs P2</span>
        <span>vs P3</span>
      </div>
      {rows.map((row) => {
        const name = row.brand || row.customer || "Unmapped";
        return (
          <div className="brandMixRow" key={name}>
            <div className="brandMixMain">
              <strong>{name}</strong>
              <span>{hkd(row.revenue)} revenue</span>
              <div className="barTrack">
                <i style={{ width: `${Math.max(2, (Number(row.revenue || 0) / max) * 100)}%` }} />
              </div>
            </div>
            <em>{hkd(row.revenue)}</em>
            <em>{row.gross_profit === null || row.gross_profit === undefined ? "n/a" : hkd(row.gross_profit)}</em>
            <strong>{pct(row.revenue_share)}</strong>
            <Growth value={row.growth_p2} status={row.growth_status_p2} missingLabel="no P2" />
            <Growth value={row.growth_p3} status={row.growth_status_p3} missingLabel="no P3" />
          </div>
        );
      })}
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
  { value: "growth_value_p2", label: "Sales growth $ (P1 vs P2)" },
  { value: "growth_p2", label: "Sales growth % (P1 vs P2)" },
  { value: "growth_value_p3", label: "Sales growth $ (P1 vs P3)" },
  { value: "growth_p3", label: "Sales growth % (P1 vs P3)" },
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

function BrandSkuView({ sku, filters, setFilters, kpis }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("revenue");
  const isClassView = filters.dimension === "class";
  const entityLabel = isClassView ? "Brand" : "Customer";
  const entityMixRows = isClassView ? sku.brands : sku.customers;
  const rows = sortSkuRows(sku.rows.filter((row) =>
    `${row.brand} ${row.customer || ""} ${row.sku} ${row.product_name}`.toLowerCase().includes(query.toLowerCase())
  ), sortBy);
  const topRows = rows.slice(0, 8);
  const activeRange = sku.activeRange || {};
  const dataRange = sku.dataRange || {};
  const costCoverage = sku.costCoverage || {};
  const pnlRevenue = Number(kpis?.revenue || 0);
  const skuRevenue = Number(sku.totals.revenue || 0);
  const revenueGap = pnlRevenue - skuRevenue;
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
      brand: [],
      customer: [],
      dateFrom: dataRange.min || "",
      dateTo: dataRange.max || "",
    });
  };

  const exportToCsv = () => {
    const headers = [
      entityLabel,
      "SKU",
      "Product Name",
      "Quantity",
      "Revenue (HKD)",
      "Revenue Share",
      "Avg Price (HKD)",
      "Margin Dollars (HKD)",
      "Growth Value (P1 vs P2) (HKD)",
      "Growth % (P1 vs P2)",
      "Growth Value (P1 vs P3) (HKD)",
      "Growth % (P1 vs P3)"
    ];

    const csvRows = [headers.join(",")];

    rows.forEach((row) => {
      const entityVal = isClassView ? row.brand : row.customer || "Not specified";
      const formatString = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };
      
      const formatNum = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return "";
        return Number(val);
      };

      const formatPct = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return "";
        return (Number(val) * 100).toFixed(1) + "%";
      };

      const line = [
        formatString(entityVal),
        formatString(row.sku),
        formatString(row.product_name),
        formatNum(row.quantity),
        formatNum(row.revenue),
        formatPct(row.revenue_share),
        formatNum(row.avg_price),
        formatNum(row.gross_profit),
        formatNum(row.growth_value_p2),
        formatPct(row.growth_p2),
        formatNum(row.growth_value_p3),
        formatPct(row.growth_p3)
      ];
      csvRows.push(line.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `SKU_Sales_Export_${entityLabel}_${sortBy}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="summaryStack">
      <section className="skuHeader panel">
        <div>
          <h2>{entityLabel} / SKU sales</h2>
          <p>Sales by Product/Service detail, external customers only, converted to HKD.</p>
        </div>
        <p className="sourceNote">
          SKU revenue may not equal P&L revenue because this view shows positive Sales by Product rows only. P&L can include discounts, shipping, funding, service income, credit notes, returns, and accounting adjustments. SKU margin uses mapped SKU COGS and stays n/a when SKU cost is missing.
        </p>
        <div className="skuReconcile">
          <span>P&L revenue {hkd(pnlRevenue)}</span>
          <span>SKU revenue {hkd(skuRevenue)}</span>
          <strong>Difference {hkd(revenueGap)}</strong>
        </div>
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
              <h2>{entityLabel} revenue mix</h2>
              <p>Revenue, margin dollars, share, and growth from Sales by Product reports</p>
            </div>
          </div>
          <EntityRevenueMix rows={entityMixRows.slice(0, 15)} entityLabel={entityLabel} />
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
            <input value={query} placeholder={`Search SKU, product, ${entityLabel.toLowerCase()}`} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="skuResultList">
            {topRows.map((row) => (
              <button className="skuResult" key={`${isClassView ? row.brand : row.customer}-${row.sku}-${row.product_name}`} type="button" onClick={() => setQuery(row.sku)}>
                <span>{isClassView ? row.brand : row.customer || "Not specified"}</span>
                <strong>{row.product_name}</strong>
                <em>{row.sku} | {hkd(row.revenue)}</em>
                <div className="skuResultMeta">
                  <span>
                    <b>Margin $</b>
                    {hkdOrDash(row.gross_profit)}
                  </span>
                  <span>
                    <b>vs P2</b>
                    <Growth value={row.growth_p2} status={row.growth_status_p2} missingLabel="no P2" />
                  </span>
                  <span>
                    <b>vs P3</b>
                    <Growth value={row.growth_p3} status={row.growth_status_p3} missingLabel="no P3" />
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
          <div className="panelActions" style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
            <button
              className="ghostButton"
              type="button"
              onClick={exportToCsv}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "34px",
                padding: "0 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                fontWeight: 500,
                fontSize: "13px"
              }}
            >
              <Download size={14} />
              Export to CSV
            </button>
            <Select label="Sort by" value={sortBy} options={skuSortOptions} onChange={setSortBy} />
          </div>
        </div>
        <div className="tableWrap compactTable">
          <table>
            <thead>
              <tr>
                <th>{entityLabel}</th>
                <th>SKU</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Revenue</th>
                <th>Share</th>
                <th>Avg price</th>
                <th>Margin $</th>
                <th>Growth $ (P1 vs P2)</th>
                <th>Growth % (P1 vs P2)</th>
                <th>Growth $ (P1 vs P3)</th>
                <th>Growth % (P1 vs P3)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${isClassView ? row.brand : row.customer}-${row.sku}-${row.product_name}`}>
                  <td>{isClassView ? row.brand : row.customer || "Not specified"}</td>
                  <td>{row.sku}</td>
                  <td>{row.product_name}</td>
                  <td>{new Intl.NumberFormat("en-HK").format(Number(row.quantity || 0))}</td>
                  <td>{hkd(row.revenue)}</td>
                  <td>{pct(row.revenue_share)}</td>
                  <td>{hkd(row.avg_price)}</td>
                  <td>{row.gross_profit === null || row.gross_profit === undefined ? "n/a" : hkd(row.gross_profit)}</td>
                  <td>{row.growth_value_p2 === null || row.growth_value_p2 === undefined ? "n/a" : hkd(row.growth_value_p2)}</td>
                  <td><Growth value={row.growth_p2} status={row.growth_status_p2} missingLabel="no P2" /></td>
                  <td>{row.growth_value_p3 === null || row.growth_value_p3 === undefined ? "n/a" : hkd(row.growth_value_p3)}</td>
                  <td><Growth value={row.growth_p3} status={row.growth_status_p3} missingLabel="no P3" /></td>
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

function SegmentedToggle({ label, value, onChange, options }) {
  return (
    <div className="segmentedToggleGroup">
      <span className="toggleLabel">{label}</span>
      <div className="toggleContainer">
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`toggleButton ${isActive ? "active" : ""}`}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelect({ label, values, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(values) ? values : values && values !== "all" ? [values] : [];
  const optionByValue = new Map(options.map((option) => [option.value, option]));
  const buttonLabel = selected.length
    ? selected.length === 1
      ? optionByValue.get(selected[0])?.label || selected[0]
      : `${selected.length} selected`
    : options[0]?.label || "All";

  function toggle(value) {
    if (value === "all") {
      onChange([]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <label className="field multiField">
      <span>{label}</span>
      <button className="multiButton" type="button" onClick={() => setOpen(!open)}>
        {buttonLabel}
      </button>
      {open && (
        <div className="multiMenu">
          <button className={!selected.length ? "active" : ""} type="button" onClick={() => toggle("all")}>
            {options[0]?.label || "All"}
          </button>
          {options.slice(1).map((option) => (
            <button className={selected.includes(option.value) ? "active" : ""} type="button" onClick={() => toggle(option.value)} key={option.value}>
              <input type="checkbox" checked={selected.includes(option.value)} readOnly />
              {option.label}
            </button>
          ))}
        </div>
      )}
      {!!selected.length && (
        <div className="selectedChips">
          {selected.slice(0, 4).map((value) => (
            <button type="button" onClick={() => toggle(value)} key={value}>
              {optionByValue.get(value)?.label || value}
              <X size={12} />
            </button>
          ))}
          {selected.length > 4 && <em>+{selected.length - 4}</em>}
        </div>
      )}
    </label>
  );
}

function ScopeStrip({ filters }) {
  const scopeItems = [
    { label: "Batch", value: filters.batch === "all" ? "All batches" : filters.batch },
    { label: "Company", value: filters.company === "all" ? "All companies" : filters.company },
    { label: "Brand", value: filters.brand?.length ? `${filters.brand.length} selected` : "All brands" },
    { label: "Customer", value: filters.customer?.length ? `${filters.customer.length} selected` : "All customers" },
    { label: "Active Period", value: filters.dateFrom && filters.dateTo ? `${filters.dateFrom} to ${filters.dateTo}` : "All dates" },
    { label: "Comparison Period A", value: filters.dateFrom2 && filters.dateTo2 ? `${filters.dateFrom2} to ${filters.dateTo2}` : "Not set" },
    { label: "Comparison Period B", value: filters.dateFrom3 && filters.dateTo3 ? `${filters.dateFrom3} to ${filters.dateTo3}` : "Not set" },
  ];
  return (
    <div className="scopeStrip">
      {scopeItems.map((item) => (
        <span key={item.label}>
          <b>{item.label}:</b> {item.value}
        </span>
      ))}
    </div>
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

function Overview({ data, goFinance, setPage }) {
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
            <button className="moduleCard active" type="button" onClick={goFinance} style={{ marginBottom: "15px" }}>
              <CircleDollarSign size={18} />
              <strong>Financial Consolidation</strong>
              <span>HKD consolidated P&L analytics with company, brand, customer, date, and section filters.</span>
            </button>
            <button className="moduleCard" type="button" onClick={() => setPage("debit")}>
              <Receipt size={18} style={{ color: "var(--primary)" }} />
              <strong>Debit Note Auditing</strong>
              <span>Audit and flag WTC trade promotion discrepancies, price overcharges, and overlapping billing.</span>
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

function FinancialDashboard({ data, filters, setFilters, search, setSearch, uploadState, uploadFiles, renameBatch, deleteBatch, refresh, subtab, setSubtab }) {
  const isClassView = filters.dimension === "class";
  const [comparisonMode, setComparisonMode] = useState("custom");
  
  const comparisonModeOptions = [
    { value: "standard", label: "Auto-comparison (LY / P3M)" },
    { value: "custom", label: "Custom comparison (Manual dates)" }
  ];

  useEffect(() => {
    if (comparisonMode === "standard" && filters.dateFrom && filters.dateTo) {
      const from2 = jsShiftDate(filters.dateFrom, { years: -1 });
      const to2 = jsShiftDate(filters.dateTo, { years: -1 });
      const from3 = jsShiftDate(filters.dateFrom, { months: -3 });
      const to3 = jsShiftDate(filters.dateFrom, { days: -1 });
      
      if (
        from2 !== filters.dateFrom2 ||
        to2 !== filters.dateTo2 ||
        from3 !== filters.dateFrom3 ||
        to3 !== filters.dateTo3
      ) {
        setFilters((current) => ({
          ...current,
          dateFrom2: from2,
          dateTo2: to2,
          dateFrom3: from3,
          dateTo3: to3,
        }));
      }
    }
  }, [filters.dateFrom, filters.dateTo, comparisonMode, setFilters]);
  const activeEntityTypeLabel = isClassView ? "Brand" : "Customer";
  const companyOptions = [
    { value: "all", label: "All companies" },
    ...data.meta.companies.map((company) => ({ value: company.name, label: company.name })),
  ];
  const dimensionOptions = data.meta.dimensions.map((dimension) => ({
    value: dimension,
    label: dimension === "class" ? "By class / brand" : "By customer",
  }));
  const brandSource = data.meta.entitiesByDimension?.class || [];
  const brandOptions = [
    { value: "all", label: "All brands" },
    ...brandSource.map((brand) => ({ value: brand, label: brand })),
  ];
  const customerSource = data.meta.entitiesByDimension?.customer || [];
  const customerOptions = [
    { value: "all", label: "All customers" },
    ...customerSource.map((customer) => ({ value: customer, label: customer })),
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
    isClassView
      ? filters.brand?.length ? `${filters.brand.length} brands` : "All brands"
      : filters.customer?.length ? `${filters.customer.length} customers` : "All customers",
  ].join(" / ");
  const metricCards = subtab === "sku"
    ? [
        { title: "SKU revenue", value: hkd(skuRevenue), note: "Sales by Product rows", icon: TrendingUp },
        { title: "SKU gross margin", value: pctOrDash(skuGrossMargin), note: skuGrossProfit === null ? "COGS mapping needed" : hkd(skuGrossProfit), icon: LineChart },
        { title: "Units sold", value: new Intl.NumberFormat("en-HK").format(Number(data.sku?.totals?.quantity || 0)), note: "Filtered transaction dates", icon: Package },
        { title: "SKUs", value: new Intl.NumberFormat("en-HK").format(Number(data.sku?.totals?.sku_count || 0)), note: `${data.sku?.totals?.brand_count || 0} brands`, icon: Tags },
      ]
    : [
        { title: "Revenue", value: hkd(data.kpis.revenue), note: "Total for Income", icon: TrendingUp },
        { title: "Gross margin", value: pct(grossMargin), note: hkd(data.kpis.gross_profit), icon: LineChart },
        { title: "Expense ratio", value: pct(expenseRatio), note: hkd(data.kpis.expenses), icon: Receipt },
        { title: "Net margin", value: pct(netMargin), note: hkd(data.kpis.net_earnings), icon: CircleDollarSign },
      ];

  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Financial Consolidation</p>
          <h1>Profit and loss analytics</h1>
          <p className="subtitle">Consolidated HKD dashboard with controls for period, company, view, entity scope, and P&L section.</p>
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
        <div className="filterGroup">
          <Select label="Batch" value={filters.batch} options={batchOptions} onChange={(value) => setFilters({ ...filters, batch: value })} />
          <Select label="Company" value={filters.company} options={companyOptions} onChange={(value) => setFilters({ ...filters, company: value })} />
          <SegmentedToggle label="View By" value={filters.dimension} options={dimensionOptions} onChange={(value) => setFilters({ ...filters, dimension: value, brand: [], customer: [] })} />
          {isClassView ? (
            <MultiSelect label="Select Brands" values={filters.brand} options={brandOptions} onChange={(values) => setFilters({ ...filters, brand: values })} />
          ) : (
            <MultiSelect label="Select Customers" values={filters.customer} options={customerOptions} onChange={(values) => setFilters({ ...values, customer: values })} />
          )}
        </div>
        
        <div className="filterDivider" />
        
        <div className="filterGroup dateGroup">
          <div className="dateFieldPair">
            <DateField label="Period Start" value={filters.dateFrom} onChange={(value) => setFilters({ ...filters, dateFrom: value })} />
            <DateField label="Period End" value={filters.dateTo} onChange={(value) => setFilters({ ...filters, dateTo: value })} />
          </div>
          <Select label="Compare With" value={comparisonMode} options={comparisonModeOptions} onChange={(value) => setComparisonMode(value)} />
          <div /> {/* Empty balance element */}
        </div>
      </section>
      <p className="filterHelp">
        Batch keeps uploads separate. Brand and Customer filters filter P&L lines dynamically based on active dimension view, and apply concurrently to SKU sales analysis.
      </p>

      {comparisonMode === "custom" && (
        <div className="customComparisonBar animateFadeIn">
          <div className="customComparisonHeader">
            <h3>Custom comparison periods</h3>
            <p>Fine-tune manual date ranges for Comparison Period 2 and Comparison Period 3.</p>
          </div>
          <div className="customComparisonGrid">
            <DateField label="Comparison A Start" value={filters.dateFrom2} onChange={(value) => setFilters({ ...filters, dateFrom2: value })} />
            <DateField label="Comparison A End" value={filters.dateTo2} onChange={(value) => setFilters({ ...filters, dateTo2: value })} />
            <DateField label="Comparison B Start" value={filters.dateFrom3} onChange={(value) => setFilters({ ...filters, dateFrom3: value })} />
            <DateField label="Comparison B End" value={filters.dateTo3} onChange={(value) => setFilters({ ...filters, dateTo3: value })} />
          </div>
        </div>
      )}

      <ScopeStrip filters={filters} />

      <section className="metricGrid">
        {metricCards.map((card) => (
          <Kpi title={card.title} value={card.value} note={card.note} icon={card.icon} key={card.title} />
        ))}
      </section>

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

      {subtab === "sku" && <BrandSkuView sku={data.sku} filters={filters} setFilters={setFilters} kpis={data.kpis} />}

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
        <span>vs P2</span>
        <span>vs P3</span>
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
                    <Growth value={row.growth_p2} status={row.growth_status_p2} missingLabel="no P2" />
                    <Growth value={row.growth_p3} status={row.growth_status_p3} missingLabel="no P3" />
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

function DebitNoteDashboard() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subtab, setSubtab] = useState("summary"); // summary, overlaps, pricing, duplicates, pdf_list, proposals_list, import
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadState, setUploadState] = useState({ busy: false, message: "" });

  async function loadAudit() {
    setLoading(true);
    try {
      const res = await fetch("/api/debit-notes/audit");
      const d = await res.json();
      if (d.ok) {
        setAudit(d);
        setError(null);
      } else {
        setError(d.error || "Failed to load audit results.");
      }
    } catch (err) {
      setError(err.message || "Failed to load audit data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  async function uploadFiles(files) {
    if (!files.length) return;
    setUploadState({ busy: true, message: "Uploading and processing debit notes..." });
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));

    try {
      const res = await fetch("/api/upload-debit-note", { method: "POST", body: form });
      const d = await res.json();
      if (d.ok) {
        setUploadState({ busy: false, message: "Upload and processing complete!" });
        loadAudit();
      } else {
        setUploadState({ busy: false, message: d.message || d.error || "Upload failed." });
      }
    } catch (err) {
      setUploadState({ busy: false, message: err.message || "Upload error." });
    }
  }

  async function triggerImport() {
    setUploadState({ busy: true, message: "Parsing existing PDF and XLSM files..." });
    try {
      const res = await fetch("/api/reimport-debit-notes", { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setUploadState({ busy: false, message: "Re-import and parsing complete!" });
        loadAudit();
      } else {
        setUploadState({ busy: false, message: d.stdout || d.stderr || "Re-import failed." });
      }
    } catch (err) {
      setUploadState({ busy: false, message: err.message || "Re-import error." });
    }
  }

  if (loading) {
    return (
      <main className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Debit Note Audit</p>
            <h1>Loading audit details...</h1>
          </div>
        </header>
        <div style={{ display: "flex", justifyContent: "center", padding: "50px" }}>
          <i className="loadingSpinner" style={{ width: "32px", height: "32px" }} />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Debit Note Audit</p>
            <h1>Error loading audit</h1>
            <p className="subtitle" style={{ color: "#d93838" }}>{error}</p>
          </div>
          <button className="primaryButton" onClick={loadAudit}>Retry</button>
        </header>
      </main>
    );
  }

  const { stats, debitNotes, proposals, overlaps, duplicates, priceDiscrepancies, ready, message } = audit;

  if (!ready) {
    return (
      <main className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Debit Note Audit</p>
            <h1>Audit Not Ready</h1>
            <p className="subtitle">{message || "Audit tables are not populated. Please run import."}</p>
          </div>
        </header>
        <section className="cleanGrid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel" style={{ padding: "40px", textAlign: "center" }}>
            <FileUp size={48} style={{ opacity: 0.3, marginBottom: "15px" }} />
            <h3>No data imported yet</h3>
            <p style={{ maxWidth: "450px", margin: "10px auto 20px" }}>
              Please run the import process to parse all WTC PDFs and Excel proposals placed in your `debit notes` folder, or drop new files here.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px" }}>
              <button className="primaryButton" onClick={triggerImport} disabled={uploadState.busy}>
                <RefreshCw size={16} /> Run Parser on debit notes folder
              </button>
            </div>
            <label className={`dropzone ${uploadState.busy ? "busy" : ""}`} style={{ maxWidth: "400px", margin: "0 auto" }}>
              <input type="file" accept=".pdf,.xlsm" multiple disabled={uploadState.busy} onChange={(e) => uploadFiles(e.target.files)} />
              <UploadCloud size={24} />
              <strong>Upload PDFs & XLSMs</strong>
              <span>Audit will process them instantly</span>
            </label>
            {uploadState.message && <p className="notice" style={{ marginTop: "15px" }}>{uploadState.message}</p>}
          </div>
        </section>
      </main>
    );
  }

  function hkd(val) {
    return new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD", minimumFractionDigits: 2 }).format(val);
  }

  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Trade Promotion Auditing</p>
          <h1>Debit Note Auditing Control</h1>
          <p className="subtitle">Identify overcharging, duplicate invoice periods, and price differences between claims and proposals.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="primaryButton" onClick={triggerImport} disabled={uploadState.busy}>
            <RefreshCw size={16} className={uploadState.busy ? "loadingSpinner" : ""} />
            Re-run audit
          </button>
        </div>
      </header>

      {/* KPI Cards Grid */}
      <section className="overviewGrid" style={{ marginBottom: "25px" }}>
        <Kpi title="Total Claimed" value={hkd(stats.totalClaimedAmount)} note={`${stats.totalDebitNotes} PDF line items`} icon={CircleDollarSign} />
        <Kpi title="Audited Discrepancies" value={hkd(stats.totalOverchargeAmount)} note={`${stats.priceDiscrepanciesCount} overcharged products`} icon={TrendingUp} />
        <Kpi title="Overlapping Periods" value={stats.overlapsCount} note={`${stats.duplicatesCount} exact duplicates`} icon={CalendarDays} />
        <Kpi title="Proposals Matched" value={stats.totalProposals} note="Agreed trade sheets" icon={Database} />
      </section>

      {/* Tab controls */}
      <div className="segmentedControl" style={{ marginBottom: "20px" }}>
        {[
          ["summary", "Audit Summary"],
          ["pricing", `Price Discrepancies (${stats.priceDiscrepanciesCount})`],
          ["overlaps", `Double Billing / Overlaps (${stats.overlapsCount})`],
          ["duplicates", `Exact Duplicates (${stats.duplicatesCount})`],
          ["pdf_list", "All Claims (PDF)"],
          ["proposals_list", "All Proposals (Excel)"],
          ["import", "Import & Upload"],
        ].map(([id, label]) => (
          <button key={id} className={subtab === id ? "active" : ""} onClick={() => setSubtab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* SUMMARY SUBTAB */}
      {subtab === "summary" && (
        <section className="cleanGrid">
          <div className="panel" style={{ gridColumn: "span 2" }}>
            <div className="panelHeader">
              <div>
                <h2>Audit Findings Overview</h2>
                <p>Categorized promotion overcharging checks</p>
              </div>
            </div>
            
            <div className="moduleList" style={{ gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div className="moduleCard" style={{ cursor: "pointer", borderLeft: "4px solid #d93838" }} onClick={() => setSubtab("pricing")}>
                <CircleDollarSign size={24} style={{ color: "#d93838", marginBottom: "10px" }} />
                <strong>Price Discrepancies</strong>
                <span className="badge" style={{ background: "#fdf2f2", color: "#d93838", padding: "4px 8px", borderRadius: "12px", width: "max-content", marginTop: "5px" }}>
                  {stats.priceDiscrepanciesCount} items flagging higher rates
                </span>
                <span style={{ marginTop: "10px", display: "block" }}>
                  Flagged when WTC charges more per pc (e.g. $71.50) than agreed in the XLSM proposal sheet.
                </span>
              </div>

              <div className="moduleCard" style={{ cursor: "pointer", borderLeft: "4px solid #f2994a" }} onClick={() => setSubtab("overlaps")}>
                <CalendarDays size={24} style={{ color: "#f2994a", marginBottom: "10px" }} />
                <strong>Double Billing / Overlapping Periods</strong>
                <span className="badge" style={{ background: "#fff9f2", color: "#f2994a", padding: "4px 8px", borderRadius: "12px", width: "max-content", marginTop: "5px" }}>
                  {stats.overlapsCount} overlapping periods flagged
                </span>
                <span style={{ marginTop: "10px", display: "block" }}>
                  Flagged when same SKU claims overlap with another period, charging multiple times for the same dates.
                </span>
              </div>
            </div>

            <div className="panelHeader" style={{ marginTop: "30px", borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
              <div>
                <h2>Top Cost Recovery SKU items</h2>
                <p>SKUs that are overcharged the most</p>
              </div>
            </div>
            
            <div className="tableWrap compactTable">
              <table>
                <thead>
                  <tr>
                    <th>Product SKU</th>
                    <th>Description</th>
                    <th>Agreed Rate</th>
                    <th>Charged Rate</th>
                    <th>Qty Claimed</th>
                    <th>Total Claimed</th>
                    <th>Potential Overcharge</th>
                  </tr>
                </thead>
                <tbody>
                  {priceDiscrepancies.slice(0, 10).map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? "rgba(0,0,0,0.01)" : "none" }}>
                      <td><strong>{row.sku}</strong></td>
                      <td>{row.description}</td>
                      <td>{hkd(row.agreed_rate)}</td>
                      <td style={{ color: "#d93838" }}>{hkd(row.charged_rate)}</td>
                      <td>{row.qty}</td>
                      <td>{hkd(row.charged_rate * row.qty)}</td>
                      <td><span style={{ color: "#d93838", fontWeight: "bold" }}>{hkd(row.total_overcharge)}</span></td>
                    </tr>
                  ))}
                  {priceDiscrepancies.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                        No price discrepancies found. Great work!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Debit Note Files Scanned</h2>
                <p>Parsed PDF documents</p>
              </div>
            </div>
            <div className="compactList" style={{ maxHeight: "400px", overflowY: "auto" }}>
              {Array.from(new Set(debitNotes.map(x => x.file_name))).map(fn => (
                <div key={fn} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: "500" }}>{fn}</span>
                  <span className="pill badge" style={{ background: "rgba(0,0,0,0.05)", fontSize: "11px", padding: "2px 6px" }}>
                    {debitNotes.filter(x => x.file_name === fn).length} rows
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* PRICE DISCREPANCIES SUBTAB */}
      {subtab === "pricing" && (
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Agreed Rates Auditing (Claims > Proposals)</h2>
              <p>Flags where charged unit price is higher than agreed trade promo sheet funding support rate</p>
            </div>
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Claim Source (PDF)</th>
                  <th>Claim Date Range</th>
                  <th>Qty</th>
                  <th>Claim Rate</th>
                  <th>Agreed Rate</th>
                  <th>Proposal Source (Excel)</th>
                  <th>Total Overcharge</th>
                </tr>
              </thead>
              <tbody>
                {priceDiscrepancies.map((row, idx) => (
                  <tr key={idx}>
                    <td><strong>{row.sku}</strong></td>
                    <td>{row.description}</td>
                    <td><small>{row.debit_file}</small></td>
                    <td><small>{row.date_from} to {row.date_to}</small></td>
                    <td>{row.qty}</td>
                    <td style={{ color: "#d93838" }}>{hkd(row.charged_rate)}</td>
                    <td>{hkd(row.agreed_rate)}</td>
                    <td><small>{row.proposal_file}</small></td>
                    <td><strong style={{ color: "#d93838" }}>{hkd(row.total_overcharge)}</strong></td>
                  </tr>
                ))}
                {priceDiscrepancies.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                      No pricing discrepancies found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DOUBLE BILLING / OVERLAPS SUBTAB */}
      {subtab === "overlaps" && (
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Double Billing Check (Overlapping Period Claims)</h2>
              <p>Flags multiple claims made for overlapping dates for the same SKU</p>
            </div>
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Claim A</th>
                  <th>Period A</th>
                  <th>Rate A</th>
                  <th>Qty A</th>
                  <th>Claim B</th>
                  <th>Period B</th>
                  <th>Rate B</th>
                  <th>Qty B</th>
                </tr>
              </thead>
              <tbody>
                {overlaps.map((row, idx) => (
                  <tr key={idx} style={{ background: "rgba(217, 56, 56, 0.02)" }}>
                    <td><strong>{row.a_sku}</strong></td>
                    <td>{row.a_desc}</td>
                    <td><small>{row.a_file}</small></td>
                    <td style={{ borderLeft: "2px solid #f2994a", paddingLeft: "8px" }}><span style={{ color: "#f2994a", fontWeight: "500" }}>{row.a_date_from} to {row.a_date_to}</span></td>
                    <td>{hkd(row.a_unit_cost)}</td>
                    <td>{row.a_qty}</td>
                    <td><small>{row.b_file}</small></td>
                    <td style={{ borderLeft: "2px solid #f2994a", paddingLeft: "8px" }}><span style={{ color: "#f2994a", fontWeight: "500" }}>{row.b_date_from} to {row.b_date_to}</span></td>
                    <td>{hkd(row.b_unit_cost)}</td>
                    <td>{row.b_qty}</td>
                  </tr>
                ))}
                {overlaps.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                      No overlapping periods found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXACT DUPLICATES SUBTAB */}
      {subtab === "duplicates" && (
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Duplicate Invoices Check</h2>
              <p>Flags where exact same quantity and date range are charged twice or more</p>
            </div>
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Rate Charged</th>
                  <th>Period Claimed</th>
                  <th>First Claim File</th>
                  <th>Duplicate Claim File</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((row, idx) => (
                  <tr key={idx} style={{ background: "rgba(217, 56, 56, 0.04)" }}>
                    <td><strong>{row.a_sku}</strong></td>
                    <td>{row.a_desc}</td>
                    <td>{row.a_qty}</td>
                    <td>{hkd(row.a_unit_cost)}</td>
                    <td><span style={{ color: "#d93838", fontWeight: "bold" }}>{row.a_date_from} to {row.a_date_to}</span></td>
                    <td><small>{row.a_file}</small></td>
                    <td><small>{row.b_file}</small></td>
                  </tr>
                ))}
                {duplicates.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                      No exact duplicate claims found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ALL DEBIT NOTES LIST */}
      {subtab === "pdf_list" && (
        <div className="panel">
          <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>All Extracted Claims (from PDFs)</h2>
              <p>Raw list of all promotional debit note records parsed</p>
            </div>
            <input 
              type="text" 
              placeholder="Search SKU or Desc..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "8px", width: "250px", fontSize: "13px" }}
            />
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Dates Claimed</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Total Claim</th>
                  <th>Source Document</th>
                </tr>
              </thead>
              <tbody>
                {debitNotes
                  .filter(row => !searchQuery || row.sku.includes(searchQuery) || row.description.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((row, idx) => (
                    <tr key={row.id}>
                      <td><strong>{row.sku}</strong></td>
                      <td>{row.description}</td>
                      <td>{row.date_from} to {row.date_to}</td>
                      <td>{row.qty}</td>
                      <td>{hkd(row.unit_cost)}</td>
                      <td>{hkd(row.qty * row.unit_cost)}</td>
                      <td><small>{row.file_name}</small></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ALL PROPOSALS LIST */}
      {subtab === "proposals_list" && (
        <div className="panel">
          <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>All Trade Proposals (from Excels)</h2>
              <p>Raw list of all agreed trade promotion sheet records parsed</p>
            </div>
            <input 
              type="text" 
              placeholder="Search SKU or Desc..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "8px", width: "250px", fontSize: "13px" }}
            />
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Brand</th>
                  <th>Description</th>
                  <th>Promo Dates</th>
                  <th>Agreed Rate</th>
                  <th>Promo Price</th>
                  <th>Adjustment</th>
                  <th>Source Proposal</th>
                </tr>
              </thead>
              <tbody>
                {proposals
                  .filter(row => !searchQuery || row.sku.includes(searchQuery) || row.description.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((row, idx) => (
                    <tr key={row.id}>
                      <td><strong>{row.sku}</strong></td>
                      <td>{row.brand}</td>
                      <td>{row.description}</td>
                      <td>{row.start_date} to {row.end_date}</td>
                      <td><strong>{hkd(row.funding_support_pc)}</strong></td>
                      <td>{row.promo_price ? hkd(row.promo_price) : "-"}</td>
                      <td>{row.adjustment_basis || "-"}</td>
                      <td><small>{row.file_name}</small></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IMPORT & UPLOAD SUBTAB */}
      {subtab === "import" && (
        <section className="cleanGrid" style={{ gridTemplateColumns: "1fr 1.5fr" }}>
          <div className="panel" style={{ padding: "30px" }}>
            <div className="sectionTitle" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
              <FileUp size={18} />
              <h2>Upload new files</h2>
            </div>
            <p style={{ marginBottom: "20px", fontSize: "13px", opacity: 0.8 }}>
              Drag and drop any WTC PDF debit note files or Excel `.xlsm` promotion proposal sheets to instantly run them through the auditing engine.
            </p>
            <label className={`dropzone ${uploadState.busy ? "busy" : ""}`}>
              <input type="file" accept=".pdf,.xlsm" multiple disabled={uploadState.busy} onChange={(e) => uploadFiles(e.target.files)} />
              <UploadCloud size={24} />
              <strong>Upload PDFs & XLSMs</strong>
              <span>Include them in the current audit pool</span>
            </label>
            {uploadState.message && <p className="notice" style={{ marginTop: "15px" }}>{uploadState.message}</p>}
          </div>

          <div className="panel" style={{ padding: "30px" }}>
            <div className="sectionTitle" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
              <RefreshCw size={18} />
              <h2>Audit Directory Controls</h2>
            </div>
            <p style={{ marginBottom: "20px", fontSize: "13px", opacity: 0.8 }}>
              The system currently parses files placed in:
              <br />
              <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", display: "inline-block", marginTop: "5px" }}>
                D:\Lightmart CRM\debit notes
              </code>
            </p>
            <button className="primaryButton" onClick={triggerImport} disabled={uploadState.busy} style={{ width: "max-content" }}>
              <RefreshCw size={16} /> Run Full Re-parse on Folder
            </button>
            
            <div style={{ marginTop: "30px", borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
              <h4>Important Git Notice</h4>
              <p style={{ fontSize: "12px", opacity: 0.7, marginTop: "5px" }}>
                The folder `D:\Lightmart CRM\debit notes` contains sensitive client files.
                It has been successfully added to `.gitignore` to guarantee it will never be uploaded to GitHub.
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [financeSubtab, setFinanceSubtab] = useState("summary");
  const [financeNavOpen, setFinanceNavOpen] = useState(false);
  const [filters, setFilters] = useState({
    batch: "all",
    dimension: "class",
    company: "all",
    brand: [],
    customer: [],
    section: "all",
    dateFrom: "",
    dateTo: "",
    dateFrom2: "",
    dateTo2: "",
    dateFrom3: "",
    dateTo3: "",
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
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && item !== "all") params.append(key, item);
        });
      } else if (value && value !== "all") {
        params.append(key, value);
      }
    });
    if (search) params.append("search", search);
    return params.toString();
  }, [filters, search]);

  useEffect(() => {
    load();
  }, [query]);

  async function load() {
    const reqId = ++loadRequestId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?${query}`);
      const d = await res.json();
      if (reqId !== loadRequestId.current) return;
      if (d.ready) {
        setData(d);
        if (!datesInitialized && d.meta.dateRange.min && d.meta.dateRange.max) {
          setFilters((prev) => ({
            ...prev,
            dateFrom: d.meta.dateRange.min,
            dateTo: d.meta.dateRange.max,
          }));
          setDatesInitialized(true);
        }
      } else {
        setData({ ready: false, error: d.error || "Dashboard database not ready." });
      }
    } catch (error) {
      if (reqId !== loadRequestId.current) return;
      setData({ ready: false, error: error.message });
    } finally {
      if (reqId === loadRequestId.current) setLoading(false);
    }
  }

  async function uploadFiles(files, details) {
    setLoading(true);
    setUploadState({ busy: true, message: "Uploading reports..." });
    try {
      const form = new FormData();
      form.append("batchName", details.name);
      form.append("periodStart", details.period_start);
      form.append("periodEnd", details.period_end);
      Array.from(files).forEach((file) => form.append("files", file));

      const upload = await fetch("/api/upload-finance", { method: "POST", body: form }).then((response) => response.json());
      setUploadState({ busy: false, message: upload.ok ? upload.stdout || "Batch imported successfully!" : upload.message || upload.error || "Upload failed." });
      await load();
    } finally {
      setLoading(false);
    }
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
  if (!data.ready && page !== "debit") return <EmptyState message={data.message || data.error || "Finance database is not ready."} />;

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
          <button
            className={`groupButton ${page === "finance" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setPage("finance");
              setFinanceNavOpen((open) => !open);
            }}
          >
            <CircleDollarSign size={18} />
            Financial Consolidation
            <span className="chevron">
              {financeNavOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
          {financeNavOpen && (
            <div className="subNav">
              {[
                ["summary", "Summary"],
                ["sku", "Brand & Customer SKU"],
                ["lines", "P&L lines"],
                ["import", "Import"],
              ].map(([id, label]) => (
                <button
                  className={page === "finance" && financeSubtab === id ? "active" : ""}
                  type="button"
                  key={id}
                  onClick={() => {
                    setPage("finance");
                    setFinanceSubtab(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button className={page === "debit" ? "active" : ""} type="button" onClick={() => setPage("debit")}>
            <Receipt size={18} />
            Debit Note
          </button>
        </nav>
        <div className="sidePanel">
          <span>Currency standard</span>
          <strong>HKD</strong>
          <div className="fxRatesGrid">
            {data?.meta?.fx?.map((rate) => (
              <div className="fxRow" key={rate.source_currency}>
                <span className="fxCurrency">{rate.source_currency}</span>
                <span className="fxArrow">→</span>
                <span className="fxTarget">HKD</span>
                <span className="fxRate">{Number(rate.rate).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
        <button className="logoutButton" type="button" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      {page === "overview" ? (
        <Overview data={data} goFinance={() => setPage("finance")} setPage={setPage} />
      ) : page === "debit" ? (
        <DebitNoteDashboard />
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
          subtab={financeSubtab}
          setSubtab={setFinanceSubtab}
        />
      )}

      {loading && (
        <div className="loadingOverlay">
          <div className="loadingBox">
            <i className="loadingSpinner" />
            <span>Updating dashboard...</span>
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
