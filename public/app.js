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
  CheckCircle2,
  Trash2,
  Link2,
  Key,
  ThumbsUp,
  MessageSquare,
  Share2,
  Image,
  Target,
  Send,
  Settings,
  Bot,
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
  Line,
  LineChart as ReLineChart
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
            <button className="moduleCard" type="button" onClick={() => setPage("debit")} style={{ marginBottom: "15px" }}>
              <Receipt size={18} style={{ color: "var(--primary)" }} />
              <strong>Debit Note Auditing</strong>
              <span>Audit and flag WTC trade promotion discrepancies, price overcharges, and overlapping billing.</span>
            </button>
            <button className="moduleCard" type="button" onClick={() => setPage("warehouse")} style={{ marginBottom: "15px" }}>
              <Package size={18} style={{ color: "#f59e0b" }} />
              <strong>Warehouse Management</strong>
              <span>Manage warehouse inventory stock levels, search SKUs, view bin locations, and track safety stock.</span>
            </button>
            <button className="moduleCard" type="button" onClick={() => setPage("ads")}>
              <LineChart size={18} style={{ color: "var(--primary)" }} />
              <strong>Ads Optimization</strong>
              <span>Monitor Meta campaign performance, connect ad accounts, and enable AI auto-optimization toggles.</span>
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

