import { createServer } from "node:http";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const persistDir = process.env.PERSIST_DIR || "";
const dataDir = process.env.DATA_DIR || (persistDir ? join(persistDir, "data") : join(__dirname, "data"));
const dbPath = process.env.DATABASE_PATH || join(dataDir, "finance.sqlite");
const financeDir =
  process.env.FINANCE_DIR || (persistDir ? join(persistDir, "finance consilidation") : join(__dirname, "finance consilidation"));
const port = Number(process.env.PORT || 3000);
const authUser = process.env.CRM_USERNAME || "admin";
const passwordHash = process.env.CRM_PASSWORD_HASH || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const sessions = new Map();
const bundledPython = process.env.USERPROFILE
  ? join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
  : "";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function secureCookie(req) {
  return req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
}

function setSessionCookie(req, res, token) {
  const signedToken = `${token}.${createHmac("sha256", sessionSecret).update(token).digest("base64url")}`;
  const parts = [
    `lm_session=${encodeURIComponent(signedToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=28800",
  ];
  if (secureCookie(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "lm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function isAuthConfigured() {
  return Boolean(passwordHash && sessionSecret);
}

function verifyPassword(password) {
  const [scheme, iterationsRaw, salt, expected] = passwordHash.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsRaw || !salt || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;

  const actual = pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function isAuthenticated(req) {
  if (!isAuthConfigured()) return false;
  const signedToken = parseCookies(req).lm_session || "";
  const [token, signature] = signedToken.split(".");
  if (!token || !signature) return false;
  const expected = createHmac("sha256", sessionSecret).update(token).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return false;
  const session = token ? sessions.get(token) : null;
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  return true;
}

async function serveLogin(req, res) {
  const data = await readFile(join(publicDir, "login.html"));
  res.writeHead(200, {
    "content-type": mime[".html"],
    "cache-control": "no-store",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return safeFileName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uploadFinanceFiles(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    return { ok: false, message: "Upload must use multipart/form-data." };
  }

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const body = await readBody(req);
  const files = [];
  let batchName = "";
  let periodStart = "";
  let periodEnd = "";
  let batchKey = "";
  let batchDir = "";
  let batchLabel = "";
  let cursor = body.indexOf(boundary);

  while (cursor !== -1) {
    const next = body.indexOf(boundary, cursor + boundary.length);
    if (next === -1) break;

    const part = body.subarray(cursor + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > -1) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const fieldMatch = header.match(/name="([^"]+)"/i);
      const filenameMatch = header.match(/filename="([^"]+)"/i);
      const content = part.subarray(headerEnd + 4);
      if (!filenameMatch && fieldMatch?.[1] === "batchName") {
        batchName = content.toString("utf8").trim();
      }
      if (!filenameMatch && fieldMatch?.[1] === "periodStart") {
        periodStart = cleanDate(content.toString("utf8"));
      }
      if (!filenameMatch && fieldMatch?.[1] === "periodEnd") {
        periodEnd = cleanDate(content.toString("utf8"));
      }
      if (filenameMatch) {
        const originalName = safeFileName(filenameMatch[1]);
        if (!originalName.toLowerCase().endsWith(".xlsx")) {
          files.push({ name: originalName, skipped: true, reason: "Only .xlsx files are accepted." });
        } else {
          if (!batchKey) {
            if (periodStart && periodEnd && periodStart > periodEnd) {
              return { ok: false, message: "Batch period start must be before period end." };
            }
            const now = new Date();
            batchLabel = batchName || `Upload ${now.toISOString().slice(0, 10)}`;
            batchKey = `${now.toISOString().replace(/[:.]/g, "-")}-${slugify(batchLabel) || "batch"}`;
            batchDir = join(financeDir, "batches", batchKey);
            await mkdir(batchDir, { recursive: true });
            await writeFile(
              join(batchDir, "batch.json"),
              JSON.stringify({ name: batchLabel, uploaded_at: now.toISOString(), period_start: periodStart, period_end: periodEnd }, null, 2)
            );
          }
          const targetPath = join(batchDir, originalName);
          await writeFile(targetPath, content);
          files.push({ name: originalName, size: content.length, skipped: false, batch: batchLabel });
        }
      }
    }

    cursor = next;
  }

  return { ok: true, files };
}

function runImporter() {
  const python = process.env.PYTHON || (bundledPython && existsSync(bundledPython) ? bundledPython : "python3");
  return new Promise((resolve) => {
    const child = spawn(python, [join(__dirname, "scripts", "import_finance.py")], {
      cwd: __dirname,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        DATABASE_PATH: dbPath,
        FINANCE_DIR: financeDir,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function updateBatch(batchKey, details) {
  const safeName = String(details?.name || "").trim();
  const periodStart = cleanDate(details?.period_start);
  const periodEnd = cleanDate(details?.period_end);
  if (!safeName) return { ok: false, error: "Batch name is required." };
  if (periodStart && periodEnd && periodStart > periodEnd) return { ok: false, error: "Period start must be before period end." };
  if (batchKey === "initial-import") return { ok: false, error: "Initial import cannot be edited from the app." };

  const batchDir = normalize(join(financeDir, "batches", batchKey));
  const batchesRoot = normalize(join(financeDir, "batches"));
  if (!batchDir.startsWith(batchesRoot) || !existsSync(batchDir)) {
    return { ok: false, error: "Batch folder was not found." };
  }

  let existing = {};
  try {
    existing = JSON.parse(await readFile(join(batchDir, "batch.json"), "utf8"));
  } catch {}

  await writeFile(join(batchDir, "batch.json"), JSON.stringify({
    ...existing,
    name: safeName,
    uploaded_at: existing.uploaded_at || new Date().toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
  }, null, 2));
  return runImporter();
}

async function deleteBatch(batchKey) {
  if (batchKey === "initial-import") return { ok: false, error: "Initial import cannot be deleted from the app." };

  const batchDir = normalize(join(financeDir, "batches", batchKey));
  const batchesRoot = normalize(join(financeDir, "batches"));
  if (!batchDir.startsWith(batchesRoot) || !existsSync(batchDir)) {
    return { ok: false, error: "Batch folder was not found." };
  }

  await rm(batchDir, { recursive: true, force: true });
  return runImporter();
}

function openDb() {
  if (!existsSync(dbPath)) {
    return null;
  }
  return new DatabaseSync(dbPath, { readOnly: true });
}

function whereFromSearch(params, options = {}) {
  const includeSection = options.includeSection ?? false;
  const clauses = [];
  const values = {};
  const dimension = params.get("dimension") || "class";
  const company = params.get("company");
  const entity = params.get("entity");
  const section = params.get("section");
  const lineItem = params.get("lineItem");
  const batch = params.get("batch");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  if (dimension && dimension !== "all") {
    clauses.push("r.dimension = $dimension");
    values.$dimension = dimension;
  }
  if (company && company !== "all") {
    clauses.push("c.name = $company");
    values.$company = company;
  }
  if (entity && entity !== "all") {
    clauses.push("f.entity = $entity");
    values.$entity = entity;
  }
  if (includeSection && section && section !== "all") {
    clauses.push("f.section = $section");
    values.$section = section;
  }
  if (lineItem && lineItem !== "all") {
    clauses.push("f.line_item = $lineItem");
    values.$lineItem = lineItem;
  }
  if (batch && batch !== "all") {
    clauses.push("b.batch_key = $batch");
    values.$batch = batch;
  }
  clauses.push("f.is_intercompany = 0");
  if (dateFrom) {
    clauses.push("(r.period_end IS NULL OR r.period_end >= $dateFrom)");
    values.$dateFrom = dateFrom;
  }
  if (dateTo) {
    clauses.push("(r.period_start IS NULL OR r.period_start <= $dateTo)");
    values.$dateTo = dateTo;
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function entityOptionsWhere(params) {
  const clauses = [];
  const values = {};
  const dimension = params.get("dimension") || "class";
  const company = params.get("company");
  const batch = params.get("batch");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  if (dimension && dimension !== "all") {
    clauses.push("r.dimension = $dimension");
    values.$dimension = dimension;
  }
  if (company && company !== "all") {
    clauses.push("c.name = $company");
    values.$company = company;
  }
  if (batch && batch !== "all") {
    clauses.push("b.batch_key = $batch");
    values.$batch = batch;
  }
  clauses.push("f.is_intercompany = 0");
  if (dateFrom) {
    clauses.push("(r.period_end IS NULL OR r.period_end >= $dateFrom)");
    values.$dateFrom = dateFrom;
  }
  if (dateTo) {
    clauses.push("(r.period_start IS NULL OR r.period_start <= $dateTo)");
    values.$dateTo = dateTo;
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function intercompanyExpression(alias = "f", column = "entity") {
  const col = `${alias}.${column}`;
  return `(
    lower(${col}) LIKE '%lighthouse mart%'
    OR lower(${col}) LIKE '%moment health%'
    OR lower(${col}) LIKE '%rando plus%'
    OR ${col} LIKE '%健康創富%'
    OR lower(${col}) LIKE '%mhl%'
  )`;
}

function brandKeyExpression(alias, column) {
  const value = `lower(trim(${alias}.${column}))`;
  return `CASE
    WHEN ${value} = 'qol' THEN 'qollabs'
    WHEN ${value} = 'komorebei' THEN 'komorebi'
    WHEN ${value} = 'beauty of joseon' THEN 'boj'
    WHEN ${value} IN ('pearl''s', 'pearl’s') THEN 'pearls'
    WHEN ${value} LIKE 'healthall %' THEN 'healthall'
    ELSE ${value}
  END`;
}

function brandLabel(key, fallback) {
  const labels = {
    boj: "BOJ",
    healthall: "Healthall",
    komorebi: "KOMOREBI",
    pearls: "Pearls",
    qollabs: "QOLLABS",
  };
  return labels[key] || fallback;
}

function skuWhereFromSearch(params) {
  const clauses = [];
  const values = {};
  const company = params.get("company");
  const batch = params.get("batch");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  clauses.push(`NOT ${intercompanyExpression("s", "customer")}`);
  if (company && company !== "all") {
    clauses.push("c.name = $company");
    values.$company = company;
  }
  if (batch && batch !== "all") {
    clauses.push("b.batch_key = $batch");
    values.$batch = batch;
  }
  if (dateFrom) {
    clauses.push("(s.period_end IS NULL OR s.period_end >= $dateFrom)");
    values.$dateFrom = dateFrom;
  }
  if (dateTo) {
    clauses.push("(s.period_start IS NULL OR s.period_start <= $dateTo)");
    values.$dateTo = dateTo;
  }
  clauses.push("ABS(s.amount_hkd) > 0.01");

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function shiftDate(value, { years = 0, months = 0, days = 0 }) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function periodParams(params, dateFrom, dateTo) {
  const next = new URLSearchParams(params);
  next.set("dateFrom", dateFrom);
  next.set("dateTo", dateTo);
  return next;
}

function safeGrowth(current, previous) {
  const base = Number(previous || 0);
  if (Math.abs(base) < 0.01) return null;
  return (Number(current || 0) - base) / Math.abs(base);
}

function appendWhere(filter, condition) {
  return filter.sql ? `AND ${condition}` : `WHERE ${condition}`;
}

function getDashboard(params) {
  const db = openDb();
  if (!db) {
    return {
      ready: false,
      message: "Finance database not found. Run python scripts/import_finance.py first.",
    };
  }

  const filter = whereFromSearch(params);
  const sectionFilter = whereFromSearch(params, { includeSection: true });
  const baseJoin = `
    FROM (
      SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
      FROM facts raw_f
    ) f
    JOIN reports r ON r.id = f.report_id
    JOIN batches b ON b.id = r.batch_id
    JOIN companies c ON c.id = r.company_id
    ${filter.sql}
  `;
  const sectionJoin = `
    FROM (
      SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
      FROM facts raw_f
    ) f
    JOIN reports r ON r.id = f.report_id
    JOIN batches b ON b.id = r.batch_id
    JOIN companies c ON c.id = r.company_id
    ${sectionFilter.sql}
  `;

  const kpiRows = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN f.line_item IN ('Total for Income', 'Income') THEN f.amount_hkd ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN f.amount_hkd ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN f.amount_hkd ELSE 0 END) AS net_earnings
      ${baseJoin}
      `
    )
    .all(filter.values);

  const byCompany = db
    .prepare(
      `
      SELECT c.name AS company, c.source_currency AS currency,
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN f.amount_hkd ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN f.amount_hkd ELSE 0 END) AS net_earnings
      ${baseJoin}
      GROUP BY c.name, c.source_currency
      ORDER BY revenue DESC
      `
    )
    .all(filter.values);

  const revenueTotal = Number((kpiRows[0] || {}).revenue || 0);
  const expenseTotal = Number((kpiRows[0] || {}).expenses || 0);
  const companyPerformance = byCompany.map((row) => {
    const revenue = Number(row.revenue || 0);
    return {
      ...row,
      revenue_share: revenueTotal ? revenue / revenueTotal : 0,
      gross_margin: revenue ? Number(row.gross_profit || 0) / revenue : 0,
      expense_ratio: revenue ? Number(row.expenses || 0) / revenue : 0,
      net_margin: revenue ? Number(row.net_earnings || 0) / revenue : 0,
    };
  });

  const byEntity = db
    .prepare(
      `
      SELECT f.entity,
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN f.amount_hkd ELSE 0 END) AS net_earnings
      ${baseJoin}
      GROUP BY f.entity
      HAVING ABS(revenue) + ABS(gross_profit) + ABS(net_earnings) > 0
      ORDER BY revenue DESC
      LIMIT 25
      `
    )
    .all(filter.values);

  const expenses = db
    .prepare(
      `
      SELECT f.line_item,
        SUM(f.amount_hkd) AS amount
      ${baseJoin}
      ${appendWhere(filter, "f.section = 'Expenses'")}
      AND f.line_item NOT LIKE 'Total for%'
      GROUP BY f.line_item
      HAVING ABS(amount) > 0
      ORDER BY amount DESC
      LIMIT 12
      `
    )
    .all(filter.values);

  const expenseBreakdown = expenses.map((row) => ({
    ...row,
    share_of_expenses: expenseTotal ? Number(row.amount || 0) / expenseTotal : 0,
    share_of_revenue: revenueTotal ? Number(row.amount || 0) / revenueTotal : 0,
  }));

  const lines = db
    .prepare(
      `
      SELECT f.line_item, f.section, SUM(f.amount_hkd) AS amount
      ${sectionJoin}
      GROUP BY f.section, f.line_item
      HAVING ABS(amount) > 0
      ORDER BY ABS(amount) DESC
      LIMIT 80
      `
    )
    .all(sectionFilter.values);

  const pAndL = db
    .prepare(
      `
      SELECT
        f.section,
        f.line_item,
        MAX(f.is_total) AS is_total,
        MIN(f.row_order) AS row_order,
        SUM(f.amount_hkd) AS amount
      ${sectionJoin}
      GROUP BY f.section, f.line_item
      HAVING ABS(amount) > 0
      ORDER BY
        CASE f.section
          WHEN 'Income' THEN 1
          WHEN 'Cost of Sales' THEN 2
          WHEN 'Other Income(Loss)' THEN 3
          WHEN 'Expenses' THEN 4
          WHEN 'Other Expenses' THEN 5
          ELSE 9
        END,
        CASE
          WHEN f.line_item IN (
            'Total for Income',
            'Gross Profit',
            'Total for Other Income(Loss)',
            'Total for Expenses',
            'Total for Other Expenses',
            'Net Earnings'
          ) THEN 900
          ELSE row_order
        END,
        f.line_item
      `
    )
    .all(sectionFilter.values);

  const sectionSummary = db
    .prepare(
      `
      SELECT f.section, SUM(f.amount_hkd) AS amount, COUNT(*) AS rows
      ${baseJoin}
      GROUP BY f.section
      ORDER BY ABS(amount) DESC
      `
    )
    .all(filter.values);

  const eliminationWhere = filter.sql
    ? `${filter.sql.replace("f.is_intercompany = 0", "f.is_intercompany = 1")}`
    : "WHERE f.is_intercompany = 1";
  const eliminationValues = { ...filter.values };
  const intercompanyEliminations = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN f.amount_hkd ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN f.amount_hkd ELSE 0 END) AS net_earnings
      FROM (
        SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
        FROM facts raw_f
      ) f
      JOIN reports r ON r.id = f.report_id
      JOIN batches b ON b.id = r.batch_id
      JOIN companies c ON c.id = r.company_id
      ${eliminationWhere}
      `
    )
    .get(eliminationValues);

  const companyEntity = db
    .prepare(
      `
      SELECT c.name AS company, f.entity,
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN f.amount_hkd ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN f.amount_hkd ELSE 0 END) AS net_earnings
      ${baseJoin}
      GROUP BY c.name, f.entity
      HAVING ABS(revenue) + ABS(gross_profit) + ABS(expenses) + ABS(net_earnings) > 0
      ORDER BY revenue DESC
      LIMIT 120
      `
    )
    .all(filter.values);

  const meta = {
    batches: db.prepare("SELECT batch_key, name, uploaded_at, period_start, period_end FROM batches ORDER BY COALESCE(period_start, uploaded_at) DESC, id DESC").all(),
    companies: db.prepare("SELECT name, source_currency AS currency FROM companies ORDER BY name").all(),
    dimensions: db.prepare("SELECT DISTINCT dimension FROM reports ORDER BY dimension").all().map((x) => x.dimension),
    entities: db
      .prepare(
        `
        SELECT f.entity
        FROM (
          SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
          FROM facts raw_f
        ) f
        JOIN reports r ON r.id = f.report_id
        JOIN batches b ON b.id = r.batch_id
        JOIN companies c ON c.id = r.company_id
        ${entityOptionsWhere(params).sql}
        GROUP BY f.entity
        HAVING ABS(SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END)) > 0.01
        ORDER BY f.entity
        `
      )
      .all(entityOptionsWhere(params).values)
      .map((x) => x.entity),
    sections: db.prepare("SELECT DISTINCT section FROM facts WHERE section IS NOT NULL ORDER BY section").all().map((x) => x.section),
    fx: db.prepare("SELECT * FROM fx_rates ORDER BY source_currency").all(),
    reports: db
      .prepare(
        "SELECT b.batch_key, b.name AS batch_name, b.period_start AS batch_period_start, b.period_end AS batch_period_end, r.dimension, r.period_label, r.period_start, r.period_end, r.source_file, c.name AS company FROM reports r JOIN batches b ON b.id = r.batch_id JOIN companies c ON c.id = r.company_id ORDER BY COALESCE(b.period_start, b.uploaded_at) DESC, b.id DESC, c.name, r.dimension"
      )
      .all(),
    dateRange: db
      .prepare("SELECT MIN(period_start) AS min, MAX(period_end) AS max FROM reports")
      .get(),
  };

  const hasSkuSales = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sku_sales'").get();
  let skuTotals = {};
  let skuRows = [];
  let skuBrands = [];
  let brandMargins = [];
  let skuBrandLy = [];
  let skuBrandP3m = [];
  let skuLy = [];
  let skuP3m = [];
  if (hasSkuSales) {
    const skuFilter = skuWhereFromSearch(params);
    const skuBrandKey = brandKeyExpression("s", "brand");
    const skuJoin = `
      FROM sku_sales s
      JOIN batches b ON b.id = s.batch_id
      JOIN companies c ON c.id = s.company_id
      ${skuFilter.sql}
    `;
    skuTotals =
      db
        .prepare(
          `
          SELECT
            SUM(s.quantity) AS quantity,
            SUM(s.amount_hkd) AS revenue,
            COUNT(DISTINCT s.sku) AS sku_count,
            COUNT(DISTINCT ${skuBrandKey}) AS brand_count
          ${skuJoin}
          `
        )
        .get(skuFilter.values) || {};
    skuRows = db
      .prepare(
        `
        SELECT
          ${skuBrandKey} AS brand_key,
          MIN(s.brand) AS brand,
          s.sku,
          s.product_name,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          CASE WHEN SUM(s.quantity) != 0 THEN SUM(s.amount_hkd) / SUM(s.quantity) ELSE 0 END AS avg_price,
          COUNT(DISTINCT c.name) AS company_count,
          COUNT(DISTINCT s.customer) AS customer_count
        ${skuJoin}
        GROUP BY ${skuBrandKey}, s.sku, s.product_name
        HAVING ABS(revenue) > 0.01
        ORDER BY revenue DESC
        LIMIT 250
        `
      )
      .all(skuFilter.values);
    skuBrands = db
      .prepare(
        `
        SELECT
          ${skuBrandKey} AS brand_key,
          MIN(s.brand) AS brand,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          COUNT(DISTINCT s.sku) AS sku_count
        ${skuJoin}
        GROUP BY ${skuBrandKey}
        HAVING ABS(revenue) > 0.01
        ORDER BY revenue DESC
        LIMIT 80
        `
      )
      .all(skuFilter.values);

    const brandMarginParams = new URLSearchParams(params);
    brandMarginParams.set("dimension", "class");
    brandMarginParams.delete("entity");
    const brandMarginFilter = whereFromSearch(brandMarginParams);
    const pnlBrandKey = brandKeyExpression("f", "entity");
    const brandMarginJoin = `
      FROM (
        SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
        FROM facts raw_f
      ) f
      JOIN reports r ON r.id = f.report_id
      JOIN batches b ON b.id = r.batch_id
      JOIN companies c ON c.id = r.company_id
      ${brandMarginFilter.sql}
    `;
    brandMargins = db
      .prepare(
        `
        SELECT
          ${pnlBrandKey} AS brand_key,
          SUM(CASE WHEN f.line_item = 'Total for Income' THEN f.amount_hkd ELSE 0 END) AS pnl_revenue,
          SUM(CASE WHEN f.line_item = 'Gross Profit' THEN f.amount_hkd ELSE 0 END) AS gross_profit
        ${brandMarginJoin}
        GROUP BY ${pnlBrandKey}
        HAVING ABS(pnl_revenue) + ABS(gross_profit) > 0.01
        `
      )
      .all(brandMarginFilter.values);

    const currentFrom = params.get("dateFrom") || meta.dateRange?.min;
    const currentTo = params.get("dateTo") || meta.dateRange?.max;
    if (currentFrom && currentTo) {
      const lyFilter = skuWhereFromSearch(periodParams(params, shiftDate(currentFrom, { years: -1 }), shiftDate(currentTo, { years: -1 })));
      const p3mFilter = skuWhereFromSearch(periodParams(params, shiftDate(currentFrom, { months: -3 }), shiftDate(currentFrom, { days: -1 })));
      const comparisonSql = `
        SELECT ${skuBrandKey} AS brand_key, SUM(s.amount_hkd) AS revenue
        FROM sku_sales s
        JOIN batches b ON b.id = s.batch_id
        JOIN companies c ON c.id = s.company_id
      `;
      skuBrandLy = db
        .prepare(
          `
          ${comparisonSql}
          ${lyFilter.sql}
          GROUP BY ${skuBrandKey}
          `
        )
        .all(lyFilter.values);
      skuBrandP3m = db
        .prepare(
          `
          ${comparisonSql}
          ${p3mFilter.sql}
          GROUP BY ${skuBrandKey}
          `
        )
        .all(p3mFilter.values);

      const skuComparisonSql = `
        SELECT
          ${skuBrandKey} || '|' || lower(s.sku) || '|' || lower(s.product_name) AS sku_key,
          SUM(s.amount_hkd) AS revenue
        FROM sku_sales s
        JOIN batches b ON b.id = s.batch_id
        JOIN companies c ON c.id = s.company_id
      `;
      skuLy = db
        .prepare(
          `
          ${skuComparisonSql}
          ${lyFilter.sql}
          GROUP BY ${skuBrandKey}, lower(s.sku), lower(s.product_name)
          `
        )
        .all(lyFilter.values);
      skuP3m = db
        .prepare(
          `
          ${skuComparisonSql}
          ${p3mFilter.sql}
          GROUP BY ${skuBrandKey}, lower(s.sku), lower(s.product_name)
          `
        )
        .all(p3mFilter.values);
    }
  }

  db.close();

  const bestMarginCompany = companyPerformance
    .filter((row) => Number(row.revenue || 0) > 0)
    .sort((a, b) => b.net_margin - a.net_margin)[0];
  const topRevenueCompany = companyPerformance[0];
  const largestExpense = expenseBreakdown[0];
  const lossCompanies = companyPerformance.filter((row) => Number(row.net_earnings || 0) < 0);

  const brandMarginMap = new Map(
    brandMargins.map((row) => [
      row.brand_key,
      {
        gross_profit: Number(row.gross_profit || 0),
        pnl_revenue: Number(row.pnl_revenue || 0),
        gross_margin: Number(row.pnl_revenue || 0) ? Number(row.gross_profit || 0) / Number(row.pnl_revenue || 0) : null,
      },
    ])
  );
  const skuBrandLyMap = new Map(skuBrandLy.map((row) => [row.brand_key, Number(row.revenue || 0)]));
  const skuBrandP3mMap = new Map(skuBrandP3m.map((row) => [row.brand_key, Number(row.revenue || 0)]));
  const skuLyMap = new Map(skuLy.map((row) => [row.sku_key, Number(row.revenue || 0)]));
  const skuP3mMap = new Map(skuP3m.map((row) => [row.sku_key, Number(row.revenue || 0)]));
  const skuKey = (row) =>
    `${row.brand_key || String(row.brand || "").toLowerCase()}|${String(row.sku || "").toLowerCase()}|${String(row.product_name || "").toLowerCase()}`;

  return {
    ready: true,
    filters: Object.fromEntries(params.entries()),
    kpis: kpiRows[0] || {},
    byCompany,
    companyPerformance,
    byEntity,
    expenses: expenseBreakdown,
    lines,
    pAndL,
    sectionSummary,
    companyEntity,
    insights: {
      topRevenueCompany,
      bestMarginCompany,
      largestExpense,
      lossCompanies,
    },
    intercompany: {
      included: false,
      eliminated: intercompanyEliminations || {},
      rule: "Entity/customer names matching group company names are excluded by default.",
    },
    sku: {
      totals: skuTotals,
      rows: skuRows.map((row) => {
        const key = row.brand_key || String(row.brand || "").toLowerCase();
        const brandMargin = brandMarginMap.get(key);
        const grossMargin = brandMargin?.gross_margin ?? null;
        return {
          ...row,
          brand: brandLabel(key, row.brand),
          revenue_share: Number(skuTotals.revenue || 0) ? Number(row.revenue || 0) / Number(skuTotals.revenue || 0) : 0,
          gross_margin: grossMargin,
          gross_profit: grossMargin === null ? null : Number(row.revenue || 0) * grossMargin,
          growth_ly: safeGrowth(row.revenue, skuLyMap.get(skuKey(row))),
          growth_p3m: safeGrowth(row.revenue, skuP3mMap.get(skuKey(row))),
          growth_value_ly: skuLyMap.has(skuKey(row)) ? Number(row.revenue || 0) - skuLyMap.get(skuKey(row)) : null,
          growth_value_p3m: skuP3mMap.has(skuKey(row)) ? Number(row.revenue || 0) - skuP3mMap.get(skuKey(row)) : null,
        };
      }),
      brands: skuBrands.map((row) => ({
        ...row,
        brand: brandLabel(row.brand_key, row.brand),
        revenue_share: Number(skuTotals.revenue || 0) ? Number(row.revenue || 0) / Number(skuTotals.revenue || 0) : 0,
        gross_profit: brandMarginMap.get(row.brand_key)?.gross_profit ?? null,
        gross_margin: brandMarginMap.get(row.brand_key)?.gross_margin ?? null,
        growth_ly: safeGrowth(row.revenue, skuBrandLyMap.get(row.brand_key)),
        growth_p3m: safeGrowth(row.revenue, skuBrandP3mMap.get(row.brand_key)),
      })),
    },
    meta,
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    const data = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": mime[".html"] });
    res.end(data);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health") {
    json(res, 200, { ok: true, database: existsSync(dbPath), auth: isAuthConfigured() });
    return;
  }

  if (url.pathname === "/login") {
    if (isAuthenticated(req)) {
      res.writeHead(302, { location: "/" });
      res.end();
      return;
    }
    await serveLogin(req, res);
    return;
  }

  if (url.pathname === "/api/auth/status") {
    json(res, 200, { authenticated: isAuthenticated(req), configured: isAuthConfigured(), username: authUser });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (!isAuthConfigured()) {
      json(res, 500, { ok: false, error: "Login is not configured. Set CRM_PASSWORD_HASH and SESSION_SECRET." });
      return;
    }

    try {
      const body = await readJson(req);
      const usernameOk = String(body.username || "") === authUser;
      const passwordOk = verifyPassword(body.password || "");
      if (!usernameOk || !passwordOk) {
        json(res, 401, { ok: false, error: "Invalid username or password." });
        return;
      }

      const token = randomBytes(32).toString("base64url");
      sessions.set(token, { username: authUser, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      setSessionCookie(req, res, token);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const token = (parseCookies(req).lm_session || "").split(".")[0];
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    json(res, 200, { ok: true });
    return;
  }

  if (!isAuthenticated(req)) {
    if (url.pathname.startsWith("/api/")) {
      json(res, 401, { ok: false, error: "Login required." });
      return;
    }
    res.writeHead(302, { location: "/login" });
    res.end();
    return;
  }

  if (url.pathname === "/api/dashboard") {
    try {
      json(res, 200, getDashboard(url.searchParams));
    } catch (error) {
      json(res, 500, { ready: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/upload-finance" && req.method === "POST") {
    try {
      json(res, 200, await uploadFinanceFiles(req));
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/reimport-finance" && req.method === "POST") {
    json(res, 200, await runImporter());
    return;
  }

  const batchMatch = url.pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (batchMatch && req.method === "PATCH") {
    try {
      const body = await readJson(req);
      json(res, 200, await updateBatch(decodeURIComponent(batchMatch[1]), body));
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (batchMatch && req.method === "DELETE") {
    try {
      json(res, 200, await deleteBatch(decodeURIComponent(batchMatch[1])));
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  await serveStatic(req, res);
}).listen(port, () => {
  console.log(`Lightmart CRM running at http://localhost:${port}`);
});
