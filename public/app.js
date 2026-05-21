import React, { useEffect, useMemo, useState } from "react";
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

function margin(row) {
  const revenue = Number(row.revenue || 0);
  return revenue ? `${((Number(row.net_earnings || 0) / revenue) * 100).toFixed(1)}%` : "0.0%";
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
  const cards = [
    {
      label: "Top revenue company",
      value: insights.topRevenueCompany?.company || "-",
      note: insights.topRevenueCompany ? hkd(insights.topRevenueCompany.revenue) : "-",
    },
    {
      label: "Best net margin",
      value: insights.bestMarginCompany?.company || "-",
      note: insights.bestMarginCompany ? pct(insights.bestMarginCompany.net_margin) : "-",
    },
    {
      label: "Largest expense",
      value: insights.largestExpense?.line_item || "-",
      note: insights.largestExpense ? `${hkd(insights.largestExpense.amount)} | ${pct(insights.largestExpense.share_of_revenue)} revenue` : "-",
    },
    {
      label: "Loss-making companies",
      value: String(insights.lossCompanies?.length || 0),
      note: insights.lossCompanies?.map((row) => row.company).join(", ") || "None in current filter",
    },
  ];

  return (
    <div className="insightGrid">
      {cards.map((card) => (
        <div className="insightCard" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <em>{card.note}</em>
        </div>
      ))}
    </div>
  );
}