function DebitNoteDashboard({
  subtab,
  setSubtab,
  audit,
  loading,
  error,
  loadAudit,
  selectedBrand,
  setSelectedBrand,
  selectedFile,
  setSelectedFile
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadState, setUploadState] = useState({ busy: false, message: "" });
  const [exploreType, setExploreType] = useState("brand");
  const [selectedMonth, setSelectedMonth] = useState("All Months");

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

  const { stats: rawStats, debitNotes: rawDebitNotes, proposals: rawProposals, overlaps: rawOverlaps, duplicates: rawDuplicates, priceDiscrepancies: rawPriceDiscrepancies, ready, message, unmatchedPeriods: rawUnmatchedPeriods } = audit || {};

  const rawDebitNotesArr = rawDebitNotes || [];
  const rawProposalsArr = rawProposals || [];
  const rawOverlapsArr = rawOverlaps || [];
  const rawDuplicatesArr = rawDuplicates || [];
  const rawPriceDiscrepanciesArr = rawPriceDiscrepancies || [];
  const rawUnmatchedPeriodsArr = rawUnmatchedPeriods || [];

  const uniqueMonths = Array.from(new Set(rawDebitNotesArr.map(d => {
    if (!d.date_from) return null;
    const parts = d.date_from.split("-");
    if (parts.length < 2) return null;
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][monthIndex];
    return `${monthName} ${year}`;
  }).filter(Boolean))).sort((a, b) => {
    const parse = (s) => {
      const p = s.split(" ");
      const m = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(p[0]);
      return new Date(parseInt(p[1]), m, 1);
    };
    return parse(b) - parse(a);
  });

  const filteredDebitNotes = rawDebitNotesArr.filter(d => {
    if (selectedMonth === "All Months") return true;
    if (!d.date_from) return false;
    const parts = d.date_from.split("-");
    const monthIndex = parseInt(parts[1], 10) - 1;
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][monthIndex];
    return `${monthName} ${parts[0]}` === selectedMonth;
  });

  const filteredProposals = rawProposalsArr.filter(p => {
    if (selectedMonth === "All Months") return true;
    const [monthName, yearStr] = selectedMonth.split(" ");
    const monthIndex = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(monthName);
    const year = parseInt(yearStr, 10);
    const startOfMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const endOfMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-31`;
    return p.start_date <= endOfMonth && p.end_date >= startOfMonth;
  });

  const filteredOverlaps = rawOverlapsArr.filter(o => {
    if (selectedMonth === "All Months") return true;
    const parts = o.a_date_from.split("-");
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][parseInt(parts[1], 10) - 1];
    return `${monthName} ${parts[0]}` === selectedMonth;
  });

  const filteredDuplicates = rawDuplicatesArr.filter(d => {
    if (selectedMonth === "All Months") return true;
    const parts = d.a_date_from.split("-");
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][parseInt(parts[1], 10) - 1];
    return `${monthName} ${parts[0]}` === selectedMonth;
  });

  const filteredPriceDiscrepancies = rawPriceDiscrepanciesArr.filter(p => {
    if (selectedMonth === "All Months") return true;
    const parts = p.date_from.split("-");
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][parseInt(parts[1], 10) - 1];
    return `${monthName} ${parts[0]}` === selectedMonth;
  });

  const filteredUnmatchedPeriods = rawUnmatchedPeriodsArr.filter(u => {
    if (selectedMonth === "All Months") return true;
    const parts = u.date_from.split("-");
    const monthName = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][parseInt(parts[1], 10) - 1];
    return `${monthName} ${parts[0]}` === selectedMonth;
  });

  const filteredStats = rawStats ? {
    totalDebitNotes: filteredDebitNotes.length,
    totalProposals: filteredProposals.length,
    overlapsCount: filteredOverlaps.length,
    duplicatesCount: filteredDuplicates.length,
    priceDiscrepanciesCount: filteredPriceDiscrepancies.length,
    unmatchedPeriodsCount: filteredUnmatchedPeriods.length,
    totalClaimedAmount: filteredDebitNotes.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0),
    totalOverchargeAmount: filteredPriceDiscrepancies.reduce((sum, item) => sum + item.total_overcharge, 0),
    totalUnpromotedAmount: filteredUnmatchedPeriods.reduce((sum, item) => sum + (item.qty * item.charged_rate), 0)
  } : {};

  // Shadow variables for out-of-the-box compatibility
  const stats = filteredStats;
  const debitNotes = filteredDebitNotes;
  const proposals = filteredProposals;
  const overlaps = filteredOverlaps;
  const duplicates = filteredDuplicates;
  const priceDiscrepancies = filteredPriceDiscrepancies;
  const unmatchedPeriods = filteredUnmatchedPeriods;

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
        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          {uniqueMonths.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#0f172a" }}>Reporting Month:</span>
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "8px", 
                  border: "1px solid #e2e8f0", 
                  background: "#ffffff", 
                  fontSize: "13px", 
                  fontWeight: "500",
                  color: "#0f172a",
                  cursor: "pointer"
                }}
              >
                <option value="All Months">All Months</option>
                {uniqueMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
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
      <div className="toggleContainer" style={{ marginBottom: "20px", width: "max-content", maxWidth: "100%", overflowX: "auto" }}>
        {[
          ["summary", "Audit Summary"],
          ["pricing", `Price Discrepancies (${stats.priceDiscrepanciesCount})`],
          ["overlaps", `Double Billing / Overlaps (${stats.overlapsCount})`],
          ["duplicates", `Exact Duplicates (${stats.duplicatesCount})`],
          ["unpromoted", `Missing Proposals (${stats.unmatchedPeriodsCount})`],
          ["explore", "Explore & Drilldown"],
          ["pdf_list", "All Claims (PDF)"],
          ["proposals_list", "All Proposals (Excel)"],
          ["import", "Import & Upload"],
        ].map(([id, label]) => (
          <button key={id} className={`toggleButton ${subtab === id ? "active" : ""}`} onClick={() => {
            setSubtab(id);
            setSelectedBrand(null);
            setSelectedFile(null);
          }}>
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
            
            <div className="moduleList" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginTop: "10px" }}>
              {/* PRICE DISCREPANCIES CARD */}
              <div 
                className="moduleCard" 
                onClick={() => setSubtab("pricing")}
                style={{ 
                  cursor: "pointer", 
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
                  padding: "24px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid #27ae60",
                  borderRadius: "12px",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = "translateY(-4px)"; 
                  e.currentTarget.style.boxShadow = "0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#f4fbf7";
                  e.currentTarget.style.borderColor = "#27ae60";
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = "translateY(0)"; 
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <CircleDollarSign size={20} style={{ color: "#27ae60" }} />
                  <strong style={{ fontSize: "15px", color: "#0f172a" }}>Price Discrepancies</strong>
                </div>
                <span className="badge" style={{ background: "#eafaf1", color: "#27ae60", padding: "4px 10px", borderRadius: "12px", width: "max-content", fontSize: "11px", fontWeight: "bold" }}>
                  {stats.priceDiscrepanciesCount} overcharged items
                </span>
                <span style={{ fontSize: "12.5px", color: "#475569", lineHeight: "1.5", marginTop: "4px" }}>
                  Flagged when WTC unit price charged exceeds all active promotion proposal sheet rates.
                </span>
              </div>

              {/* DOUBLE BILLING CARD */}
              <div 
                className="moduleCard" 
                onClick={() => setSubtab("overlaps")}
                style={{ 
                  cursor: "pointer", 
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
                  padding: "24px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid #f2994a",
                  borderRadius: "12px",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = "translateY(-4px)"; 
                  e.currentTarget.style.boxShadow = "0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#fffbf7";
                  e.currentTarget.style.borderColor = "#f2994a";
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = "translateY(0)"; 
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <CalendarDays size={20} style={{ color: "#f2994a" }} />
                  <strong style={{ fontSize: "15px", color: "#0f172a" }}>Double Billing Checks</strong>
                </div>
                <span className="badge" style={{ background: "#fff9f2", color: "#f2994a", padding: "4px 10px", borderRadius: "12px", width: "max-content", fontSize: "11px", fontWeight: "bold" }}>
                  {stats.overlapsCount} overlaps flagged
                </span>
                <span style={{ fontSize: "12.5px", color: "#475569", lineHeight: "1.5", marginTop: "4px" }}>
                  Overlapping periods claimed for the same SKU in different debit note files.
                </span>
              </div>

              {/* MISSING PROPOSALS CARD */}
              <div 
                className="moduleCard" 
                onClick={() => setSubtab("unpromoted")}
                style={{ 
                  cursor: "pointer", 
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
                  padding: "24px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid #f2c94c",
                  borderRadius: "12px",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = "translateY(-4px)"; 
                  e.currentTarget.style.boxShadow = "0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#fffdf3";
                  e.currentTarget.style.borderColor = "#f2c94c";
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = "translateY(0)"; 
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"; 
                  e.currentTarget.style.background = "#ffffff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Database size={20} style={{ color: "#f2c94c" }} />
                  <strong style={{ fontSize: "15px", color: "#0f172a" }}>Missing Proposals</strong>
                </div>
                <span className="badge" style={{ background: "#fefdf0", color: "#b8860b", padding: "4px 10px", borderRadius: "12px", width: "max-content", fontSize: "11px", fontWeight: "bold" }}>
                  {stats.unmatchedPeriodsCount} items missing sheets
                </span>
                <span style={{ fontSize: "12.5px", color: "#475569", lineHeight: "1.5", marginTop: "4px" }}>
                  Claimed periods where no trade promotion proposal was found in the database.
                </span>
              </div>
            </div>

            <div className="panelHeader" style={{ marginTop: "30px", borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
              <div>
                <h2>Agreed Rates Auditing Summary</h2>
                <p>Status of price discrepancies and cost validation</p>
              </div>
            </div>
            
            {priceDiscrepancies.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", background: "#fbfcfb", borderRadius: "8px", border: "1px dashed #27ae60", color: "#27ae60", margin: "15px 0" }}>
                <CheckCircle2 size={32} style={{ marginBottom: "10px" }} />
                <h4>No Price Discrepancies Found!</h4>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "5px" }}>
                  All claimed rates are successfully reconciled and matched to your agreed trade promotion sheets.
                </p>
              </div>
            ) : (
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
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Debit Note Files Scanned</h2>
                <p>Parsed PDF documents</p>
              </div>
            </div>
            <div className="compactList" style={{ maxHeight: "400px", overflowY: "auto" }}>
              {Array.from(new Set(debitNotes.map(x => x.file_name))).map(fn => {
                let shortName = fn;
                const match = fn.match(/_(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})_/);
                if (match) {
                  shortName = `Week of ${match[2]}/${match[3]} (${fn.substring(fn.lastIndexOf('_') + 1, fn.lastIndexOf('.'))})`;
                }
                return (
                  <div key={fn} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: "13px", fontWeight: "500" }} title={fn}>{shortName}</span>
                    <span className="pill badge" style={{ background: "rgba(0,0,0,0.05)", fontSize: "11px", padding: "2px 6px" }}>
                      {debitNotes.filter(x => x.file_name === fn).length} rows
                    </span>
                  </div>
                );
              })}
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

          {priceDiscrepancies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 40px", background: "linear-gradient(135deg, rgba(39, 174, 96, 0.02) 0%, rgba(39, 174, 96, 0.05) 100%)", borderRadius: "12px", border: "1px solid rgba(39, 174, 96, 0.15)", margin: "20px" }}>
              <CheckCircle2 size={48} style={{ color: "#27ae60", marginBottom: "15px" }} />
              <h3 style={{ color: "#27ae60", fontSize: "20px", marginBottom: "10px" }}>All Math Reconciled & Verified</h3>
              <p style={{ maxWidth: "600px", margin: "0 auto 20px", fontSize: "14px", lineHeight: "1.6" }}>
                Our advanced multi-tier auditing engine has analyzed all <strong>{stats.totalDebitNotes} claims</strong> against the agreed Excel trade promotions. 
                We verified that <strong>every single claimed unit cost matches its corresponding agreed rate perfectly</strong>.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", maxWidth: "550px", margin: "0 auto", textAlign: "left", background: "#ffffff", padding: "20px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Multi-Tier Promotions Reconciled</h4>
                  <p style={{ fontSize: "12px", opacity: 0.8, lineHeight: "1.4" }}>
                    Recognizes overlapping Single Price Cut (e.g. support at $71.50) and Mix & Match (e.g. support at $32.50) active in the same period, eliminating false positives.
                  </p>
                </div>
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "5px" }}>Redundant Copies Deduplicated</h4>
                  <p style={{ fontSize: "12px", opacity: 0.8, lineHeight: "1.4" }}>
                    Deduplicates redundant Excel copies in the folder (e.g. <code>- Copy.xlsm</code>), ensuring calculations remain perfectly accurate.
                  </p>
                </div>
              </div>
            </div>
          ) : (
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DOUBLE BILLING / OVERLAPS SUBTAB */}
      {subtab === "overlaps" && (
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Double Billing Check (Overlapping Period Claims)</h2>
              <p>Flags multiple claims made for overlapping dates for the same SKU across different documents</p>
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
                      No overlapping periods across different files found.
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
              <p>Flags where exact same quantity and date range are charged twice or more across different documents</p>
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
                      No exact duplicate claims across files found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MISSING PROPOSALS SUBTAB */}
      {subtab === "unpromoted" && (
        <div className="panel">
          <div className="panelHeader">
            <div>
              <h2>Missing Trade Proposals (Unpromoted Claims)</h2>
              <p>Flags where products were charged in a period, but no matching Excel trade promo proposal was found in the system</p>
            </div>
          </div>

          <div className="tableWrap compactTable">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Claim Source (PDF)</th>
                  <th>Claim Period</th>
                  <th>Qty Claimed</th>
                  <th>Rate Charged</th>
                  <th>Total Claim Amount</th>
                  <th>Audit Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedPeriods && unmatchedPeriods.map((row, idx) => (
                  <tr key={idx} style={{ background: "rgba(242, 153, 74, 0.02)" }}>
                    <td><strong>{row.sku}</strong></td>
                    <td>{row.description}</td>
                    <td><small>{row.debit_file}</small></td>
                    <td><span style={{ color: "#f2994a", fontWeight: "bold" }}>{row.date_from} to {row.date_to}</span></td>
                    <td>{row.qty}</td>
                    <td>{hkd(row.charged_rate)}</td>
                    <td>{hkd(row.qty * row.charged_rate)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#f2994a", fontSize: "12px", fontWeight: "bold" }}>
                        <CalendarDays size={14} /> Upload March promotion proposal sheets
                      </span>
                    </td>
                  </tr>
                ))}
                {(!unmatchedPeriods || unmatchedPeriods.length === 0) && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                      No unmatched periods. Excellent data parity!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPLORE & DRILLDOWN SUBTAB */}
      {subtab === "explore" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          <div className="panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "bold" }}>Interactive Exploration Center</h3>
                <p style={{ fontSize: "13px", opacity: 0.7 }}>Select an entity category below to drill down into detailed claims, matching proposals, and exact calculations.</p>
              </div>
              <div className="toggleContainer" style={{ margin: 0, padding: "4px", background: "rgba(0,0,0,0.03)", borderRadius: "10px" }}>
                <button 
                  className={`toggleButton ${exploreType === "brand" ? "active" : ""}`} 
                  onClick={() => { setExploreType("brand"); setSelectedBrand(null); setSelectedFile(null); }}
                  style={{ borderRadius: "8px", fontSize: "13px", padding: "6px 16px" }}
                >
                  <Package size={14} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Drill Down by Brand
                </button>
                <button 
                  className={`toggleButton ${exploreType === "document" ? "active" : ""}`} 
                  onClick={() => { setExploreType("document"); setSelectedBrand(null); setSelectedFile(null); }}
                  style={{ borderRadius: "8px", fontSize: "13px", padding: "6px 16px" }}
                >
                  <Receipt size={14} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Drill Down by Document
                </button>
              </div>
            </div>
          </div>

          {exploreType === "brand" ? (
            <>
              {/* Brand Grid Selection */}
              {!selectedBrand ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "20px" }}>
                  {Array.from(new Set(proposals.map(p => p.brand).filter(Boolean))).map(brand => {
                    const brandProps = proposals.filter(p => p.brand === brand);
                    const brandSkus = new Set(brandProps.map(p => p.sku));
                    const brandClaims = debitNotes.filter(d => brandSkus.has(d.sku));
                    const brandAmt = brandClaims.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
                    
                    return (
                      <div 
                        key={brand} 
                        className="moduleCard" 
                        onClick={() => setSelectedBrand(brand)}
                        style={{ 
                          cursor: "pointer", 
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
                          padding: "20px", 
                          display: "flex", 
                          flexDirection: "column", 
                          justifyContent: "space-between", 
                          height: "135px",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"
                        }}
                        onMouseEnter={(e) => { 
                          e.currentTarget.style.transform = "translateY(-4px)"; 
                          e.currentTarget.style.boxShadow = "0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)"; 
                          e.currentTarget.style.borderColor = "#059669"; 
                        }}
                        onMouseLeave={(e) => { 
                          e.currentTarget.style.transform = "translateY(0)"; 
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"; 
                          e.currentTarget.style.borderColor = "#e2e8f0"; 
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: "16px", color: "#0f172a", display: "block" }}>{brand}</strong>
                          <span style={{ fontSize: "12px", color: "#475569", display: "block", marginTop: "6px", fontWeight: "500" }}>
                            {brandClaims.length} extracted claims
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginTop: "10px" }}>
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "500" }}>Claim Total</span>
                          <strong style={{ fontSize: "15px", color: "#0f172a" }}>{hkd(brandAmt)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <button 
                    className="ghostButton" 
                    onClick={() => setSelectedBrand(null)}
                    style={{ width: "max-content", alignSelf: "flex-start", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
                  >
                    ← Back to Brand list
                  </button>
                  <div className="panel" style={{ padding: "24px" }}>
                    <div className="panelHeader" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "20px", marginBottom: "25px" }}>
                      <div>
                        <p className="eyebrow">Brand Audit Drilldown</p>
                        <h2>Brand: {selectedBrand}</h2>
                        <p>Analysis of all debit notes and promotional claims matching this brand</p>
                      </div>
                    </div>

                    {(() => {
                      const brandProps = proposals.filter(p => p.brand === selectedBrand);
                      const brandSkus = new Set(brandProps.map(p => p.sku));
                      const brandClaims = debitNotes.filter(d => brandSkus.has(d.sku));
                      
                      const claimedAmt = brandClaims.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
                      const matchedCount = brandClaims.filter(c => c.auditStatus === "match").length;
                      const unpromotedCount = brandClaims.filter(c => c.auditStatus === "unpromoted").length;

                      return (
                        <>
                          <div className="overviewGrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "25px" }}>
                            <Kpi title="Brand Claimed Total" value={hkd(claimedAmt)} note={`${brandClaims.length} items billed`} icon={CircleDollarSign} />
                            <Kpi title="Matches Confirmed" value={matchedCount} note={`${brandProps.length} agreed mechanisms`} icon={CheckCircle2} />
                            <Kpi title="Missing Proposals" value={unpromotedCount} note="Claims in unpromoted periods" icon={CalendarDays} />
                          </div>

                          <h3>Extracted Brand Line Items</h3>
                          <div className="tableWrap compactTable" style={{ marginTop: "15px" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Description</th>
                                  <th>Claim Dates</th>
                                  <th>Qty</th>
                                  <th>Rate Charged</th>
                                  <th>Rate Agreed</th>
                                  <th>Audit Status</th>
                                  <th>Claim Document (PDF)</th>
                                  <th>Agreed Document (Excel)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {brandClaims.map((row, idx) => (
                                  <tr key={row.id}>
                                    <td><strong>{row.sku}</strong></td>
                                    <td>{row.description}</td>
                                    <td><small>{row.date_from} to {row.date_to}</small></td>
                                    <td>{row.qty}</td>
                                    <td>{hkd(row.unit_cost)}</td>
                                    <td>{row.agreedRate ? hkd(row.agreedRate) : "-"}</td>
                                    <td>
                                      {row.auditStatus === "match" ? (
                                        <span className="badge" style={{ background: "#eafaf1", color: "#27ae60", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                                          ✔ OK Match
                                        </span>
                                      ) : (
                                        <span className="badge" style={{ background: "#fff9f2", color: "#f2994a", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                                          ❓ Missing Promo
                                        </span>
                                      )}
                                    </td>
                                    <td><small>{row.file_name}</small></td>
                                    <td><small>{row.matchedProposalFile || "-"}</small></td>
                                  </tr>
                                ))}
                                {brandClaims.length === 0 && (
                                  <tr>
                                    <td colSpan="9" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                                      No claims found for this brand.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Document Grid Selection */}
              {!selectedFile ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "20px" }}>
                  {Array.from(new Set(debitNotes.map(d => d.file_name).filter(Boolean))).map(filename => {
                    const fileClaims = debitNotes.filter(d => d.file_name === filename);
                    const fileAmt = fileClaims.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
                    const matchedCount = fileClaims.filter(c => c.auditStatus === "match").length;
                    const matchRate = fileClaims.length > 0 ? (matchedCount / fileClaims.length) * 100 : 0;
                    
                    let displayName = filename;
                    const dateMatch = filename.match(/_(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})_/);
                    if (dateMatch) {
                      displayName = `Week of ${dateMatch[2]}/${dateMatch[3]}`;
                    } else {
                      displayName = filename.replace("pnsrep302a_", "").replace(".pdf", "");
                    }
                    
                    return (
                      <div 
                        key={filename} 
                        className="moduleCard" 
                        onClick={() => setSelectedFile(filename)}
                        style={{ 
                          cursor: "pointer", 
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", 
                          padding: "20px", 
                          display: "flex", 
                          flexDirection: "column", 
                          justifyContent: "space-between", 
                          height: "145px",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"
                        }}
                        onMouseEnter={(e) => { 
                          e.currentTarget.style.transform = "translateY(-4px)"; 
                          e.currentTarget.style.boxShadow = "0 12px 20px -8px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03)"; 
                          e.currentTarget.style.borderColor = "#059669"; 
                        }}
                        onMouseLeave={(e) => { 
                          e.currentTarget.style.transform = "translateY(0)"; 
                          e.currentTarget.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.03)"; 
                          e.currentTarget.style.borderColor = "#e2e8f0"; 
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: "15px", color: "#0f172a" }}>{displayName}</strong>
                            <span className="badge" style={{ 
                              background: matchRate === 100 ? "#eafaf1" : matchRate >= 70 ? "#fff9f2" : "#fdeded", 
                              color: matchRate === 100 ? "#27ae60" : matchRate >= 70 ? "#f2994a" : "#d93838", 
                              padding: "2px 6px", 
                              borderRadius: "8px", 
                              fontSize: "10px", 
                              fontWeight: "bold" 
                            }}>
                              {matchRate.toFixed(0)}% Match
                            </span>
                          </div>
                          <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={filename}>
                            {filename}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginTop: "10px" }}>
                          <span style={{ fontSize: "11px", color: "#475569", fontWeight: "500" }}>{fileClaims.length} items billed</span>
                          <strong style={{ fontSize: "14px", color: "#0f172a" }}>{hkd(fileAmt)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                  <button 
                    className="ghostButton" 
                    onClick={() => setSelectedFile(null)}
                    style={{ width: "max-content", alignSelf: "flex-start", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}
                  >
                    ← Back to Document list
                  </button>
                  <div className="panel" style={{ padding: "24px" }}>
                    <div className="panelHeader" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "20px", marginBottom: "25px" }}>
                      <div>
                        <p className="eyebrow">Document Audit Drilldown</p>
                        <h2 style={{ wordBreak: "break-all" }}>{selectedFile}</h2>
                        <p>Analysis of all items billed in this specific debit note PDF</p>
                      </div>
                    </div>

                    {(() => {
                      const fileClaims = debitNotes.filter(d => d.file_name === selectedFile);
                      const claimedAmt = fileClaims.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0);
                      const matchedCount = fileClaims.filter(c => c.auditStatus === "match").length;
                      const unpromotedCount = fileClaims.filter(c => c.auditStatus === "unpromoted").length;
                      const matchRate = fileClaims.length > 0 ? (matchedCount / fileClaims.length) * 100 : 0;

                      return (
                        <>
                          <div className="overviewGrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "25px" }}>
                            <Kpi title="Document Billed Total" value={hkd(claimedAmt)} note={`${fileClaims.length} items`} icon={CircleDollarSign} />
                            <Kpi title="Agreed Match Rate" value={`${matchRate.toFixed(1)}%`} note={`${matchedCount} matching items`} icon={CheckCircle2} />
                            <Kpi title="Missing Proposals" value={unpromotedCount} note="Claims in unpromoted periods" icon={CalendarDays} />
                          </div>

                          <h3>Items Billed in this Document</h3>
                          <div className="tableWrap compactTable" style={{ marginTop: "15px" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Description</th>
                                  <th>Claim Period</th>
                                  <th>Qty</th>
                                  <th>Rate Charged</th>
                                  <th>Rate Agreed</th>
                                  <th>Audit Status</th>
                                  <th>Matching Proposal (Excel)</th>
                                  <th>Line Claim Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fileClaims.map((row, idx) => (
                                  <tr key={row.id}>
                                    <td><strong>{row.sku}</strong></td>
                                    <td>{row.description}</td>
                                    <td><small>{row.date_from} to {row.date_to}</small></td>
                                    <td>{row.qty}</td>
                                    <td>{hkd(row.unit_cost)}</td>
                                    <td>{row.agreedRate ? hkd(row.agreedRate) : "-"}</td>
                                    <td>
                                      {row.auditStatus === "match" ? (
                                        <span className="badge" style={{ background: "#eafaf1", color: "#27ae60", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                                          ✔ OK Match
                                        </span>
                                      ) : (
                                        <span className="badge" style={{ background: "#fff9f2", color: "#f2994a", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                                          ❓ Missing Promo
                                        </span>
                                      )}
                                    </td>
                                    <td><small>{row.matchedProposalFile || "-"}</small></td>
                                    <td><strong>{hkd(row.qty * row.unit_cost)}</strong></td>
                                  </tr>
                                ))}
                                {fileClaims.length === 0 && (
                                  <tr>
                                    <td colSpan="9" style={{ textAlign: "center", padding: "30px", opacity: 0.5 }}>
                                      No claims found in this file.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
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
                  <th>Audit Status</th>
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
                      <td>
                        {row.auditStatus === "match" ? (
                          <span className="badge" style={{ background: "#eafaf1", color: "#27ae60", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                            ✔ OK Match
                          </span>
                        ) : (
                          <span className="badge" style={{ background: "#fff9f2", color: "#f2994a", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "bold" }}>
                            ❓ Missing Promo
                          </span>
                        )}
                      </td>
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
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button className="primaryButton" onClick={triggerImport} disabled={uploadState.busy} style={{ width: "max-content" }}>
                <RefreshCw size={16} className={uploadState.busy ? "loadingSpinner" : ""} /> Run Full Re-parse on Folder
              </button>
              <button 
                onClick={async () => {
                  if (confirm("Are you absolutely sure you want to delete all currently uploaded PDF debit notes and Excel promotion sheets? This will completely clear the database and restore a clean slate for your next audit batch.")) {
                    setUploadState({ busy: true, message: "Wiping workspace and resetting database..." });
                    try {
                      const res = await fetch("/api/clear-debit-notes", { method: "POST" });
                      const d = await res.json();
                      if (d.ok) {
                        setUploadState({ busy: false, message: "Workspace reset successfully! Ready for new uploads." });
                        setSelectedMonth("All Months");
                        loadAudit();
                      } else {
                        setUploadState({ busy: false, message: d.message || d.error || "Wipe failed." });
                      }
                    } catch (err) {
                      setUploadState({ busy: false, message: err.message || "Wipe error." });
                    }
                  }
                }} 
                disabled={uploadState.busy} 
                style={{ 
                  width: "max-content",
                  background: "#fdeded",
                  color: "#d93838",
                  border: "1px solid rgba(217, 56, 56, 0.2)",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fcdada"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fdeded"; }}
              >
                <Trash2 size={16} /> Wipe Workspace & Clear Data
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function WarehouseDashboard({ subtab, setSubtab, stock, loading, error, loadStock }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [qtyChange, setQtyChange] = useState("");
  const [adjustReason, setAdjustReason] = useState("Adjustment");
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState(null);

  const [editingReorderItem, setEditingReorderItem] = useState(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  const [ledgerItem, setLedgerItem] = useState(null);
  const [ledgerMovements, setLedgerMovements] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    if (!ledgerItem) return;
    let active = true;
    setLedgerLoading(true);
    fetch(`/api/warehouse/movements?sku=${ledgerItem.sku}`)
      .then(res => res.json())
      .then(d => {
        if (active && d.ok) {
          setLedgerMovements(d.movements);
        }
      })
      .catch(err => console.error(err))
      .finally(() => {
        if (active) setLedgerLoading(false);
      });
    return () => { active = false; };
  }, [ledgerItem]);

  const metrics = useMemo(() => {
    if (!stock) return { totalSkus: 0, totalUnits: 0, totalAllocated: 0, lowStockCount: 0, totalAssetVal: 0, totalRetailVal: 0 };
    let totalSkus = stock.length;
    let totalUnits = 0;
    let totalAllocated = 0;
    let lowStockCount = 0;
    let totalAssetVal = 0;
    let totalRetailVal = 0;
    
    stock.forEach(item => {
      totalUnits += item.stock_on_hand;
      totalAllocated += item.allocated;
      totalAssetVal += item.stock_on_hand * (item.unit_cost_hkd || 0);
      totalRetailVal += item.stock_on_hand * (item.rsp || 0);
      if (item.stock_on_hand <= item.reorder_point) {
        lowStockCount++;
      }
    });
    return { totalSkus, totalUnits, totalAllocated, lowStockCount, totalAssetVal, totalRetailVal };
  }, [stock]);

  const brands = useMemo(() => {
    if (!stock) return ["All"];
    const set = new Set(stock.map(item => item.brand).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [stock]);

  const filteredStock = useMemo(() => {
    if (!stock) return [];
    return stock.filter(item => {
      const matchSearch = !searchQuery || 
        item.sku.includes(searchQuery) || 
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchBrand = selectedBrand === "All" || item.brand === selectedBrand;
      const matchLowStock = !showLowStockOnly || (item.stock_on_hand <= item.reorder_point);
      return matchSearch && matchBrand && matchLowStock;
    });
  }, [stock, searchQuery, selectedBrand, showLowStockOnly]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustingItem || !qtyChange) return;
    setAdjustBusy(true);
    setAdjustError(null);
    try {
      const res = await fetch("/api/warehouse/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: adjustingItem.id,
          qtyChange: Number(qtyChange),
          reason: adjustReason
        })
      });
      const d = await res.json();
      if (d.ok) {
        setAdjustingItem(null);
        setQtyChange("");
        setAdjustReason("Adjustment");
        loadStock();
      } else {
        setAdjustError(d.error || "Failed to save adjustment.");
      }
    } catch (err) {
      setAdjustError(err.message || "Adjustment error.");
    } finally {
      setAdjustBusy(false);
    }
  };

  const handleSaveReorder = async (item, val) => {
    if (Number(val) < 0) return;
    setReorderBusy(true);
    try {
      const res = await fetch("/api/warehouse/update-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          reorderPoint: Number(val)
        })
      });
      const d = await res.json();
      if (d.ok) {
        setEditingReorderItem(null);
        loadStock();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReorderBusy(false);
    }
  };

  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Warehouse Management</p>
          <h1>Warehouse Stock Levels</h1>
          <p className="subtitle">Real-time inventory levels, bin locations, safety stock reorder thresholds, and ledger audits.</p>
        </div>
        <button className="primaryButton" type="button" onClick={loadStock} disabled={loading}>
          <RefreshCw size={16} className={loading ? "loadingSpinner" : ""} />
          Refresh inventory
        </button>
      </header>

      <section className="overviewGrid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Kpi title="Total SKUs" value={loading ? "..." : metrics.totalSkus} note="Unique items tracked" icon={Package} />
        <Kpi title="Low Stock Alerts" value={loading ? "..." : metrics.lowStockCount} note="Items below safety point" icon={TrendingUp} />
        <Kpi title="Inventory Asset Cost" value={loading ? "..." : hkd(metrics.totalAssetVal)} note="Valued at unit cost price" icon={Database} />
        <Kpi title="Potential Retail Value" value={loading ? "..." : hkd(metrics.totalRetailVal)} note="Estimated value at RSP" icon={CircleDollarSign} />
      </section>

      {error && (
        <div className="panel errorPanel" style={{ padding: "20px", color: "var(--error)", background: "#fdeded", border: "1px solid rgba(217,56,56,0.15)", borderRadius: "12px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="panel" style={{ padding: "30px" }}>
        <div className="panelHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px", marginBottom: "25px" }}>
          <div>
            <h2>Current Inventory</h2>
            <p>Active items in physical warehouse</p>
          </div>
          
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              style={{
                border: "1px solid " + (showLowStockOnly ? "var(--primary)" : "var(--border)"),
                background: showLowStockOnly ? "rgba(13, 148, 136, 0.08)" : "transparent",
                color: showLowStockOnly ? "var(--primary)" : "#64748b",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease"
              }}
            >
              <Filter size={14} />
              {showLowStockOnly ? "Low Stock Only" : "Filter Low Stock"}
            </button>

            <div className="searchWrapper" style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
              <input 
                type="text" 
                placeholder="Search SKU or description..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "8px 12px 8px 36px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  fontSize: "13px",
                  width: "240px",
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "15px" }}>
          {brands.map(brand => (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              style={{
                border: "0",
                background: selectedBrand === brand ? "rgba(13, 148, 136, 0.08)" : "transparent",
                color: selectedBrand === brand ? "var(--primary)" : "#64748b",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "13px",
                fontWeight: selectedBrand === brand ? "600" : "500",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {brand}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: "50px", textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="loadingSpinner" style={{ marginBottom: "10px" }} />
            <p>Loading inventory data...</p>
          </div>
        ) : (
          <div className="tableWrapper" style={{ overflowX: "auto" }}>
            <table className="cleanTable warehouseTable">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Brand</th>
                  <th>Description</th>
                  <th>Bin Loc</th>
                  <th style={{ textAlign: "right" }}>On Hand</th>
                  <th style={{ textAlign: "right" }}>Allocated</th>
                  <th style={{ textAlign: "right" }}>Available</th>
                  <th style={{ textAlign: "right" }}>Asset Value</th>
                  <th style={{ textAlign: "right" }}>Reorder Pt</th>
                  <th style={{ textAlign: "right" }}>Reorder Rec</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan="12" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      No inventory items found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredStock.map(item => {
                    const available = item.stock_on_hand - item.allocated;
                    const isLow = item.stock_on_hand <= item.reorder_point;
                    const isOut = item.stock_on_hand === 0;

                    let statusText = "In Stock";
                    let badgeColor = "#10b981";
                    let badgeBg = "#ecfdf5";
                    if (isOut) {
                      statusText = "Out of Stock";
                      badgeColor = "#ef4444";
                      badgeBg = "#fef2f2";
                    } else if (isLow) {
                      statusText = "Low Stock";
                      badgeColor = "#f59e0b";
                      badgeBg = "#fffbeb";
                    }

                    const itemAssetVal = item.stock_on_hand * (item.unit_cost_hkd || 0);
                    const isRecommended = item.stock_on_hand <= item.reorder_point;
                    const recQty = isRecommended ? Math.max(10, (item.reorder_point * 2) - item.stock_on_hand) : 0;

                    const rowBg = isOut ? "rgba(239, 68, 68, 0.02)" : isLow ? "rgba(245, 158, 11, 0.015)" : "transparent";

                    return (
                      <tr key={item.id} style={{ background: rowBg }}>
                        <td><strong>{item.sku}</strong></td>
                        <td><span style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{item.brand}</span></td>
                        <td>{item.description}</td>
                        <td><code style={{ background: "#f8fafc", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", border: "1px solid var(--border)" }}>{item.bin_location}</code></td>
                        <td style={{ textAlign: "right" }}><strong>{item.stock_on_hand.toLocaleString()}</strong></td>
                        <td style={{ textAlign: "right", color: item.allocated > 0 ? "#64748b" : "#cbd5e1" }}>{item.allocated.toLocaleString()}</td>
                        <td style={{ textAlign: "right", color: available <= item.reorder_point ? "#f59e0b" : "inherit" }}><strong>{available.toLocaleString()}</strong></td>
                        <td style={{ textAlign: "right" }} title={`Unit Cost: ${hkd(item.unit_cost_hkd)}`}>{hkd(itemAssetVal)}</td>
                        <td style={{ textAlign: "right" }}>
                          {editingReorderItem?.id === item.id ? (
                            <input
                              type="number"
                              defaultValue={item.reorder_point}
                              autoFocus
                              disabled={reorderBusy}
                              onBlur={(e) => handleSaveReorder(item, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveReorder(item, e.target.value);
                                if (e.key === "Escape") setEditingReorderItem(null);
                              }}
                              style={{
                                width: "60px",
                                padding: "4px",
                                borderRadius: "4px",
                                border: "1px solid var(--primary)",
                                textAlign: "right",
                                fontSize: "12px",
                                outline: "none"
                              }}
                            />
                          ) : (
                            <span 
                              style={{ cursor: "pointer", color: "var(--primary)", borderBottom: "1px dashed rgba(13, 148, 136, 0.3)", paddingBottom: "1px" }}
                              onClick={() => setEditingReorderItem(item)}
                              title="Click to edit threshold"
                            >
                              {item.reorder_point.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", color: isRecommended ? "#d97706" : "#94a3b8", fontWeight: isRecommended ? "700" : "inherit" }}>
                          {isRecommended ? `+${recQty.toLocaleString()}` : "-"}
                        </td>
                        <td>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "600",
                            color: badgeColor,
                            background: badgeBg
                          }}>
                            {statusText}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            <button
                              className="ghostButton"
                              style={{ padding: "4px 8px", fontSize: "12px", fontWeight: "600", color: "var(--primary)" }}
                              onClick={() => {
                                setAdjustingItem(item);
                                setQtyChange("");
                                setAdjustReason("Adjustment");
                                setAdjustError(null);
                              }}
                            >
                              Adjust
                            </button>
                            <button
                              className="ghostButton"
                              style={{ padding: "4px 8px", fontSize: "12px", fontWeight: "500", color: "#64748b" }}
                              onClick={() => setLedgerItem(item)}
                            >
                              History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adjustingItem && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="panel" style={{
            width: "100%",
            maxWidth: "400px",
            padding: "30px",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            background: "#ffffff"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0 }}>Adjust Inventory</h3>
              <button 
                onClick={() => setAdjustingItem(null)}
                style={{ background: "transparent", border: "0", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: "15px", fontSize: "13px" }}>
              <p style={{ margin: "0 0 5px", color: "#64748b" }}>SKU: <strong>{adjustingItem.sku}</strong></p>
              <p style={{ margin: 0, fontWeight: "500" }}>{adjustingItem.description}</p>
            </div>

            <form onSubmit={handleAdjustSubmit}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Quantity Change</label>
                <input
                  type="number"
                  placeholder="e.g. +100 or -50"
                  required
                  value={qtyChange}
                  onChange={(e) => setQtyChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    fontSize: "14px",
                    outline: "none"
                  }}
                />
                <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "block" }}>
                  Current Stock: <strong>{adjustingItem.stock_on_hand}</strong> (Available: {adjustingItem.stock_on_hand - adjustingItem.allocated})
                </span>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Reason</label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    fontSize: "14px",
                    background: "white",
                    outline: "none"
                  }}
                >
                  <option value="Adjustment">Physical Inventory Adjustment</option>
                  <option value="Receiving">Received New Stock Shipment</option>
                  <option value="Order Fulfillment">Order Fulfillment correction</option>
                  <option value="Damaged">Write-off (Damaged/Expired)</option>
                </select>
              </div>

              {adjustError && (
                <div style={{ marginBottom: "15px", color: "var(--error)", fontSize: "12px" }}>
                  {adjustError}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => setAdjustingItem(null)}
                  style={{ padding: "8px 16px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primaryButton"
                  disabled={adjustBusy}
                  style={{ padding: "8px 16px" }}
                >
                  {adjustBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement Ledger (Slide-over Drawer) */}
      {ledgerItem && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.3)",
          backdropFilter: "blur(2px)",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 1001
        }} onClick={() => setLedgerItem(null)}>
          <div 
            style={{
              width: "100%",
              maxWidth: "460px",
              height: "100%",
              background: "#ffffff",
              boxShadow: "-10px 0 25px -5px rgba(0,0,0,0.1)",
              padding: "40px 30px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b" }}>Audit Ledger</span>
                <h3 style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: "700" }}>Stock Movement History</h3>
              </div>
              <button 
                onClick={() => setLedgerItem(null)}
                style={{ background: "transparent", border: "0", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "15px", fontSize: "13px" }}>
              <p style={{ margin: "0 0 4px", color: "#64748b" }}>SKU: <strong>{ledgerItem.sku}</strong></p>
              <p style={{ margin: 0, fontWeight: "600", color: "#1e293b" }}>{ledgerItem.description}</p>
            </div>

            {ledgerLoading ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                <RefreshCw size={24} className="loadingSpinner" style={{ marginBottom: "10px" }} />
                <span>Loading movement history...</span>
              </div>
            ) : ledgerMovements.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", textAlign: "center" }}>
                <Package size={32} style={{ marginBottom: "12px", opacity: 0.5 }} />
                <p>No stock movement logs found for this item.</p>
                <small style={{ fontSize: "11px" }}>Movements are logged automatically when stock adjustments are made.</small>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                {ledgerMovements.map(m => {
                  const isPositive = m.qty_change > 0;
                  const formattedChange = isPositive ? `+${m.qty_change}` : m.qty_change;
                  const dateStr = new Date(m.timestamp).toLocaleString();
                  return (
                    <div key={m.id} style={{
                      padding: "16px",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <strong style={{ display: "block", fontSize: "13px", color: "#1e293b", marginBottom: "4px" }}>
                          {m.reason}
                        </strong>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{dateStr}</span>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                          Balance: {m.prev_qty} → <strong>{m.new_qty}</strong>
                        </div>
                      </div>
                      <span style={{
                        fontSize: "14px",
                        fontWeight: "700",
                        color: isPositive ? "#10b981" : "#ef4444",
                        background: isPositive ? "#ecfdf5" : "#fef2f2",
                        padding: "4px 10px",
                        borderRadius: "8px"
                      }}>
                        {formattedChange}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function AdsDashboard({ subtab, setSubtab, settings, campaigns, loading, error, loadData }) {
  const [appId, setAppId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [aiToggling, setAiToggling] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampName, setNewCampName] = useState("");
  const [newObjective, setNewObjective] = useState("Traffic");
  const [newDailyBudget, setNewDailyBudget] = useState("100");
  const [newCreativeText, setNewCreativeText] = useState("");
  const [newTargeting, setNewTargeting] = useState("Hong Kong");
  const [newPlacement, setNewPlacement] = useState("Facebook Feed");
  const [newImage, setNewImage] = useState("");
  const [mockLiked, setMockLiked] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image is too large. Please select an image under 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  const [selectedCampForPreview, setSelectedCampForPreview] = useState(null);
  const [applyingRec, setApplyingRec] = useState(false);

  async function handleApplyRecommendation(id) {
    setApplyingRec(true);
    try {
      const res = await fetch("/api/ads/campaigns/apply-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const d = await res.json();
      if (d.ok) {
        await loadData();
        setSelectedCampForPreview(prev => {
          if (!prev || prev.id !== id) return prev;
          
          const nextCost = Math.round(prev.metrics.cost_per_result * 0.85 * 100) / 100;
          const nextResults = Math.round(prev.metrics.results * 1.15);
          const nextSpent = Math.round(nextResults * nextCost * 100) / 100;
          const nextValue = prev.metrics.value > 0 ? Math.round(prev.metrics.value * 1.15 * 100) / 100 : 0.0;
          const nextRoas = nextValue > 0 ? Math.round((nextValue / nextSpent) * 100) / 100 : 0.0;
          
          return {
            ...prev,
            recommendations: 0,
            ai_adjusted: true,
            metrics: {
              ...prev.metrics,
              cost_per_result: nextCost,
              results: nextResults,
              spent: nextSpent,
              value: nextValue,
              roas: nextRoas
            }
          };
        });
      } else {
        alert(d.error || "Failed to apply recommendation.");
      }
    } catch (err) {
      alert("Error applying recommendation: " + err.message);
    } finally {
      setApplyingRec(false);
    }
  }

  useEffect(() => {
    if (settings) {
      setAppId(settings.app_id || "");
      setAccessToken(settings.access_token || "");
      setAdAccountId(settings.ad_account_id || "");
    }
  }, [settings]);

  async function handleCreateCampaign(e) {
    e.preventDefault();
    if (!newCampName) {
      alert("Please enter a campaign name.");
      return;
    }
    try {
      const res = await fetch("/api/ads/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampName,
          objective: newObjective,
          daily_budget: newDailyBudget,
          creative_text: newCreativeText,
          image_url: newImage,
          targeting: newTargeting,
          placement: newPlacement
        })
      });
      const d = await res.json();
      if (d.ok) {
        setNewCampName("");
        setNewObjective("Traffic");
        setNewDailyBudget("100");
        setNewCreativeText("");
        setNewTargeting("Hong Kong");
        setNewPlacement("Facebook Feed");
        setNewImage("");
        setShowCreateModal(false);
        await loadData();
      } else {
        alert(d.error || "Failed to create campaign.");
      }
    } catch (err) {
      alert("Error creating campaign: " + err.message);
    }
  }

  async function handleToggleCampStatus(id, currentStatus) {
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch("/api/ads/campaigns/toggle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus })
      });
      const d = await res.json();
      if (d.ok) {
        await loadData();
      } else {
        alert(d.error || "Failed to update status.");
      }
    } catch (err) {
      alert("Error toggling status: " + err.message);
    }
  }

  async function handleDeleteCampaign(id) {
    if (!window.confirm("Are you sure you want to delete this campaign?")) return;
    try {
      const res = await fetch("/api/ads/campaigns/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const d = await res.json();
      if (d.ok) {
        await loadData();
      } else {
        alert(d.error || "Failed to delete campaign.");
      }
    } catch (err) {
      alert("Error deleting campaign: " + err.message);
    }
  }

  async function handleConnect(e) {
    e.preventDefault();
    if (!appId || !accessToken || !adAccountId) {
      alert("Please fill out all credentials to connect.");
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await fetch("/api/ads/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connected: 1,
          app_id: appId,
          access_token: accessToken,
          ad_account_id: adAccountId
        })
      });
      const d = await res.json();
      if (d.ok) {
        await loadData();
      } else {
        alert(d.error || "Failed to connect Meta account.");
      }
    } catch (err) {
      alert("Error connecting Meta account: " + err.message);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Are you sure you want to disconnect your Meta Ads account?")) return;
    setFormSubmitting(true);
    try {
      const res = await fetch("/api/ads/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connected: 0,
          app_id: "",
          access_token: "",
          ad_account_id: ""
        })
      });
      const d = await res.json();
      if (d.ok) {
        setAppId("");
        setAccessToken("");
        setAdAccountId("");
        await loadData();
      } else {
        alert(d.error || "Failed to disconnect account.");
      }
    } catch (err) {
      alert("Error disconnecting account: " + err.message);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleAi() {
    const nextVal = settings?.ai_optimization ? 0 : 1;
    setAiToggling(true);
    try {
      const res = await fetch("/api/ads/toggle-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_optimization: nextVal })
      });
      const d = await res.json();
      if (d.ok) {
        await loadData();
        if (nextVal === 1 && (!settings || !settings.connected)) {
          setShowWarningModal(true);
        }
      } else {
        alert(d.error || "Failed to toggle AI optimization.");
      }
    } catch (err) {
      alert("Error toggling AI: " + err.message);
    } finally {
      setAiToggling(false);
    }
  }

  const isConnected = settings && settings.connected === 1;
  const isAiActive = settings && settings.ai_optimization === 1;

  const fmtNum = (val) => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("en-US").format(val);
  };

  const fmtCurrency = (val) => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  const chartData = useMemo(() => {
    if (!campaigns || !isConnected) return [];
    return campaigns
      .filter(c => c.metrics)
      .map(c => ({
        name: c.name.split("]")[0].replace("[", ""),
        Spent: c.metrics.spent,
        Value: c.metrics.value
      }));
  }, [campaigns, isConnected]);

  const trendData = useMemo(() => {
    if (!selectedCampForPreview || !selectedCampForPreview.metrics) return [];
    const totalResults = selectedCampForPreview.metrics.results || 100;
    const totalSpent = selectedCampForPreview.metrics.spent || 50;
    
    const data = [];
    const baseResults = totalResults / 7;
    const baseSpent = totalSpent / 7;
    
    // Hash campaign ID to generate deterministic fluctuation
    const idHash = selectedCampForPreview.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    for (let i = 6; i >= 0; i--) {
      const multiplier = 1 + Math.sin(idHash + i) * 0.25;
      const dayResults = Math.max(1, Math.round(baseResults * multiplier));
      const daySpent = Math.max(0.1, Math.round(baseSpent * multiplier * 100) / 100);
      
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      
      data.push({
        name: dateStr,
        Results: dayResults,
        Spent: daySpent
      });
    }
    return data;
  }, [selectedCampForPreview]);

  return (
    <main className="workspace">
      <header className="pageHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow">Ads Optimization</p>
          <h1>Meta Campaign Manager</h1>
          <p className="subtitle">Track Meta Ads in real time and let AI optimize bidding strategies automatically.</p>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f1f5f9", padding: "8px 16px", borderRadius: "30px", border: "1px solid var(--border)" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: isAiActive ? "var(--primary)" : "#64748b" }}>
            AI Auto-Optimization
          </span>
          <button 
            onClick={handleToggleAi}
            disabled={aiToggling}
            style={{
              width: "48px",
              height: "26px",
              borderRadius: "13px",
              background: isAiActive ? "var(--primary)" : "#cbd5e1",
              border: "none",
              position: "relative",
              cursor: "pointer",
              transition: "background-color 0.25s ease",
              display: "flex",
              alignItems: "center",
              padding: "2px"
            }}
          >
            <div 
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                transform: isAiActive ? "translateX(22px)" : "translateX(0)",
                transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
              }}
            />
          </button>
        </div>
      </header>

      {!isConnected && (
        <div style={{ 
          background: "#fffbeb", 
          border: "1px solid #fef3c7", 
          borderLeft: "4px solid #f59e0b",
          borderRadius: "8px", 
          padding: "16px 20px", 
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
        }}>
          <span style={{ fontSize: "20px" }}>⚠️</span>
          <div style={{ fontSize: "14px", color: "#b45309", lineHeight: "1.5" }}>
            <strong>Meta Ads Account Not Connected:</strong> Performance metrics are currently unavailable. 
            Please <button onClick={() => setSubtab("connection")} style={{ background: "none", border: "none", color: "var(--primary)", textDecoration: "underline", fontWeight: "600", cursor: "pointer", padding: "0" }}>connect your Meta account</button> to fetch live stats and activate AI optimization.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
        <button
          onClick={() => setSubtab("campaigns")}
          style={{
            background: "none",
            border: "none",
            borderBottom: subtab === "campaigns" ? "2px solid var(--primary)" : "2px solid transparent",
            color: subtab === "campaigns" ? "var(--primary)" : "#64748b",
            padding: "8px 4px 12px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          Campaign Performance
        </button>
        <button
          onClick={() => setSubtab("connection")}
          style={{
            background: "none",
            border: "none",
            borderBottom: subtab === "connection" ? "2px solid var(--primary)" : "2px solid transparent",
            color: subtab === "connection" ? "var(--primary)" : "#64748b",
            padding: "8px 4px 12px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          Meta Connection
        </button>
      </div>

      {subtab === "campaigns" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {isConnected && chartData.length > 0 && (
            <div className="panel" style={{ padding: "20px 24px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "16px", color: "#1e293b" }}>Spent vs Conversion Value</h3>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} stroke="#64748b" />
                    <YAxis fontSize={11} stroke="#64748b" />
                    <Tooltip formatter={(value) => `$${value}`} />
                    <Legend />
                    <Bar dataKey="Spent" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="panel" style={{ padding: "0", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Active Ad Campaigns</h3>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0" }}>Live performance report from Meta Ads Manager APIs.</p>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="primaryButton"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    height: "36px",
                    cursor: "pointer"
                  }}
                >
                  + Create Campaign
                </button>
                <button 
                  onClick={loadData}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  <RefreshCw size={14} className={loading ? "loadingSpinner" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="tableWrapper" style={{ overflowX: "auto" }}>
              <table className="cleanTable">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Campaign Name</th>
                    <th>Objective</th>
                    <th style={{ textAlign: "right" }}>Results</th>
                    <th style={{ textAlign: "right" }}>Results Value</th>
                    <th style={{ textAlign: "right" }}>ROAS</th>
                    <th style={{ textAlign: "right" }}>Cost per Result</th>
                    <th style={{ textAlign: "right" }}>Spent</th>
                    <th style={{ textAlign: "right" }}>Impressions</th>
                    <th style={{ textAlign: "right" }}>Reach</th>
                    <th style={{ textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns && campaigns.map(camp => {
                    const hasMetrics = camp.metrics !== null;
                    const isCampActive = camp.status === "ACTIVE";
                    return (
                      <tr key={camp.id} style={{ opacity: isCampActive ? 1 : 0.6 }}>
                        <td style={{ verticalAlign: "middle" }}>
                          <button
                            onClick={() => handleToggleCampStatus(camp.id, camp.status)}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              transition: "background 0.15s ease"
                            }}
                            title="Toggle status"
                          >
                            <span style={{
                              display: "inline-block",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: isCampActive ? "#10b981" : "#94a3b8"
                            }} />
                            <span style={{ fontSize: "11px", fontWeight: "600", color: isCampActive ? "#047857" : "#64748b" }}>
                              {camp.status}
                            </span>
                          </button>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                              onClick={() => setSelectedCampForPreview(camp)}
                              style={{
                                background: "transparent",
                                border: "none",
                                textAlign: "left",
                                cursor: "pointer",
                                padding: "0",
                                fontSize: "13px",
                                fontWeight: "700",
                                color: "var(--primary)",
                                textDecoration: "underline"
                              }}
                            >
                              {camp.name}
                            </button>
                            {camp.recommendations > 0 && (
                              <span style={{
                                background: "#ecfdf5",
                                color: "#047857",
                                fontSize: "11px",
                                fontWeight: "600",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                border: "1px solid #d1fae5"
                              }}>
                                {camp.recommendations} recommendation
                              </span>
                            )}
                            {camp.ai_adjusted && (
                              <span style={{
                                background: "rgba(13, 148, 136, 0.08)",
                                color: "var(--primary)",
                                fontSize: "11px",
                                fontWeight: "700",
                                padding: "2px 8px",
                                borderRadius: "12px"
                              }}>
                                AI Optimized
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{
                            background: "#f1f5f9",
                            color: "#475569",
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "2px 8px",
                            borderRadius: "4px"
                          }}>
                            {camp.objective}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {hasMetrics ? fmtNum(camp.metrics.results) : "-"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {hasMetrics ? (camp.metrics.value > 0 ? fmtCurrency(camp.metrics.value) : "$0.00") : "-"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {hasMetrics ? (camp.metrics.roas > 0 ? camp.metrics.roas.toFixed(2) : "-") : "-"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {hasMetrics ? fmtCurrency(camp.metrics.cost_per_result) : "-"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "600" }}>
                          {hasMetrics ? fmtCurrency(camp.metrics.spent) : "$0.00"}
                        </td>
                        <td style={{ textAlign: "right", color: "#64748b" }}>
                          {hasMetrics ? fmtNum(camp.metrics.impressions) : "-"}
                        </td>
                        <td style={{ textAlign: "right", color: "#64748b" }}>
                          {hasMetrics ? fmtNum(camp.metrics.reach) : "-"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => handleDeleteCampaign(camp.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "#ef4444",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "6px",
                              borderRadius: "4px"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#fee2e2"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            title="Delete campaign"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!campaigns || campaigns.length === 0) && (
                    <tr>
                      <td colSpan={11} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                        No active ads running at the moment. {!isConnected && "(Please connect your Meta account or click '+ Create Campaign' to get started.)"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: "560px" }}>
          <div className="panel" style={{ padding: "30px 40px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>Meta Ads Integration</h3>
            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "24px" }}>
              Configure your Meta Business Manager Developer API credentials to sync ad account campaigns.
            </p>

            {isConnected ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ background: "#22c55e", width: "12px", height: "12px", borderRadius: "50%" }} />
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#15803d" }}>Successfully Connected</span>
                </div>
                
                <div style={{ fontSize: "13px", color: "#166534", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div><b>Meta App ID:</b> {settings.app_id}</div>
                  <div><b>Ad Account ID:</b> {settings.ad_account_id}</div>
                </div>

                <button 
                  onClick={handleDisconnect}
                  disabled={formSubmitting}
                  style={{
                    alignSelf: "flex-start",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    marginTop: "10px"
                  }}
                >
                  Disconnect Account
                </button>
              </div>
            ) : (
              <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>Meta App ID</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Link2 size={16} style={{ position: "absolute", left: "12px", color: "#94a3b8" }} />
                    <input 
                      type="text" 
                      placeholder="e.g. 847291857392019"
                      value={appId}
                      onChange={(e) => setAppId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px 10px 38px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        fontSize: "14px",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>Access Token</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Key size={16} style={{ position: "absolute", left: "12px", color: "#94a3b8" }} />
                    <input 
                      type="password" 
                      placeholder="Enter Meta Access Token (EAAB...)"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px 10px 38px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        fontSize: "14px",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>Ad Account ID</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Database size={16} style={{ position: "absolute", left: "12px", color: "#94a3b8" }} />
                    <input 
                      type="text" 
                      placeholder="e.g. act_1234567890"
                      value={adAccountId}
                      onChange={(e) => setAdAccountId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px 10px 38px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        fontSize: "14px",
                        outline: "none"
                      }}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={formSubmitting}
                  className="primaryButton"
                  style={{ 
                    alignSelf: "flex-start", 
                    height: "42px", 
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer"
                  }}
                >
                  {formSubmitting ? <RefreshCw size={14} className="loadingSpinner" /> : <Link2 size={14} />}
                  Connect Account
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {showWarningModal && (
        <div style={{
          position: "fixed",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          background: "rgba(0,0,0,0.4)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: "1100"
        }}>
          <div className="panel" style={{ maxWidth: "460px", padding: "30px 40px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: "36px", display: "block", marginBottom: "16px" }}>⚙️</span>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px" }}>AI Optimization Active</h3>
            <p style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", marginBottom: "24px" }}>
              AI Auto-Optimization settings have been updated. However, a live connection is required for active optimization adjustments on your Meta campaigns.
            </p>
            <button 
              className="primaryButton"
              style={{ padding: "0 20px", height: "36px", margin: "0 auto" }}
              onClick={() => setShowWarningModal(false)}
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div style={{
          position: "fixed",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: "1100"
        }}>
          <div className="panel" style={{ 
            width: "95%", 
            maxWidth: "980px", 
            padding: "32px", 
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", 
            position: "relative",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            overflow: "hidden"
          }}>
            <button 
              onClick={() => {
                setShowCreateModal(false);
                setNewImage("");
                setNewTargeting("Hong Kong");
                setNewPlacement("Facebook Feed");
              }}
              style={{ position: "absolute", top: "24px", right: "24px", background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
            >
              <X size={20} />
            </button>
            <div>
              <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "4px", color: "var(--ink)" }}>Create New Ad Campaign</h3>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>Configure and review your Meta Ads Campaign creative and targeting metrics.</p>
            </div>
            
            <div style={{ display: "flex", gap: "28px", flex: 1, overflow: "hidden" }}>
              {/* Form Side */}
              <form 
                onSubmit={handleCreateCampaign} 
                style={{ 
                  flex: 1.2, 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "14px", 
                  overflowY: "auto", 
                  paddingRight: "8px",
                  maxHeight: "calc(90vh - 140px)"
                }}
              >
                {/* Campaign Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Campaign Name</label>
                  <input 
                    type="text" 
                    value={newCampName} 
                    onChange={(e) => setNewCampName(e.target.value)}
                    placeholder="e.g. [Teazen_Kombucha] Summer Promo Campaign"
                    required
                    style={{ 
                      padding: "10px 14px", 
                      borderRadius: "6px", 
                      border: "1px solid var(--border)", 
                      fontSize: "13px", 
                      outline: "none",
                      width: "100%",
                      transition: "border-color 0.15s ease"
                    }}
                  />
                </div>

                {/* Objective and Budget */}
                <div style={{ display: "flex", gap: "16px" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Objective</label>
                    <select 
                      value={newObjective} 
                      onChange={(e) => setNewObjective(e.target.value)}
                      style={{ 
                        padding: "10px 12px", 
                        borderRadius: "6px", 
                        border: "1px solid var(--border)", 
                        fontSize: "13px", 
                        outline: "none", 
                        background: "#fff",
                        width: "100%"
                      }}
                    >
                      <option value="Traffic">Traffic (Link Clicks)</option>
                      <option value="Awareness">Awareness (Reach)</option>
                      <option value="Engagement">Engagement (Video Views)</option>
                      <option value="Sales">Sales (Conversions)</option>
                    </select>
                  </div>
                  
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Daily Budget (USD)</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "12px", top: "10px", fontSize: "13px", color: "#64748b" }}>$</span>
                      <input 
                        type="number" 
                        value={newDailyBudget} 
                        onChange={(e) => setNewDailyBudget(e.target.value)}
                        placeholder="100"
                        min="1"
                        style={{ 
                          padding: "10px 14px 10px 24px", 
                          borderRadius: "6px", 
                          border: "1px solid var(--border)", 
                          fontSize: "13px", 
                          outline: "none",
                          width: "100%"
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Targeting and Placement */}
                <div style={{ display: "flex", gap: "16px" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Targeting Audience Location</label>
                    <div style={{ position: "relative" }}>
                      <Target size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "#64748b" }} />
                      <input 
                        type="text" 
                        value={newTargeting} 
                        onChange={(e) => setNewTargeting(e.target.value)}
                        placeholder="e.g. Hong Kong, United States"
                        style={{ 
                          padding: "10px 14px 10px 34px", 
                          borderRadius: "6px", 
                          border: "1px solid var(--border)", 
                          fontSize: "13px", 
                          outline: "none",
                          width: "100%"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Placement Platform</label>
                    <select 
                      value={newPlacement} 
                      onChange={(e) => setNewPlacement(e.target.value)}
                      style={{ 
                        padding: "10px 12px", 
                        borderRadius: "6px", 
                        border: "1px solid var(--border)", 
                        fontSize: "13px", 
                        outline: "none", 
                        background: "#fff",
                        width: "100%"
                      }}
                    >
                      <option value="Facebook Feed">Facebook Feed</option>
                      <option value="Instagram Feed">Instagram Feed</option>
                      <option value="Facebook Stories">Facebook Stories</option>
                      <option value="Messenger Inbox">Messenger Inbox</option>
                      <option value="Audience Network">Audience Network</option>
                    </select>
                  </div>
                </div>

                {/* Ad Copy */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Ad Copy / Creative Text</label>
                  <textarea 
                    value={newCreativeText} 
                    onChange={(e) => setNewCreativeText(e.target.value)}
                    placeholder="Enter primary text copy for the ad creative..."
                    rows="3"
                    style={{ 
                      padding: "10px 14px", 
                      borderRadius: "6px", 
                      border: "1px solid var(--border)", 
                      fontSize: "13px", 
                      outline: "none", 
                      resize: "none",
                      fontFamily: "inherit",
                      width: "100%"
                    }}
                  />
                </div>

                {/* Ad Creative Image Upload & Presets */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Ad Creative Image</label>
                  
                  {/* File Upload Dropzone */}
                  <div 
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    style={{
                      border: "2px dashed var(--line)",
                      borderRadius: "8px",
                      padding: "14px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: "#f8fafc",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      minHeight: "80px"
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "#f0fdfa"; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "#f8fafc"; }}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageChange} 
                      accept="image/*" 
                      style={{ display: "none" }} 
                    />
                    
                    {newImage ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", justifyContent: "center" }}>
                        <img 
                          src={newImage} 
                          alt="Ad thumbnail" 
                          style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }} 
                        />
                        <div style={{ textAlign: "left" }}>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--ink)", display: "block" }}>Custom image uploaded</span>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewImage("");
                            }}
                            style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", padding: 0, fontWeight: "600" }}
                          >
                            Remove image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={20} style={{ color: "#64748b" }} />
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569", display: "block" }}>
                            Click to upload custom ad creative image
                          </span>
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                            Supports PNG, JPG, WEBP (Max 2MB)
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Preset Pickers */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "500" }}>Or select a quick product template:</span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {[
                        { label: "Kombucha Drink", url: "https://images.unsplash.com/photo-1598122837302-38717474249a?w=600&auto=format&fit=crop&q=80" },
                        { label: "Grapefruit Tea", url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
                        { label: "Gold Painpatch", url: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80" },
                        { label: "Abstract Tech", url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80" }
                      ].map((preset, index) => {
                        const isSelected = newImage === preset.url;
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setNewImage(preset.url)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "4px",
                              border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
                              background: isSelected ? "rgba(13, 148, 136, 0.08)" : "#fff",
                              color: isSelected ? "var(--primary)" : "#475569",
                              fontSize: "11px",
                              fontWeight: isSelected ? "700" : "500",
                              cursor: "pointer",
                              transition: "all 0.1s ease"
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                      {newImage && (
                        <button
                          type="button"
                          onClick={() => setNewImage("")}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "4px",
                            border: "1px solid transparent",
                            background: "transparent",
                            color: "#ef4444",
                            fontSize: "11px",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="primaryButton"
                  style={{ height: "42px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "600", cursor: "pointer", marginTop: "12px", width: "100%" }}
                >
                  Launch Ad Campaign
                </button>
              </form>

              {/* Real-time Ad Preview Side */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", alignSelf: "stretch" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>Ad Preview (Mockup)</span>
                
                <div style={{
                  flex: 1,
                  background: "#ffffff",
                  border: "1px solid #e4e6eb",
                  borderRadius: "12px",
                  padding: "16px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }}>
                  <div>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: "13px"
                        }}>
                          LM
                        </div>
                        <div>
                          <div style={{ fontWeight: "700", fontSize: "13px", color: "#1c1e21", lineHeight: "1.2" }}>Lightmart Group</div>
                          <div style={{ fontSize: "11px", color: "#65676b", display: "flex", alignItems: "center", gap: "3px", marginTop: "2px" }}>
                            {newPlacement.includes("Instagram") ? "Instagram · Sponsored" : "Sponsored · 🌐"}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: "#65676b", cursor: "pointer", fontWeight: "bold", fontSize: "16px", transform: "translateY(-4px)" }}>•••</span>
                    </div>

                    {/* Creative Copy Text */}
                    <div style={{
                      fontSize: "13px",
                      color: "#050505",
                      lineHeight: "1.4",
                      marginBottom: "12px",
                      minHeight: "44px",
                      whiteSpace: "pre-wrap"
                    }}>
                      {newCreativeText || "Start typing your ad creative text to see a live preview..."}
                    </div>

                    {/* Media Body */}
                    {newImage ? (
                      <div style={{ width: "100%", height: "200px", position: "relative", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)", background: "#f8fafc" }}>
                        <img 
                          src={newImage} 
                          alt="Ad Creative Media Preview" 
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                        />
                      </div>
                    ) : (
                      <div style={{
                        height: "200px",
                        background: "linear-gradient(135deg, #0d9488 0%, #2563eb 100%)",
                        borderRadius: "6px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        padding: "16px",
                        textAlign: "center",
                        position: "relative",
                        overflow: "hidden",
                        border: "1px solid var(--border)"
                      }}>
                        <div style={{ position: "absolute", bottom: "-20px", right: "-20px", width: "100px", height: "100px", borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                        <span style={{ fontSize: "28px", marginBottom: "8px" }}>🚀</span>
                        <strong style={{ fontSize: "15px", textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
                          {newCampName || "New Ad Campaign"}
                        </strong>
                        <span style={{ fontSize: "11px", opacity: 0.85, marginTop: "4px" }}>
                          Budget: ${newDailyBudget || "0.00"} USD/day
                        </span>
                        <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: "20px", marginTop: "10px" }}>
                          {newObjective} · {newPlacement}
                        </span>
                      </div>
                    )}

                    {/* Action Link Banner */}
                    <div style={{
                      background: "#f0f2f5",
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "1px solid #e4e6eb",
                      borderTop: "none",
                      borderBottomLeftRadius: "6px",
                      borderBottomRightRadius: "6px"
                    }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden", flex: 1, paddingRight: "8px" }}>
                        <span style={{ fontSize: "10px", color: "#65676b", textTransform: "uppercase" }}>WWW.LIGHTMART.COM</span>
                        <strong style={{ fontSize: "12px", color: "#1c1e21", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {newCampName || "Campaign Active"}
                        </strong>
                      </div>
                      <button type="button" style={{
                        background: "#1877f2",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#ffffff",
                        cursor: "default",
                        flexShrink: 0
                      }}>
                        {newObjective === "Sales" ? "Shop Now" : newObjective === "Engagement" ? "Watch Video" : "Learn More"}
                      </button>
                    </div>
                  </div>

                  {/* Social Interactions Bar */}
                  <div style={{ marginTop: "12px" }}>
                    {/* Mock counts */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#65676b", paddingBottom: "8px", borderBottom: "1px solid #e4e6eb" }}>
                      <span>👍❤️ {mockLiked ? "49" : "48"} others</span>
                      <span>12 Comments · 3 Shares</span>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", justifyContent: "space-around", marginTop: "6px" }}>
                      <button 
                        type="button" 
                        onClick={() => setMockLiked(!mockLiked)}
                        style={{
                          background: "transparent",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          color: mockLiked ? "#1877f2" : "#65676b",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          padding: "6px 8px",
                          borderRadius: "4px"
                        }}
                        onMouseOver={(e) => { if (!mockLiked) e.currentTarget.style.background = "#f2f2f2"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <ThumbsUp size={14} fill={mockLiked ? "#1877f2" : "none"} />
                        Like
                      </button>
                      
                      <button 
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          color: "#65676b",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "default",
                          padding: "6px 8px",
                          borderRadius: "4px"
                        }}
                      >
                        <MessageSquare size={14} />
                        Comment
                      </button>

                      <button 
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          color: "#65676b",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "default",
                          padding: "6px 8px",
                          borderRadius: "4px"
                        }}
                      >
                        <Share2 size={14} />
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCampForPreview && (() => {
        const getCampaignImage = (camp) => {
          if (camp.image_url) return camp.image_url;
          const name = camp.name || "";
          if (name.includes("Grapefruit")) {
            return "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80";
          }
          if (name.includes("Kombucha")) {
            return "https://images.unsplash.com/photo-1598122837302-38717474249a?w=600&auto=format&fit=crop&q=80";
          }
          if (name.includes("Painpatch") || name.includes("Goldpatch")) {
            return "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80";
          }
          return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80";
        };

        const campaignTargeting = selectedCampForPreview.targeting || "Hong Kong";
        const campaignPlacement = selectedCampForPreview.placement || "Facebook Feed";
        const campaignImage = getCampaignImage(selectedCampForPreview);

        return (
          <div style={{
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: "1100"
          }} onClick={() => setSelectedCampForPreview(null)}>
            <div 
              style={{
                width: "100%",
                maxWidth: "460px",
                height: "100%",
                background: "#ffffff",
                boxShadow: "-10px 0 25px -5px rgba(0,0,0,0.1)",
                padding: "40px 30px",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                overflowY: "auto"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b" }}>Campaign details</span>
                  <h3 style={{ margin: "4px 0 0", fontSize: "18px", fontWeight: "700" }}>Creative & Parameters</h3>
                </div>
                <button 
                  onClick={() => setSelectedCampForPreview(null)}
                  style={{ background: "transparent", border: "0", cursor: "pointer", color: "#64748b" }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "15px" }}>
                <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: "12px" }}>Campaign Name</p>
                <strong style={{ fontSize: "15px", color: "#1e293b" }}>{selectedCampForPreview.name}</strong>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "15px" }}>
                <div>
                  <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px" }}>Objective</p>
                  <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "11px", fontWeight: "600", padding: "4px 10px", borderRadius: "4px", display: "inline-block" }}>
                    {selectedCampForPreview.objective}
                  </span>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px" }}>Daily Budget</p>
                  <strong style={{ fontSize: "14px", color: "#1e293b" }}>${selectedCampForPreview.daily_budget ? Number(selectedCampForPreview.daily_budget).toFixed(2) : "0.00"} USD</strong>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px" }}>Audience Location</p>
                  <strong style={{ fontSize: "13px", color: "#1e293b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Target size={12} style={{ color: "#64748b" }} />
                    {campaignTargeting}
                  </strong>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px" }}>Placement Platform</p>
                  <strong style={{ fontSize: "13px", color: "#1e293b" }}>{campaignPlacement}</strong>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "20px" }}>
                <p style={{ margin: "0", color: "#64748b", fontSize: "12px" }}>Ad Text Copy</p>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "13px", fontStyle: selectedCampForPreview.creative_text ? "normal" : "italic", color: selectedCampForPreview.creative_text ? "#1e293b" : "#94a3b8" }}>
                  {selectedCampForPreview.creative_text || "No creative copy provided."}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "20px" }}>
                <p style={{ margin: "0", color: "#64748b", fontSize: "12px" }}>Ad Creative Image</p>
                <div style={{ width: "100%", height: "180px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", background: "#f8fafc" }}>
                  <img 
                    src={campaignImage} 
                    alt="Campaign Media" 
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                  />
                </div>
              </div>

              {selectedCampForPreview.metrics && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <p style={{ margin: "0", color: "#64748b", fontSize: "12px" }}>Performance Summary</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Results ({selectedCampForPreview.objective})</span>
                      <strong style={{ fontSize: "16px", color: "#1e293b" }}>{fmtNum(selectedCampForPreview.metrics.results)}</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Amount Spent</span>
                      <strong style={{ fontSize: "16px", color: "#1e293b" }}>{fmtCurrency(selectedCampForPreview.metrics.spent)}</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>ROAS</span>
                      <strong style={{ fontSize: "16px", color: "#1e293b" }}>{selectedCampForPreview.metrics.roas > 0 ? selectedCampForPreview.metrics.roas.toFixed(2) : "-"}</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Cost per Result</span>
                      <strong style={{ fontSize: "16px", color: "#1e293b" }}>{fmtCurrency(selectedCampForPreview.metrics.cost_per_result)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {selectedCampForPreview.recommendations > 0 && (
                <div style={{
                  background: "rgba(13, 148, 136, 0.04)",
                  border: "1px solid rgba(13, 148, 136, 0.2)",
                  borderLeft: "4px solid var(--primary)",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  marginTop: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px" }}>💡</span>
                    <strong style={{ fontSize: "13px", color: "var(--primary)" }}>AI Optimization Suggestion</strong>
                  </div>
                  <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5", margin: 0 }}>
                    Cost per result is running slightly higher than expected. AI recommends switching to Target CPA bidding and adjusting bids by 15% to save budget.
                  </p>
                  <button
                    type="button"
                    disabled={applyingRec}
                    onClick={() => handleApplyRecommendation(selectedCampForPreview.id)}
                    style={{
                      background: "var(--primary)",
                      color: "#ffffff",
                      border: "none",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      alignSelf: "flex-start",
                      transition: "background 0.15s ease"
                    }}
                  >
                    {applyingRec && <RefreshCw size={12} className="loadingSpinner" />}
                    Apply AI Recommendation
                  </button>
                </div>
              )}

              {selectedCampForPreview.metrics && trendData.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
                  <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: "12px" }}>Daily Performance Trend (7 Days)</p>
                  <div style={{ width: "100%", height: 160 }}>
                    <ResponsiveContainer>
                      <ReLineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={9} stroke="#64748b" />
                        <YAxis fontSize={9} stroke="#64748b" />
                        <Tooltip formatter={(value, name) => [value, name]} />
                        <Line type="monotone" dataKey="Results" stroke="#0d9488" strokeWidth={2} activeDot={{ r: 6 }} name="Conversions" />
                        <Line type="monotone" dataKey="Spent" stroke="#3b82f6" strokeWidth={2} name="Spent ($)" />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}

// ==========================================================================
// AI Chat Widget Helpers & Component
// ==========================================================================

function extractScreenContext({ page, financeSubtab, debitSubtab, warehouseSubtab, adsSubtab, data, debitAudit, warehouseStock, adsCampaigns }) {
  const context = {
    page,
    timestamp: new Date().toISOString(),
    details: {}
  };

  if (page === "overview") {
    context.details = {
      title: "CRM Workspace Overview",
      companiesCount: data?.companyPerformance?.length || 0,
      dateCoverage: data?.meta?.skuDateRange ? `${data.meta.skuDateRange.min} to ${data.meta.skuDateRange.max}` : "Unknown",
      standardCurrency: "HKD",
      availableModules: ["Financial Consolidation", "Debit Note Auditing", "Warehouse Management", "Ads Optimization"]
    };
  } else if (page === "finance") {
    context.details = {
      title: `Financial Consolidation - Subtab: ${financeSubtab}`,
      filters: data?.filters || {}
    };
    if (financeSubtab === "summary" && data?.insights) {
      context.details.kpis = {
        revenue: data.insights.revenueTotal,
        expenses: data.insights.expenseTotal,
        costOfSales: data.insights.costOfSalesTotal,
        netEarnings: data.insights.netEarnings,
        netMargin: data.insights.netMargin
      };
      if (data.insights.topRevenueBrand) {
        context.details.topBrand = data.insights.topRevenueBrand;
      }
    } else if (financeSubtab === "sku" && data?.sku) {
      context.details.skuSummary = {
        totals: data.sku.totals,
        coverage: data.sku.costCoverage
      };
      context.details.topSKUs = (data.sku.rows || [])
        .slice(0, 5)
        .map(r => ({
          sku: r.sku,
          product: r.product_name,
          quantity: r.quantity,
          revenue: r.revenue,
          grossProfit: r.gross_profit,
          margin: r.gross_margin
        }));
    }
  } else if (page === "debit") {
    context.details = {
      title: `Debit Note Auditing - Subtab: ${debitSubtab}`
    };
    if (debitAudit) {
      context.details.auditSummary = debitAudit.summary || {};
      if (debitSubtab === "pricing" && debitAudit.pricingDiscrepancies) {
        context.details.pricingDiscrepanciesSample = (debitAudit.pricingDiscrepancies || [])
          .slice(0, 5)
          .map(d => ({
            brand: d.brand,
            sku: d.sku,
            invoice: d.invoice_number,
            claimPrice: d.claim_unit_price,
            systemPrice: d.promo_unit_price,
            discrepancy: d.discrepancy_amount
          }));
      } else if (debitSubtab === "overlaps" && debitAudit.overlappingClaims) {
        context.details.overlappingClaimsSample = (debitAudit.overlappingClaims || [])
          .slice(0, 5)
          .map(d => ({
            brand: d.brand,
            invoice1: d.invoice_number_1,
            invoice2: d.invoice_number_2,
            overlapAmount: d.overlap_amount
          }));
      }
    }
  } else if (page === "warehouse") {
    context.details = {
      title: `Warehouse Management - Subtab: ${warehouseSubtab}`
    };
    if (warehouseStock && warehouseStock.stockLevels) {
      const levels = warehouseStock.stockLevels;
      context.details.stockSummary = {
        totalSKUs: levels.length,
        reorderAlerts: levels.filter(l => l.stock_on_hand <= l.reorder_point).length
      };
      context.details.lowStockSample = levels
        .filter(l => l.stock_on_hand <= l.reorder_point)
        .slice(0, 5)
        .map(l => ({
          sku: l.sku,
          name: l.product_name,
          stock: l.stock_on_hand,
          reorderPoint: l.reorder_point
        }));
    }
  } else if (page === "ads") {
    context.details = {
      title: `Ads Optimization - Subtab: ${adsSubtab}`,
      connected: adsCampaigns?.connected || false,
      aiOptimizationActive: adsCampaigns?.ai_optimization || false
    };
    if (adsCampaigns?.campaigns) {
      context.details.campaignsSample = adsCampaigns.campaigns
        .slice(0, 5)
        .map(c => ({
          name: c.name,
          objective: c.objective,
          status: c.status,
          spent: c.metrics?.spent || 0,
          roas: c.metrics?.roas || 0,
          results: c.metrics?.results || 0
        }));
    }
  }

  return context;
}

function renderMarkdownToReact(text) {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
      const code = match ? match[2] : part.slice(3, -3);
      return (
        <pre key={index} style={{ overflowX: "auto" }}>
          <code>{code}</code>
        </pre>
      );
    }

    const lines = part.split("\n");
    const elements = [];
    let listItems = [];
    let tableRows = [];

    const flushList = (key) => {
      if (listItems.length > 0) {
        elements.push(<ul key={`list-${key}`}>{listItems}</ul>);
        listItems = [];
      }
    };

    const flushTable = (key) => {
      if (tableRows.length > 0) {
        elements.push(
          <table key={`table-${key}`}>
            <tbody>{tableRows}</tbody>
          </table>
        );
        tableRows = [];
      }
    };

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList(lineIdx);
        const cells = trimmed
          .split("|")
          .map(c => c.trim())
          .filter((c, i, arr) => i > 0 && i < arr.length - 1);
        
        if (cells.every(c => /^:-*|-*:?|^-+$/.test(c))) {
          return;
        }

        const isHeader = tableRows.length === 0;
        tableRows.push(
          <tr key={lineIdx}>
            {cells.map((cell, cellIdx) => {
              const content = parseInlineMarkdown(cell);
              return isHeader ? (
                <th key={cellIdx}>{content}</th>
              ) : (
                <td key={cellIdx}>{content}</td>
              );
            })}
          </tr>
        );
        return;
      }

      flushTable(lineIdx);

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        listItems.push(<li key={lineIdx}>{parseInlineMarkdown(trimmed.slice(2))}</li>);
        return;
      }

      flushList(lineIdx);

      if (trimmed === "") {
        return;
      }

      elements.push(<p key={lineIdx}>{parseInlineMarkdown(trimmed)}</p>);
    });

    flushList(lines.length);
    flushTable(lines.length);

    return <React.Fragment key={index}>{elements}</React.Fragment>;
  });
}

function parseInlineMarkdown(text) {
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const codeParts = part.split(/(`.*?`)/g);
    return codeParts.map((subPart, subIndex) => {
      if (subPart.startsWith("`") && subPart.endsWith("`")) {
        return <code key={subIndex} style={{ background: "rgba(0,0,0,0.05)", padding: "1px 4px", borderRadius: "3px", fontFamily: "monospace" }}>{subPart.slice(1, -1)}</code>;
      }
      return subPart;
    });
  });
}

function ChatWidget({ page, financeSubtab, debitSubtab, warehouseSubtab, adsSubtab, data, debitAudit, warehouseStock, adsCampaigns }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lightmart_crm_openai_key") || "");
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("lightmart_crm_openai_model") || "gpt-4o");
  const [tempKey, setTempKey] = useState("");

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    setTempKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: "Hello! I am your Lightmart CRM AI Assistant. I can analyze whatever is currently on your screen (P&L reports, SKU sales, audit records, inventory levels, or marketing campaigns) and answer questions or provide summaries.\n\nHow can I help you today?"
        }
      ]);
    }
  }, [messages]);

  const activeContext = useMemo(() => {
    return extractScreenContext({
      page,
      financeSubtab,
      debitSubtab,
      warehouseSubtab,
      adsSubtab,
      data,
      debitAudit,
      warehouseStock,
      adsCampaigns
    });
  }, [page, financeSubtab, debitSubtab, warehouseSubtab, adsSubtab, data, debitAudit, warehouseStock, adsCampaigns]);

  const saveSettings = (key, model) => {
    localStorage.setItem("lightmart_crm_openai_key", key);
    localStorage.setItem("lightmart_crm_openai_model", model);
    setApiKey(key);
    setSelectedModel(model);
    setShowSettings(false);
  };

  const removeKey = () => {
    localStorage.removeItem("lightmart_crm_openai_key");
    setApiKey("");
    setTempKey("");
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userText = inputValue.trim();
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setIsTyping(true);

    try {
      const chatHistory = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const systemPrompt = `You are Lightmart CRM AI, a premium assistant designed by Google DeepMind and integrated into the Lightmart CRM platform.
You have direct access to the user's active screen context.
Active Screen Page: ${activeContext.page}
Screen Context Data (JSON):
${JSON.stringify(activeContext.details, null, 2)}

Instructions:
1. Analyze the active screen context to answer the user's questions or summarize information.
2. Always format your responses in clean, professional Markdown. You can use bolding, bullet lists, inline code, and markdown tables.
3. Be concise, accurate, and insightful.
4. Reference actual numbers, items, or stats shown in the context data to answer precisely.
5. If the user asks general questions unrelated to the screen, answer them normally, but prioritize helper analysis of CRM data.`;

      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: userText }
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const resData = await response.json();
      const botResponse = resData.choices?.[0]?.message?.content || "No response received.";
      
      setMessages((prev) => [...prev, { role: "assistant", content: botResponse }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ **API Error**: ${err.message}\n\nPlease verify your OpenAI API Key in the settings panel and ensure you have active credits.`
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="crm-chat-widget">
      {!isOpen && (
        <button className="crm-chat-toggle" onClick={() => setIsOpen(true)} title="Ask CRM AI">
          <Bot size={24} />
          {!apiKey && <span className="pulse-dot" />}
        </button>
      )}

      <div className={`crm-chat-panel ${isOpen ? "open" : ""}`}>
        <div className="crm-chat-header">
          <div className="header-info">
            <h3>
              <Bot size={16} /> CRM AI Assistant
            </h3>
            <span className="status-indicator">
              <span className={`status-dot ${apiKey ? "active" : ""}`} />
              {apiKey ? "OpenAI Connected" : "API Key Required"}
            </span>
          </div>
          <div className="crm-chat-header-actions">
            <button onClick={() => setShowSettings(!showSettings)} title="AI Settings">
              <Settings size={16} />
            </button>
            <button onClick={() => setIsOpen(false)} title="Close Chat">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="crm-chat-context-badge" onClick={() => setShowContext(!showContext)}>
          <span className="badge-left">
            <span className="detection-pulse" />
            <span>Captured Context: {activeContext.page.toUpperCase()}</span>
          </span>
          <span>{showContext ? "Hide Details ▴" : "Inspect Data ▾"}</span>
        </div>
        {showContext && (
          <pre className="crm-chat-context-preview">
            {JSON.stringify(activeContext.details, null, 2)}
          </pre>
        )}

        {!apiKey ? (
          <div className="crm-chat-setup">
            <div className="setup-icon">
              <Key size={24} />
            </div>
            <h4>Connect OpenAI API</h4>
            <p>
              To enable screen analysis and query features, enter your OpenAI API key.
              Your key is saved locally in your browser storage.
            </p>
            <div className="key-input-container">
              <input
                type="password"
                placeholder="sk-proj-..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
              />
              <button onClick={() => saveSettings(tempKey, selectedModel)}>
                Save Key & Connect
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="crm-chat-body">
              {messages.map((msg, i) => (
                <div key={i} className={`crm-chat-msg-row ${msg.role}`}>
                  <div className="crm-chat-bubble">
                    {renderMarkdownToReact(msg.content)}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="crm-chat-msg-row bot">
                  <div className="crm-chat-bubble">
                    <div className="crm-chat-typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="crm-chat-footer" onSubmit={handleSend}>
              <div className="crm-chat-input-row">
                <input
                  type="text"
                  placeholder="Ask a question about this screen..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isTyping}
                />
                <button type="submit" className="crm-chat-send-btn" disabled={!inputValue.trim() || isTyping}>
                  <Send size={16} />
                </button>
              </div>
            </form>
          </>
        )}

        {showSettings && (
          <div className="crm-chat-settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="crm-chat-settings-panel" onClick={(e) => e.stopPropagation()}>
              <h4>AI Settings</h4>
              <div className="settings-field">
                <label>OpenAI Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="gpt-4o">gpt-4o (Recommended)</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                </select>
              </div>
              <div className="settings-field">
                <label>OpenAI API Key</label>
                <input
                  type="password"
                  value={tempKey}
                  placeholder="Enter sk-..."
                  onChange={(e) => setTempKey(e.target.value)}
                />
              </div>
              <div className="button-row">
                {apiKey && (
                  <button className="danger" onClick={removeKey}>
                    Disconnect Key
                  </button>
                )}
                <button className="primary" onClick={() => saveSettings(tempKey, selectedModel)}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [financeSubtab, setFinanceSubtab] = useState("summary");
  const [financeNavOpen, setFinanceNavOpen] = useState(false);
  const [debitSubtab, setDebitSubtab] = useState("summary");
  const [debitNavOpen, setDebitNavOpen] = useState(false);
  const [warehouseNavOpen, setWarehouseNavOpen] = useState(false);
  const [warehouseSubtab, setWarehouseSubtab] = useState("stock");
  const [warehouseStock, setWarehouseStock] = useState(null);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseError, setWarehouseError] = useState(null);
  
  const [adsNavOpen, setAdsNavOpen] = useState(false);
  const [adsSubtab, setAdsSubtab] = useState("campaigns");
  const [adsSettings, setAdsSettings] = useState(null);
  const [adsCampaigns, setAdsCampaigns] = useState(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState(null);
  
  const [debitAudit, setDebitAudit] = useState(null);
  const [debitLoading, setDebitLoading] = useState(false);
  const [debitError, setDebitError] = useState(null);
  const [selectedDebitBrand, setSelectedDebitBrand] = useState(null);
  const [selectedDebitFile, setSelectedDebitFile] = useState(null);

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

  async function loadDebitAudit() {
    setDebitLoading(true);
    try {
      const res = await fetch("/api/debit-notes/audit");
      const d = await res.json();
      if (d.ok) {
        setDebitAudit(d);
        setDebitError(null);
      } else {
        setDebitError(d.error || "Failed to load audit results.");
      }
    } catch (err) {
      setDebitError(err.message || "Failed to load audit data.");
    } finally {
      setDebitLoading(false);
    }
  }
  useEffect(() => {
    if (page === "debit" && !debitAudit && !debitLoading) {
      loadDebitAudit();
    }
  }, [page]);

  async function loadWarehouseStock() {
    setWarehouseLoading(true);
    try {
      const res = await fetch("/api/warehouse/stock-levels");
      const d = await res.json();
      if (d.ok) {
        setWarehouseStock(d.stockLevels);
        setWarehouseError(null);
      } else {
        setWarehouseError(d.error || "Failed to load warehouse stock levels.");
      }
    } catch (err) {
      setWarehouseError(err.message || "Failed to load warehouse data.");
    } finally {
      setWarehouseLoading(false);
    }
  }

  useEffect(() => {
    if (page === "warehouse" && !warehouseStock && !warehouseLoading) {
      loadWarehouseStock();
    }
  }, [page]);

  async function loadAdsData() {
    setAdsLoading(true);
    try {
      const res = await fetch("/api/ads/performance");
      const d = await res.json();
      if (d.ok) {
        setAdsCampaigns(d.campaigns);
        setAdsError(null);
      } else {
        setAdsError(d.error || "Failed to load ads performance.");
      }
      
      const settingsRes = await fetch("/api/ads/settings");
      const settingsD = await settingsRes.json();
      if (settingsD.ok) {
        setAdsSettings(settingsD.settings);
      }
    } catch (err) {
      setAdsError(err.message || "Failed to load ads data.");
    } finally {
      setAdsLoading(false);
    }
  }

  useEffect(() => {
    if (page === "ads" && !adsLoading) {
      loadAdsData();
    }
  }, [page]);

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
          <button className={page === "overview" ? "active" : ""} type="button" onClick={() => {
            setPage("overview");
            setFinanceNavOpen(false);
            setDebitNavOpen(false);
            setWarehouseNavOpen(false);
            setAdsNavOpen(false);
          }}>
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button
            className={`groupButton ${page === "finance" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setPage("finance");
              setFinanceNavOpen((open) => !open);
              setDebitNavOpen(false);
              setWarehouseNavOpen(false);
              setAdsNavOpen(false);
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
          <button
            className={`groupButton ${page === "debit" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setPage("debit");
              setDebitNavOpen((open) => !open);
              setFinanceNavOpen(false);
              setWarehouseNavOpen(false);
              setAdsNavOpen(false);
            }}
          >
            <Receipt size={18} />
            Debit Note
            <span className="chevron">
              {debitNavOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
          {debitNavOpen && (
            <div className="subNav">
              {[
                ["summary", "Summary"],
                ["pricing", "Price Discrepancies"],
                ["overlaps", "Overlapping Claims"],
                ["duplicates", "Duplicates Check"],
                ["unpromoted", "Missing Proposals"],
                ["explore", "Explore & Drilldown"],
                ["pdf_list", "All Claims (PDF)"],
                ["proposals_list", "All Proposals (Excel)"],
                ["import", "Import & Upload"],
              ].map(([id, label]) => (
                <button
                  className={page === "debit" && debitSubtab === id ? "active" : ""}
                  type="button"
                  key={id}
                  onClick={() => {
                    setPage("debit");
                    setDebitSubtab(id);
                    setSelectedDebitBrand(null);
                    setSelectedDebitFile(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            className={`groupButton ${page === "warehouse" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setPage("warehouse");
              setWarehouseNavOpen((open) => !open);
              setFinanceNavOpen(false);
              setDebitNavOpen(false);
              setAdsNavOpen(false);
            }}
          >
            <Package size={18} />
            Warehouse
            <span className="chevron">
              {warehouseNavOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
          {warehouseNavOpen && (
            <div className="subNav">
              {[
                ["stock", "Stock levels"],
              ].map(([id, label]) => (
                <button
                  className={page === "warehouse" && warehouseSubtab === id ? "active" : ""}
                  type="button"
                  key={id}
                  onClick={() => {
                    setPage("warehouse");
                    setWarehouseSubtab(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            className={`groupButton ${page === "ads" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setPage("ads");
              setAdsNavOpen((open) => !open);
              setFinanceNavOpen(false);
              setDebitNavOpen(false);
              setWarehouseNavOpen(false);
            }}
          >
            <LineChart size={18} />
            Ads Optimization
            <span className="chevron">
              {adsNavOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
          {adsNavOpen && (
            <div className="subNav">
              {[
                ["campaigns", "Campaigns"],
                ["connection", "Meta Connection"],
              ].map(([id, label]) => (
                <button
                  className={page === "ads" && adsSubtab === id ? "active" : ""}
                  type="button"
                  key={id}
                  onClick={() => {
                    setPage("ads");
                    setAdsSubtab(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
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
        <a 
          href="https://jjay.info" 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{
            textAlign: "center",
            display: "block",
            fontSize: "11px",
            color: "rgba(255, 255, 255, 0.4)",
            textDecoration: "none",
            marginTop: "12px",
            transition: "color 0.2s ease",
            fontWeight: "500"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.85)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.4)"; }}
        >
          Powered by JJAY TECH
        </a>
      </aside>

      {page === "overview" ? (
        <Overview data={data} goFinance={() => setPage("finance")} setPage={setPage} />
      ) : page === "debit" ? (
        <DebitNoteDashboard
          subtab={debitSubtab}
          setSubtab={setDebitSubtab}
          audit={debitAudit}
          loading={debitLoading}
          error={debitError}
          loadAudit={loadDebitAudit}
          selectedBrand={selectedDebitBrand}
          setSelectedBrand={setSelectedDebitBrand}
          selectedFile={selectedDebitFile}
          setSelectedFile={setSelectedDebitFile}
        />
      ) : page === "warehouse" ? (
        <WarehouseDashboard
          subtab={warehouseSubtab}
          setSubtab={setWarehouseSubtab}
          stock={warehouseStock}
          loading={warehouseLoading}
          error={warehouseError}
          loadStock={loadWarehouseStock}
        />
      ) : page === "ads" ? (
        <AdsDashboard
          subtab={adsSubtab}
          setSubtab={setAdsSubtab}
          settings={adsSettings}
          campaigns={adsCampaigns}
          loading={adsLoading}
          error={adsError}
          loadData={loadAdsData}
        />
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

      <ChatWidget
        page={page}
        financeSubtab={financeSubtab}
        debitSubtab={debitSubtab}
        warehouseSubtab={warehouseSubtab}
        adsSubtab={adsSubtab}
        data={data}
        debitAudit={debitAudit}
        warehouseStock={warehouseStock}
        adsCampaigns={adsCampaigns}
      />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