function PerformanceTable({ rows }) {
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
          {rows.map((row) => (
            <tr key={row.company}>
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

function DateField({ label, value, onChange }) {
  return (
    <label className="field dateField">
      <span>{label}</span>
      <input type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} />
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
  const [batchName, setBatchName] = useState(`Initial import ${new Date().toISOString().slice(0, 10)}`);
  const [status, setStatus] = useState("");

  async function uploadInitial(files) {
    if (!files.length) return;
    setStatus("Uploading reports...");
    const form = new FormData();
    form.append("batchName", batchName || "Initial import");
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

function UploadPanel({ uploadState, onFiles }) {
  const [batchName, setBatchName] = useState(`Monthly upload ${new Date().toISOString().slice(0, 10)}`);
  return (
    <section className="importPanel">
      <div>
        <div className="sectionTitle">
          <FileUp size={18} />
          <h2>Import new reports</h2>
        </div>
        <p>Upload QuickBooks Profit and Loss by Class or by Customer `.xlsx` files. The system saves them, rebuilds SQLite, and refreshes the dashboard.</p>
        <p>Each upload becomes a separate batch, so new files do not disappear into one untracked pool.</p>
      </div>
      <label className="field">
        <span>Batch name</span>
        <input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="April 2026 closing pack" />
      </label>
      <label className={`dropzone ${uploadState.busy ? "busy" : ""}`}>
        <input type="file" accept=".xlsx" multiple disabled={uploadState.busy} onChange={(event) => onFiles(event.target.files, batchName)} />
        <UploadCloud size={24} />
        <strong>Upload Excel reports</strong>
        <span>Multiple files supported</span>
      </label>
      {uploadState.message && <p className="notice">{uploadState.message}</p>}
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
              <div key={report.source_file}>
                <strong>{report.company}</strong>
                <span>{report.batch_name} | {report.dimension} | {report.period_label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function FinancialDashboard({ data, filters, setFilters, search, setSearch, uploadState, uploadFiles, refresh }) {
  const [subtab, setSubtab] = useState("summary");

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
    ...data.meta.batches.map((batch) => ({ value: batch.batch_key, label: batch.name })),
  ];

  const filteredLines = data.lines.filter((row) => `${row.line_item} ${row.section}`.toLowerCase().includes(search.toLowerCase()));
  const topEntities = data.byEntity.slice(0, 10);
  const revenueBase = Number(data.kpis.revenue || 0);
  const grossMargin = revenueBase ? Number(data.kpis.gross_profit || 0) / revenueBase : 0;
  const expenseRatio = revenueBase ? Number(data.kpis.expenses || 0) / revenueBase : 0;
  const netMargin = revenueBase ? Number(data.kpis.net_earnings || 0) / revenueBase : 0;
  const eliminatedRevenue = Number(data.intercompany?.eliminated?.revenue || 0);

  return (
    <main className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Financial Consolidation</p>
          <h1>Profit and loss analytics</h1>
          <p className="subtitle">Consolidated HKD dashboard with controls for period, company, view, entity, and P&L section.</p>
        </div>
        <div className="headerActions">
          <label className="primaryButton">
            <input type="file" accept=".xlsx" multiple onChange={(event) => uploadFiles(event.target.files, `Quick upload ${new Date().toISOString().slice(0, 10)}`)} />
            <UploadCloud size={16} />
            Upload reports
          </label>
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
        <Select label="Section" value={filters.section} options={sectionOptions} onChange={(value) => setFilters({ ...filters, section: value })} />
        <DateField label="From" value={filters.dateFrom} onChange={(value) => setFilters({ ...filters, dateFrom: value })} />
        <DateField label="To" value={filters.dateTo} onChange={(value) => setFilters({ ...filters, dateTo: value })} />
        <label className="toggleField">
          <span>Intercompany</span>
          <button
            type="button"
            className={filters.includeIntercompany ? "toggle on" : "toggle"}
            onClick={() => setFilters({ ...filters, includeIntercompany: !filters.includeIntercompany })}
          >
            {filters.includeIntercompany ? "Shown" : "Hidden"}
          </button>
        </label>
      </section>
      <p className="filterHelp">
        Batch keeps uploads separate. Intercompany is hidden by default for external consolidated reporting.
      </p>

      <section className="metricGrid">
        <Kpi title="Revenue" value={hkd(data.kpis.revenue)} note="Total for Income" icon={TrendingUp} />
        <Kpi title="Gross margin" value={pct(grossMargin)} note={hkd(data.kpis.gross_profit)} icon={LineChart} />
        <Kpi title="Expense ratio" value={pct(expenseRatio)} note={hkd(data.kpis.expenses)} icon={WalletCards} />
        <Kpi title="Net margin" value={pct(netMargin)} note={hkd(data.kpis.net_earnings)} icon={CircleDollarSign} />
      </section>
      {!filters.includeIntercompany && Math.abs(eliminatedRevenue) > 0 && (
        <section className="eliminationBanner">
          <strong>Intercompany hidden</strong>
          <span>{hkd(eliminatedRevenue)} revenue excluded from this view. Toggle Intercompany to Shown to include internal transactions.</span>
        </section>
      )}

      <nav className="subtabs">
        {[
          ["summary", "Summary"],
          ["entities", "Brands / customers"],
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

      {subtab === "entities" && (
        <section className="cleanGrid">
          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Top brands and customers</h2>
                <p>Sorted by revenue</p>
              </div>
            </div>
            <div className="rankList compact">
              {topEntities.map((row, index) => (
                <button className="rankRow" key={row.entity} type="button" onClick={() => setFilters({ ...filters, entity: row.entity })}>
                  <span>{index + 1}</span>
                  <strong>{row.entity}</strong>
                  <em>{hkd(row.revenue)}</em>
                </button>
              ))}
            </div>
          </div>
          <div className="panel wide">
            <div className="panelHeader">
              <div>
                <h2>Company and entity detail</h2>
                <p>Drilldown by company, brand, and customer</p>
              </div>
            </div>
            <DataTable rows={data.companyEntity} />
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
              </div>
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

      {subtab === "import" && (
        <section className="cleanGrid">
          <UploadPanel uploadState={uploadState} onFiles={uploadFiles} />
          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2>Source reports</h2>
                <p>Included in consolidation</p>
              </div>
            </div>
            <div className="compactList">
              {data.meta.reports.map((report) => (
                <div key={report.source_file}>
                  <strong>{report.company}</strong>
                  <span>{report.batch_name} | {report.dimension} | {report.period_label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function ProfitLossStatement({ rows, revenueBase }) {
  const [expanded, setExpanded] = useState({ Income: true });
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
      <div className="statementHead">
        <span>Account</span>
        <span>HKD</span>
        <span>% revenue</span>
      </div>
      {Object.entries(groups).map(([section, sectionRows]) => {
        const open = !!expanded[section];
        const amount = sectionAmount(section, sectionRows);
        const pct = revenueBase ? `${((Number(amount || 0) / revenueBase) * 100).toFixed(1)}%` : "-";
        const visibleRows = open
          ? sectionRows
          : sectionRows.filter((row) => row.line_item === "Gross Profit" || row.line_item === "Net Earnings");

        return (
          <React.Fragment key={section}>
            <button className="statementSection" type="button" onClick={() => setExpanded({ ...expanded, [section]: !open })}>
              <span>{open ? "-" : "+"} {section}</span>
              <strong>{hkd(amount)}</strong>
              <em>{pct}</em>
            </button>
            {visibleRows.map((row) => {
              const rowPct = revenueBase ? `${((Number(row.amount || 0) / revenueBase) * 100).toFixed(1)}%` : "-";
              const isKeyTotal = row.line_item === "Gross Profit" || row.line_item === "Net Earnings";
              return (
                <div className={`statementRow ${row.is_total ? "total" : ""} ${isKeyTotal ? "keyTotal" : ""}`} key={`${row.section}-${row.line_item}`}>
                  <span>{row.line_item}</span>
                  <strong>{hkd(row.amount)}</strong>
                  <em>{rowPct}</em>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DataTable({ rows }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Brand / customer</th>
            <th>Revenue</th>
            <th>Gross profit</th>
            <th>Expenses</th>
            <th>Net earnings</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.company}-${row.entity}`}>
              <td>{row.company}</td>
              <td>{row.entity}</td>
              <td>{hkd(row.revenue)}</td>
              <td>{hkd(row.gross_profit)}</td>
              <td>{hkd(row.expenses)}</td>
              <td>{hkd(row.net_earnings)}</td>
              <td>{margin(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    includeIntercompany: false,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadState, setUploadState] = useState({ busy: false, message: "" });
  const [datesInitialized, setDatesInitialized] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/dashboard?${query}`);
    setData(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [query]);

  useEffect(() => {
    if (!data?.ready || datesInitialized) return;
    if (data.meta.dateRange?.min || data.meta.dateRange?.max) {
      setDatesInitialized(true);
      setFilters((current) => ({
        ...current,
        dateFrom: current.dateFrom || data.meta.dateRange.min || "",
        dateTo: current.dateTo || data.meta.dateRange.max || "",
      }));
    }
  }, [data, datesInitialized]);

  async function uploadFiles(files, batchName) {
    if (!files.length) return;
    setUploadState({ busy: true, message: "Uploading reports..." });
    const form = new FormData();
    form.append("batchName", batchName || `Upload ${new Date().toISOString().slice(0, 10)}`);
    Array.from(files).forEach((file) => form.append("files", file));

    const upload = await fetch("/api/upload-finance", { method: "POST", body: form }).then((response) => response.json());
    if (!upload.ok) {
      setUploadState({ busy: false, message: upload.message || upload.error || "Upload failed." });
      return;
    }

    setUploadState({ busy: true, message: "Rebuilding finance database..." });
    const imported = await fetch("/api/reimport-finance", { method: "POST" }).then((response) => response.json());
    setUploadState({ busy: false, message: imported.ok ? imported.stdout : imported.stderr || "Reimport failed." });
    await load();
  }

  if (!data) return <EmptyState message="Loading finance database..." />;
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
          refresh={load}
        />
      )}

      {loading && <div className="loading">Updating dashboard...</div>}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
