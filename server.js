import { createServer } from "node:http";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
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

function currentHongKongDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let answer = 0;
  if (op === "+") answer = num1 + num2;
  else if (op === "-") answer = num1 - num2;
  else if (op === "×") answer = num1 * num2;

  const timestamp = Date.now();
  const dataToSign = `${answer}.${timestamp}`;
  const signature = createHmac("sha256", sessionSecret || "temp_secret").update(dataToSign).digest("base64url");
  const token = `${timestamp}.${signature}`;

  return {
    question: `What is ${num1} ${op} ${num2}?`,
    token
  };
}

function verifyCaptcha(token, answerInput) {
  if (!token || answerInput === undefined || answerInput === null) return false;
  const [timestampStr, signature] = token.split(".");
  if (!timestampStr || !signature) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (Date.now() - timestamp > 5 * 60 * 1000) return false;

  const answer = parseInt(String(answerInput).trim(), 10);
  if (isNaN(answer)) return false;
  const dataToSign = `${answer}.${timestamp}`;
  const expectedSignature = createHmac("sha256", sessionSecret || "temp_secret").update(dataToSign).digest("base64url");

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
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

function runDebitNoteImporter() {
  const python = process.env.PYTHON || (bundledPython && existsSync(bundledPython) ? bundledPython : "python3");
  return new Promise((resolve) => {
    const child = spawn(python, [join(__dirname, "scripts", "import_debit_notes.py")], {
      cwd: __dirname,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        DATABASE_PATH: dbPath,
        DEBIT_NOTES_DIR: join(__dirname, "debit notes"),
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

async function uploadDebitNoteFiles(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    return { ok: false, message: "Upload must use multipart/form-data." };
  }

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const body = await readBody(req);
  const files = [];
  let cursor = body.indexOf(boundary);

  const debitNotesDir = normalize(join(__dirname, "debit notes"));
  await mkdir(debitNotesDir, { recursive: true });

  while (cursor !== -1) {
    const next = body.indexOf(boundary, cursor + boundary.length);
    if (next === -1) break;

    const part = body.subarray(cursor + boundary.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > -1) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const filenameMatch = header.match(/filename="([^"]+)"/i);
      const content = part.subarray(headerEnd + 4);
      
      if (filenameMatch) {
        const originalName = safeFileName(filenameMatch[1]);
        const ext = originalName.toLowerCase().split('.').pop();
        if (ext !== "pdf" && ext !== "xlsm") {
          files.push({ name: originalName, skipped: true, reason: "Only .pdf and .xlsm files are accepted." });
        } else {
          const targetPath = join(debitNotesDir, originalName);
          await writeFile(targetPath, content);
          files.push({ name: originalName, size: content.length, skipped: false });
        }
      }
    }

    cursor = next;
  }

  const importResult = await runDebitNoteImporter();
  return { ok: true, files, importResult };
}

async function clearDebitNotes() {
  const debitNotesDir = normalize(join(__dirname, "debit notes"));
  if (existsSync(debitNotesDir)) {
    const files = await readdir(debitNotesDir);
    for (const file of files) {
      const ext = file.toLowerCase().split('.').pop();
      if (ext === "pdf" || ext === "xlsm") {
        await rm(join(debitNotesDir, file), { force: true });
      }
    }
  }
  const importResult = await runDebitNoteImporter();
  return { ok: true, importResult };
}

function getDebitNotesAudit() {
  const db = openDb();
  if (!db) {
    return { ok: false, error: "Database not found." };
  }

  try {
    const hasDebitNotes = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debit_notes'").get();
    if (!hasDebitNotes) {
      return { ok: true, ready: false, message: "Debit Note tables not initialized. Please run import." };
    }

    const debitNotes = db.prepare("SELECT * FROM debit_notes ORDER BY date_from DESC, id DESC").all();
    const proposals = db.prepare("SELECT * FROM promotion_proposals ORDER BY start_date DESC, id DESC").all();

    // Overlapping claims across different files (potential double billing)
    const overlaps = db.prepare(`
      SELECT 
        a.id as a_id, a.file_name as a_file, a.sku as a_sku, a.description as a_desc, a.qty as a_qty, a.unit_cost as a_unit_cost, a.date_from as a_date_from, a.date_to as a_date_to,
        b.id as b_id, b.file_name as b_file, b.qty as b_qty, b.unit_cost as b_unit_cost, b.date_from as b_date_from, b.date_to as b_date_to
      FROM debit_notes a
      JOIN debit_notes b ON a.sku = b.sku AND a.id < b.id
      WHERE a.date_from <= b.date_to AND a.date_to >= b.date_from
        AND a.file_name != b.file_name
      ORDER BY a.sku, a.date_from DESC
    `).all();

    // Duplicate claims across different files (exact same quantity/period twice)
    const duplicates = db.prepare(`
      SELECT 
        a.id as a_id, a.file_name as a_file, a.sku as a_sku, a.description as a_desc, a.qty as a_qty, a.unit_cost as a_unit_cost, a.date_from as a_date_from, a.date_to as a_date_to,
        b.id as b_id, b.file_name as b_file
      FROM debit_notes a
      JOIN debit_notes b ON a.sku = b.sku AND a.id < b.id
      WHERE a.date_from = b.date_from AND a.date_to = b.date_to AND a.qty = b.qty AND a.unit_cost = b.unit_cost
        AND a.file_name != b.file_name
      ORDER BY a.sku, a.date_from DESC
    `).all();

    const priceDiscrepancies = [];
    const unmatchedPeriods = [];
    let totalOverchargeAmount = 0;

    for (const d of debitNotes) {
      // Find all proposals for this SKU that overlap with the debit note period
      const overlappingProps = proposals.filter(p => 
        p.sku === d.sku &&
        d.date_from <= p.end_date &&
        d.date_to >= p.start_date
      );

      if (overlappingProps.length === 0) {
        d.auditStatus = "unpromoted";
        unmatchedPeriods.push({
          debit_id: d.id,
          debit_file: d.file_name,
          sku: d.sku,
          description: d.description,
          qty: d.qty,
          charged_rate: d.unit_cost,
          date_from: d.date_from,
          date_to: d.date_to,
          status: "unpromoted"
        });
        continue;
      }

      // Check if there is an exact rate match (taking floating-point and rounding into account, e.g. within $0.10)
      const exactMatch = overlappingProps.find(p => Math.abs(d.unit_cost - p.funding_support_pc) < 0.10);

      if (exactMatch) {
        d.auditStatus = "match";
        d.matchedProposalFile = exactMatch.file_name;
        d.agreedRate = exactMatch.funding_support_pc;
        continue;
      }

      // No exact match. Let's see if the charged rate exceeds all active agreed rates.
      const maxAgreedRate = Math.max(...overlappingProps.map(p => p.funding_support_pc));

      if (d.unit_cost - maxAgreedRate >= 0.10) {
        // True discrepancy: charged more than the highest agreed rate
        const overchargePerPc = d.unit_cost - maxAgreedRate;
        const totalOvercharge = overchargePerPc * d.qty;
        totalOverchargeAmount += totalOvercharge;

        const bestProp = overlappingProps.find(p => p.funding_support_pc === maxAgreedRate) || overlappingProps[0];

        const discrepancyItem = {
          debit_id: d.id,
          debit_file: d.file_name,
          sku: d.sku,
          description: d.description,
          qty: d.qty,
          charged_rate: d.unit_cost,
          date_from: d.date_from,
          date_to: d.date_to,
          proposal_file: bestProp.file_name,
          agreed_rate: maxAgreedRate,
          proposal_start: bestProp.start_date,
          proposal_end: bestProp.end_date,
          overcharge_per_pc: overchargePerPc,
          total_overcharge: totalOvercharge,
          status: "overcharged"
        };

        priceDiscrepancies.push(discrepancyItem);
        d.auditStatus = "overcharged";
        d.matchedProposalFile = bestProp.file_name;
        d.agreedRate = maxAgreedRate;
        d.overchargePerPc = overchargePerPc;
        d.totalOvercharge = totalOvercharge;
      } else {
        // Charged less than or equal to the maximum agreed rate (undercharged or partial)
        const closestProp = overlappingProps.find(p => p.funding_support_pc >= d.unit_cost) || overlappingProps[0];
        d.auditStatus = "match"; // Considered a match as it's below the max agreed rate
        d.matchedProposalFile = closestProp.file_name;
        d.agreedRate = closestProp.funding_support_pc;
      }
    }

    const stats = {
      totalDebitNotes: debitNotes.length,
      totalProposals: proposals.length,
      overlapsCount: overlaps.length,
      duplicatesCount: duplicates.length,
      priceDiscrepanciesCount: priceDiscrepancies.length,
      unmatchedPeriodsCount: unmatchedPeriods.length,
      totalClaimedAmount: debitNotes.reduce((sum, item) => sum + (item.qty * item.unit_cost), 0),
      totalOverchargeAmount: totalOverchargeAmount,
      totalUnpromotedAmount: unmatchedPeriods.reduce((sum, item) => sum + (item.qty * item.charged_rate), 0)
    };

    return {
      ok: true,
      ready: true,
      stats,
      debitNotes,
      proposals,
      overlaps,
      duplicates,
      priceDiscrepancies,
      unmatchedPeriods
    };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    db.close();
  }
}

function selectedEntities(params) {
  return params.getAll("entity").filter((value) => value && value !== "all");
}

function addInClause(clauses, values, expression, items, prefix) {
  if (!items.length) return;
  const placeholders = items.map((item, index) => {
    const key = `$${prefix}${index}`;
    values[key] = item;
    return key;
  });
  clauses.push(`${expression} IN (${placeholders.join(", ")})`);
}

function whereFromSearch(params, options = {}) {
  const includeSection = options.includeSection ?? false;
  const clauses = [];
  const values = {};
  const dimension = params.get("dimension") || "class";
  const company = params.get("company");
  const selectedBrands = params.getAll("brand").filter((value) => value && value !== "all");
  const selectedCustomers = params.getAll("customer").filter((value) => value && value !== "all");
  const section = params.get("section");
  const lineItem = params.get("lineItem");
  const batch = params.get("batch");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const rankFrom = dateFrom ? "$dateFrom" : "'0001-01-01'";
  const rankTo = dateTo ? "$dateTo" : "'9999-12-31'";
  const candidateOverlapDays = `(
    julianday(min(COALESCE(r.period_end, '9999-12-31'), ${rankTo})) -
    julianday(max(COALESCE(r.period_start, '0001-01-01'), ${rankFrom})) + 1
  )`;
  const candidateReportDays = `(
    julianday(COALESCE(r.period_end, '9999-12-31')) -
    julianday(COALESCE(r.period_start, '0001-01-01')) + 1
  )`;
  const competitorOverlapDays = `(
    julianday(min(COALESCE(broader.period_end, '9999-12-31'), ${rankTo})) -
    julianday(max(COALESCE(broader.period_start, '0001-01-01'), ${rankFrom})) + 1
  )`;
  const competitorReportDays = `(
    julianday(COALESCE(broader.period_end, '9999-12-31')) -
    julianday(COALESCE(broader.period_start, '0001-01-01')) + 1
  )`;

  if (dimension && dimension !== "all") {
    clauses.push("r.dimension = $dimension");
    values.$dimension = dimension;
  }
  if (company && company !== "all") {
    clauses.push("c.name = $company");
    values.$company = company;
  }
  if (dimension === "class" && selectedBrands.length) {
    const brandConditions = selectedBrands.map((brand, index) => {
      const key = `$brand${index}`;
      values[key] = brand;
      return `${brandKeyFromValue("f.entity")} = ${brandKeyFromValue(key)}`;
    });
    clauses.push(`(${brandConditions.join(" OR ")})`);
  } else if (dimension === "customer" && selectedCustomers.length) {
    addInClause(clauses, values, "f.entity", selectedCustomers, "customer");
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
  clauses.push(`NOT EXISTS (
    SELECT 1
    FROM reports broader
    WHERE broader.company_id = r.company_id
      AND broader.dimension = r.dimension
      ${batch && batch !== "all" ? "AND broader.batch_id = r.batch_id" : ""}
      AND broader.id != r.id
      AND broader.period_start IS NOT NULL
      AND broader.period_end IS NOT NULL
      AND r.period_start IS NOT NULL
      AND r.period_end IS NOT NULL
      ${dateFrom ? "AND broader.period_end >= $dateFrom" : ""}
      ${dateTo ? "AND broader.period_start <= $dateTo" : ""}
      AND (
        ${competitorOverlapDays} > ${candidateOverlapDays}
        OR (
          ${competitorOverlapDays} = ${candidateOverlapDays}
          AND ${competitorReportDays} < ${candidateReportDays}
        )
        OR (
          ${competitorOverlapDays} = ${candidateOverlapDays}
          AND ${competitorReportDays} = ${candidateReportDays}
          AND broader.period_end > r.period_end
        )
      )
  )`);

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
  const rankFrom = dateFrom ? "$dateFrom" : "'0001-01-01'";
  const rankTo = dateTo ? "$dateTo" : "'9999-12-31'";
  const candidateOverlapDays = `(
    julianday(min(COALESCE(r.period_end, '9999-12-31'), ${rankTo})) -
    julianday(max(COALESCE(r.period_start, '0001-01-01'), ${rankFrom})) + 1
  )`;
  const candidateReportDays = `(
    julianday(COALESCE(r.period_end, '9999-12-31')) -
    julianday(COALESCE(r.period_start, '0001-01-01')) + 1
  )`;
  const competitorOverlapDays = `(
    julianday(min(COALESCE(broader.period_end, '9999-12-31'), ${rankTo})) -
    julianday(max(COALESCE(broader.period_start, '0001-01-01'), ${rankFrom})) + 1
  )`;
  const competitorReportDays = `(
    julianday(COALESCE(broader.period_end, '9999-12-31')) -
    julianday(COALESCE(broader.period_start, '0001-01-01')) + 1
  )`;

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
  clauses.push(`NOT EXISTS (
    SELECT 1
    FROM reports broader
    WHERE broader.company_id = r.company_id
      AND broader.dimension = r.dimension
      ${batch && batch !== "all" ? "AND broader.batch_id = r.batch_id" : ""}
      AND broader.id != r.id
      AND broader.period_start IS NOT NULL
      AND broader.period_end IS NOT NULL
      AND r.period_start IS NOT NULL
      AND r.period_end IS NOT NULL
      ${dateFrom ? "AND broader.period_end >= $dateFrom" : ""}
      ${dateTo ? "AND broader.period_start <= $dateTo" : ""}
      AND (
        ${competitorOverlapDays} > ${candidateOverlapDays}
        OR (
          ${competitorOverlapDays} = ${candidateOverlapDays}
          AND ${competitorReportDays} < ${candidateReportDays}
        )
        OR (
          ${competitorOverlapDays} = ${candidateOverlapDays}
          AND ${competitorReportDays} = ${candidateReportDays}
          AND broader.period_end > r.period_end
        )
      )
  )`);

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

function brandKeyFromValue(valueSql) {
  const value = `lower(trim(${valueSql}))`;
  return `CASE
    WHEN ${value} IN ('allklear', 'allkear') OR ${value} LIKE '%全清%' THEN 'allklear'
    WHEN ${value} IN ('better', 'donghwa') THEN 'better'
    WHEN ${value} = 'qol' THEN 'qollabs'
    WHEN ${value} = 'komorebei' THEN 'komorebi'
    WHEN ${value} = 'beauty of joseon' THEN 'boj'
    WHEN ${value} IN ('pearl''s', 'pearl’s') THEN 'pearls'
    WHEN ${value} LIKE '%珮夫人%' OR ${value} LIKE '%珮氏%' THEN 'pearls'
    WHEN ${value} LIKE '%健之堂%' THEN 'healthall'
    WHEN ${value} LIKE 'healthall %' THEN 'healthall'
    ELSE ${value}
  END`;
}

function brandKeyExpression(alias, column) {
  return brandKeyFromValue(`${alias}.${column}`);
}

function brandLabel(key, fallback) {
  const labels = {
    allklear: "AllKlear",
    better: "Better",
    boj: "BOJ",
    healthall: "Healthall",
    komorebi: "KOMOREBI",
    pearls: "Pearls",
    qollabs: "QOLLABS",
  };
  return labels[key] || fallback;
}

function skuDateExpression(alias = "s") {
  return `CASE
    WHEN ${alias}.transaction_date LIKE '____-__-__' THEN ${alias}.transaction_date
    WHEN ${alias}.transaction_date LIKE '__/__/____' THEN substr(${alias}.transaction_date, 7, 4) || '-' || substr(${alias}.transaction_date, 4, 2) || '-' || substr(${alias}.transaction_date, 1, 2)
    WHEN ${alias}.transaction_date LIKE '_/__/____' THEN substr(${alias}.transaction_date, 6, 4) || '-' || substr(${alias}.transaction_date, 3, 2) || '-0' || substr(${alias}.transaction_date, 1, 1)
    WHEN ${alias}.transaction_date LIKE '__/_/____' THEN substr(${alias}.transaction_date, 6, 4) || '-0' || substr(${alias}.transaction_date, 4, 1) || '-' || substr(${alias}.transaction_date, 1, 2)
    WHEN ${alias}.transaction_date LIKE '_/_/____' THEN substr(${alias}.transaction_date, 5, 4) || '-0' || substr(${alias}.transaction_date, 3, 1) || '-0' || substr(${alias}.transaction_date, 1, 1)
    WHEN ${alias}.transaction_date LIKE '__.__.____' THEN substr(${alias}.transaction_date, 7, 4) || '-' || substr(${alias}.transaction_date, 4, 2) || '-' || substr(${alias}.transaction_date, 1, 2)
    WHEN ${alias}.transaction_date LIKE '_.__.____' THEN substr(${alias}.transaction_date, 6, 4) || '-' || substr(${alias}.transaction_date, 3, 2) || '-0' || substr(${alias}.transaction_date, 1, 1)
    WHEN ${alias}.transaction_date LIKE '__._.____' THEN substr(${alias}.transaction_date, 6, 4) || '-0' || substr(${alias}.transaction_date, 4, 1) || '-' || substr(${alias}.transaction_date, 1, 2)
    WHEN ${alias}.transaction_date LIKE '_._.____' THEN substr(${alias}.transaction_date, 5, 4) || '-0' || substr(${alias}.transaction_date, 3, 1) || '-0' || substr(${alias}.transaction_date, 1, 1)
    ELSE NULL
  END`;
}

function skuWhereFromSearch(params) {
  const clauses = [];
  const values = {};
  const dimension = params.get("dimension") || "class";
  const company = params.get("company");
  const selectedBrands = params.getAll("brand").filter((value) => value && value !== "all");
  const selectedCustomers = params.getAll("customer").filter((value) => value && value !== "all");
  const batch = params.get("batch");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const skuDate = skuDateExpression("s");

  clauses.push(`NOT ${intercompanyExpression("s", "customer")}`);
  if (company && company !== "all") {
    clauses.push("c.name = $company");
    values.$company = company;
  }
  if (batch && batch !== "all") {
    clauses.push("b.batch_key = $batch");
    values.$batch = batch;
  }
  if (selectedBrands.length) {
    const brandConditions = selectedBrands.map((brand, index) => {
      const key = `$brand${index}`;
      values[key] = brand;
      return `(
        ${brandKeyFromValue("s.brand")} = ${brandKeyFromValue(key)}
        OR ${brandKeyFromValue("sc.mapped_brand")} = ${brandKeyFromValue(key)}
      )`;
    });
    clauses.push(`(${brandConditions.join(" OR ")})`);
  }
  if (selectedCustomers.length) {
    addInClause(clauses, values, "s.customer", selectedCustomers, "customer");
  }
  if (dateFrom) {
    clauses.push(`((${skuDate} IS NOT NULL AND ${skuDate} >= $dateFrom) OR (${skuDate} IS NULL AND (s.period_start IS NULL OR s.period_start >= $dateFrom)))`);
    values.$dateFrom = dateFrom;
  }
  if (dateTo) {
    clauses.push(`((${skuDate} IS NOT NULL AND ${skuDate} <= $dateTo) OR (${skuDate} IS NULL AND (s.period_end IS NULL OR s.period_end <= $dateTo)))`);
    values.$dateTo = dateTo;
  }
  clauses.push("s.amount_hkd > 0.01");

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

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
}

function comparisonWindow(start, end) {
  if (!start || !end) return { start, end };
  if (daysBetween(start, end) <= 100) return { start, end };
  return {
    start: shiftDate(end, { months: -3, days: 1 }),
    end,
  };
}

function minIsoDate(...values) {
  return values.filter(Boolean).sort()[0] || "";
}

function maxIsoDate(...values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function clampIsoDate(value, min, max) {
  if (!value) return value;
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

function skuRangeWhere(params, { includeDates = false } = {}) {
  const rangeParams = new URLSearchParams(params);
  if (!includeDates) {
    rangeParams.delete("dateFrom");
    rangeParams.delete("dateTo");
  }
  return skuWhereFromSearch(rangeParams);
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

function fairGrowthMetric(currentSum, daysCurrent, compareMap, daysCompare, key) {
  const cSum = Number(currentSum || 0);
  if (!compareMap.has(key)) {
    return { growth: null, value: cSum, status: "no_prior" };
  }
  const pSum = Number(compareMap.get(key) || 0);
  if (daysCurrent <= 0 || daysCompare <= 0) {
    return { growth: null, value: cSum - pSum, status: "no_prior" };
  }
  const currentDaily = cSum / daysCurrent;
  const compareDaily = pSum / daysCompare;
  
  if (Math.abs(compareDaily) < 0.01) {
    return { growth: null, value: cSum - pSum, status: "no_prior" };
  }
  
  return {
    growth: safeGrowth(currentDaily, compareDaily),
    value: cSum - pSum,
    status: "ok",
  };
}

function appendWhere(filter, condition) {
  return filter.sql ? `AND ${condition}` : `WHERE ${condition}`;
}

function pnlAmountExpression(params, factAlias = "f", reportAlias = "r") {
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (!dateFrom && !dateTo) return `${factAlias}.amount_hkd`;

  const fromBound = dateFrom ? "$dateFrom" : `COALESCE(${reportAlias}.period_start, '0001-01-01')`;
  const toBound = dateTo ? "$dateTo" : `COALESCE(${reportAlias}.period_end, '9999-12-31')`;
  const reportDays = `(julianday(${reportAlias}.period_end) - julianday(${reportAlias}.period_start) + 1)`;
  const overlapDays = `(
    julianday(min(${reportAlias}.period_end, ${toBound})) -
    julianday(max(${reportAlias}.period_start, ${fromBound})) + 1
  )`;
  return `(${factAlias}.amount_hkd * CASE
    WHEN ${reportAlias}.period_start IS NOT NULL
      AND ${reportAlias}.period_end IS NOT NULL
      AND ${reportDays} > 0
    THEN max(0, ${overlapDays}) / ${reportDays}
    ELSE 1
  END)`;
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
  const pnlAmount = pnlAmountExpression(params);
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
  const reportDateRange = db
    .prepare("SELECT MIN(period_start) AS min, MAX(period_end) AS max FROM reports")
    .get();

  const kpiRows = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN f.line_item IN ('Total for Income', 'Income') THEN ${pnlAmount} ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${pnlAmount} ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN ${pnlAmount} ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN ${pnlAmount} ELSE 0 END) AS net_earnings
      ${baseJoin}
      `
    )
    .all(filter.values);

  const byCompany = db
    .prepare(
      `
      SELECT c.name AS company, c.source_currency AS currency,
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${pnlAmount} ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${pnlAmount} ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN ${pnlAmount} ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN ${pnlAmount} ELSE 0 END) AS net_earnings
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
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${pnlAmount} ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${pnlAmount} ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN ${pnlAmount} ELSE 0 END) AS net_earnings
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
        SUM(${pnlAmount}) AS amount
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
      SELECT f.line_item, f.section, SUM(${pnlAmount}) AS amount
      ${sectionJoin}
      GROUP BY f.section, f.line_item
      HAVING ABS(amount) > 0
      ORDER BY ABS(amount) DESC
      LIMIT 80
      `
    )
    .all(sectionFilter.values);

  let pAndL = db
    .prepare(
      `
      SELECT
        f.section,
        f.line_item,
        MAX(f.is_total) AS is_total,
        MIN(f.row_order) AS row_order,
        SUM(${pnlAmount}) AS amount
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
          ) OR f.line_item LIKE 'Total for%' THEN 900
          ELSE 1
        END,
        CASE
          WHEN f.line_item IN (
            'Total for Income',
            'Gross Profit',
            'Total for Other Income(Loss)',
            'Total for Expenses',
            'Total for Other Expenses',
            'Net Earnings'
          ) OR f.line_item LIKE 'Total for%' THEN ABS(amount)
          ELSE ABS(amount) * -1
        END,
        f.line_item
      `
    )
    .all(sectionFilter.values);

  const sectionSummary = db
    .prepare(
      `
      SELECT f.section, SUM(${pnlAmount}) AS amount, COUNT(*) AS rows
      ${baseJoin}
      GROUP BY f.section
      ORDER BY ABS(amount) DESC
      `
    )
    .all(filter.values);

  const costOfSalesTotal = Number(
    db
      .prepare(
        `
        SELECT SUM(${pnlAmount}) AS amount
        ${baseJoin}
        ${appendWhere(filter, "f.line_item = 'Total for Cost of Sales'")}
        `
      )
      .get(filter.values)?.amount || 0
  );
  const costOfSalesByEntity = db
    .prepare(
      `
      SELECT f.entity,
        SUM(${pnlAmount}) AS amount
      ${baseJoin}
      ${appendWhere(filter, "f.line_item = 'Total for Cost of Sales'")}
      GROUP BY f.entity
      HAVING ABS(amount) > 0.01
      ORDER BY ABS(amount) DESC
      LIMIT 10
      `
    )
    .all(filter.values)
    .filter((row) => String(row.entity || "").toLowerCase() !== "not specified")
    .map((row) => ({
      ...row,
      share_of_cost_of_sales: costOfSalesTotal ? Number(row.amount || 0) / costOfSalesTotal : 0,
      share_of_revenue: revenueTotal ? Number(row.amount || 0) / revenueTotal : 0,
    }));

  const eliminationWhere = filter.sql
    ? `${filter.sql.replace("f.is_intercompany = 0", "f.is_intercompany = 1")}`
    : "WHERE f.is_intercompany = 1";
  const eliminationValues = { ...filter.values };
  const intercompanyEliminations = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${pnlAmount} ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${pnlAmount} ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN ${pnlAmount} ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN ${pnlAmount} ELSE 0 END) AS net_earnings
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
        SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${pnlAmount} ELSE 0 END) AS revenue,
        SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${pnlAmount} ELSE 0 END) AS gross_profit,
        SUM(CASE WHEN f.line_item = 'Total for Expenses' THEN ${pnlAmount} ELSE 0 END) AS expenses,
        SUM(CASE WHEN f.line_item = 'Net Earnings' THEN ${pnlAmount} ELSE 0 END) AS net_earnings
      ${baseJoin}
      GROUP BY c.name, f.entity
      HAVING ABS(revenue) + ABS(gross_profit) + ABS(expenses) + ABS(net_earnings) > 0
      ORDER BY revenue DESC
      LIMIT 120
      `
    )
    .all(filter.values);

  const hasSkuSales = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sku_sales'").get();
  const skuDate = skuDateExpression("s");
  const skuRangeFilter = hasSkuSales ? skuRangeWhere(params) : { sql: "", values: {} };
  const skuDateRange = hasSkuSales
    ? db
        .prepare(
          `
          SELECT MIN(${skuDate}) AS min, MAX(${skuDate}) AS max
          FROM sku_sales s
          JOIN batches b ON b.id = s.batch_id
          JOIN companies c ON c.id = s.company_id
          LEFT JOIN sku_costs sc ON sc.sku = lower(s.sku)
          ${skuRangeFilter.sql}
          `
        )
        .get(skuRangeFilter.values)
    : { min: "", max: "" };
  const currentDate = currentHongKongDate();
  const availableDateRange = {
    min: minIsoDate(reportDateRange?.min, skuDateRange?.min),
    max: maxIsoDate(reportDateRange?.max, skuDateRange?.max),
  };
  const p1From = params.get("dateFrom") || reportDateRange?.min || availableDateRange.min;
  const p1UncappedTo = params.get("dateTo") || reportDateRange?.max || availableDateRange.max;
  const p1To = clampIsoDate(p1UncappedTo, "", minIsoDate(reportDateRange?.max, currentDate) || p1UncappedTo);

  const p2From = params.get("dateFrom2") || (p1From ? shiftDate(p1From, { years: -1 }) : "");
  const p2To = params.get("dateTo2") || (p1To ? shiftDate(p1To, { years: -1 }) : "");

  const p3From = params.get("dateFrom3") || (p1From ? shiftDate(p1From, { months: -3 }) : "");
  const p3To = params.get("dateTo3") || (p1From ? shiftDate(p1From, { days: -1 }) : "");

  const daysP1 = daysBetween(p1From, p1To);
  const daysP2 = daysBetween(p2From, p2To);
  const daysP3 = daysBetween(p3From, p3To);

  const pnlComparison = {
    p1: { start: p1From, end: p1To },
    p2: { start: p2From, end: p2To },
    p3: { start: p3From, end: p3To },
  };

  function pnlLineKey(row) {
    return `${row.section || ""}|${row.line_item || ""}`;
  }

  function pnlRowsForWindow(start, end) {
    if (!start || !end) return [];
    const windowParams = periodParams(params, start, end);
    const windowFilter = whereFromSearch(windowParams, { includeSection: true });
    const windowAmount = pnlAmountExpression(windowParams);
    const windowJoin = `
      FROM (
        SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
        FROM facts raw_f
      ) f
      JOIN reports r ON r.id = f.report_id
      JOIN batches b ON b.id = r.batch_id
      JOIN companies c ON c.id = r.company_id
      ${windowFilter.sql}
    `;
    return db
      .prepare(
        `
        SELECT f.section, f.line_item, SUM(${windowAmount}) AS amount
        ${windowJoin}
        GROUP BY f.section, f.line_item
        HAVING ABS(amount) > 0
        `
      )
      .all(windowFilter.values);
  }

  const pnlCurrentMap = new Map(pnlRowsForWindow(pnlComparison.p1.start, pnlComparison.p1.end).map((row) => [pnlLineKey(row), Number(row.amount || 0)]));
  const pnlP2Map = new Map(pnlRowsForWindow(pnlComparison.p2.start, pnlComparison.p2.end).map((row) => [pnlLineKey(row), Number(row.amount || 0)]));
  const pnlP3Map = new Map(pnlRowsForWindow(pnlComparison.p3.start, pnlComparison.p3.end).map((row) => [pnlLineKey(row), Number(row.amount || 0)]));
  const expenseContributorRows = db
    .prepare(
      `
      SELECT f.line_item, c.name AS company, f.entity, SUM(${pnlAmount}) AS amount
      ${sectionJoin}
      ${appendWhere(sectionFilter, "f.section = 'Expenses'")}
      AND f.line_item NOT LIKE 'Total for%'
      GROUP BY f.line_item, c.name, f.entity
      HAVING ABS(amount) > 0.01
      ORDER BY f.line_item, ABS(amount) DESC
      `
    )
    .all(sectionFilter.values);
  const expenseContributorMap = new Map();
  for (const row of expenseContributorRows) {
    const list = expenseContributorMap.get(row.line_item) || [];
    if (list.length < 5) {
      list.push(row);
      expenseContributorMap.set(row.line_item, list);
    }
  }
  pAndL = pAndL.map((row) => {
    const key = pnlLineKey(row);
    const currentAmount = pnlCurrentMap.has(key) ? pnlCurrentMap.get(key) : Number(row.amount || 0);
    const p2Metric = fairGrowthMetric(currentAmount, daysP1, pnlP2Map, daysP2, key);
    const p3Metric = fairGrowthMetric(currentAmount, daysP1, pnlP3Map, daysP3, key);
    const contributors = row.section === "Expenses" && !row.is_total && !String(row.line_item || "").startsWith("Total for")
      ? (expenseContributorMap.get(row.line_item) || []).map((item) => ({
          ...item,
          share_of_line: Number(row.amount || 0) ? Number(item.amount || 0) / Number(row.amount || 0) : 0,
        }))
      : undefined;
    return {
      ...row,
      growth_p2: p2Metric.growth,
      growth_p3: p3Metric.growth,
      growth_status_p2: p2Metric.status,
      growth_status_p3: p3Metric.status,
      growth_value_p2: p2Metric.value,
      growth_value_p3: p3Metric.value,
      comparison_amount_p2: pnlP2Map.has(key) ? pnlP2Map.get(key) : null,
      comparison_amount_p3: pnlP3Map.has(key) ? pnlP3Map.get(key) : null,
      ...(contributors ? { expense_contributors: contributors } : {}),
    };
  });

  const filteredReports = db
    .prepare(
      `
      SELECT DISTINCT
        b.batch_key,
        b.name AS batch_name,
        b.period_start AS batch_period_start,
        b.period_end AS batch_period_end,
        r.dimension,
        r.period_label,
        r.period_start,
        r.period_end,
        r.source_file,
        c.name AS company
      ${baseJoin}
      ORDER BY COALESCE(b.period_start, b.uploaded_at) DESC, b.id DESC, c.name, r.dimension
      `
    )
    .all(filter.values);
  const filteredReportDateRange = filteredReports.reduce(
    (range, report) => ({
      min: minIsoDate(range.min, report.period_start),
      max: maxIsoDate(range.max, report.period_end),
    }),
    { min: "", max: "" }
  );
  const requestedPnlRange = {
    from: params.get("dateFrom") || reportDateRange?.min || availableDateRange.min || "",
    to: params.get("dateTo") || reportDateRange?.max || availableDateRange.max || "",
  };
  function fetchEntitiesByDimension(dimension) {
    const entityParams = new URLSearchParams(params);
    entityParams.set("dimension", dimension);
    const entityFilter = entityOptionsWhere(entityParams);
    const entitySelect =
      dimension === "class"
        ? `${brandKeyFromValue("f.entity")} AS entity_key, MIN(f.entity) AS entity`
        : `f.entity AS entity_key, f.entity AS entity`;
    const entityGroup = dimension === "class" ? "entity_key" : "f.entity";
    return db
      .prepare(
        `
        SELECT ${entitySelect}
        FROM (
          SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
          FROM facts raw_f
        ) f
        JOIN reports r ON r.id = f.report_id
        JOIN batches b ON b.id = r.batch_id
        JOIN companies c ON c.id = r.company_id
        ${entityFilter.sql}
        GROUP BY ${entityGroup}
        HAVING ABS(SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${pnlAmount} ELSE 0 END)) > 0.01
        ORDER BY entity
        `
      )
      .all(entityFilter.values)
      .map((x) => brandLabel(x.entity_key, x.entity));
  }

  const entitiesByDimension = {
    class: fetchEntitiesByDimension("class"),
    customer: fetchEntitiesByDimension("customer"),
  };
  const requestedDimension = params.get("dimension") || "class";

  const meta = {
    batches: db.prepare("SELECT batch_key, name, uploaded_at, period_start, period_end FROM batches ORDER BY COALESCE(period_start, uploaded_at) DESC, id DESC").all(),
    companies: db.prepare("SELECT name, source_currency AS currency FROM companies ORDER BY name").all(),
    dimensions: db.prepare("SELECT DISTINCT dimension FROM reports ORDER BY dimension").all().map((x) => x.dimension),
    entities: entitiesByDimension[requestedDimension] || [],
    entitiesByDimension,
    sections: db.prepare("SELECT DISTINCT section FROM facts WHERE section IS NOT NULL ORDER BY section").all().map((x) => x.section),
    fx: db.prepare("SELECT * FROM fx_rates ORDER BY source_currency").all(),
    reports: filteredReports,
    dateRange: reportDateRange,
    skuDateRange,
    availableDateRange,
    pnlCoverage: {
      requested: requestedPnlRange,
      active: filteredReportDateRange,
      reportCount: filteredReports.length,
      exact: Boolean(
        filteredReports.length &&
          (!requestedPnlRange.from || requestedPnlRange.from === filteredReportDateRange.min) &&
          (!requestedPnlRange.to || requestedPnlRange.to === filteredReportDateRange.max)
      ),
    },
    pnlComparison,
    timezone: "Asia/Hong_Kong",
    currentDate,
  };

  let skuTotals = {};
  let skuRows = [];
  let skuBrands = [];
  let skuCustomers = [];
  let brandMargins = [];
  let skuBrandCurrent = [];
  let skuBrandLy = [];
  let skuBrandP3m = [];
  let skuCustomerCurrent = [];
  let skuCustomerLy = [];
  let skuCustomerP3m = [];
  let skuCurrent = [];
  let skuLy = [];
  let skuP3m = [];
  let skuActiveRange = { from: "", to: "" };
  let skuCostCoverage = {
    mapping_rows: 0,
    valid_cost_rows: 0,
    matched_sales_rows: 0,
    sales_rows: 0,
    matched_revenue: 0,
    revenue: 0,
  };
  let skuComparison = {
    current: { start: "", end: "" },
    ly: { start: "", end: "" },
    p3m: { start: "", end: "" },
  };
  if (hasSkuSales) {
    const skuFilter = skuWhereFromSearch(params);
    const skuBrandValue = "COALESCE(sc.mapped_brand, s.brand)";
    const skuBrandKey = brandKeyFromValue(skuBrandValue);
    const skuJoin = `
      FROM sku_sales s
      JOIN batches b ON b.id = s.batch_id
      JOIN companies c ON c.id = s.company_id
      LEFT JOIN sku_costs sc ON sc.sku = lower(s.sku)
      ${skuFilter.sql}
    `;
    skuTotals =
      db
        .prepare(
          `
          SELECT
            SUM(s.quantity) AS quantity,
            SUM(s.amount_hkd) AS revenue,
            SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN NULL ELSE s.quantity * sc.unit_cost_hkd END) AS cogs_hkd,
            SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.quantity END) AS costed_quantity,
            COUNT(DISTINCT s.sku) AS sku_count,
            COUNT(DISTINCT ${skuBrandKey}) AS brand_count
          ${skuJoin}
          `
        )
        .get(skuFilter.values) || {};
    skuCostCoverage =
      db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM sku_costs) AS mapping_rows,
            (SELECT COUNT(*) FROM sku_costs WHERE unit_cost_hkd IS NOT NULL) AS valid_cost_rows,
            SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE 1 END) AS matched_sales_rows,
            COUNT(*) AS sales_rows,
            SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.amount_hkd END) AS matched_revenue,
            SUM(s.amount_hkd) AS revenue
          ${skuJoin}
          `
        )
        .get(skuFilter.values) || skuCostCoverage;
    skuRows = db
      .prepare(
        `
        SELECT
          ${skuBrandKey} AS brand_key,
          MIN(${skuBrandValue}) AS brand,
          s.sku,
          COALESCE(sc.mapped_product_name, s.product_name) AS product_name,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN NULL ELSE s.quantity * sc.unit_cost_hkd END) AS cogs_hkd,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.quantity END) AS costed_quantity,
          CASE WHEN SUM(s.quantity) != 0 THEN SUM(s.amount_hkd) / SUM(s.quantity) ELSE 0 END AS avg_price,
          COUNT(DISTINCT c.name) AS company_count,
          COUNT(DISTINCT s.customer) AS customer_count
        ${skuJoin}
        GROUP BY ${skuBrandKey}, s.sku, COALESCE(sc.mapped_product_name, s.product_name)
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
          MIN(${skuBrandValue}) AS brand,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN NULL ELSE s.quantity * sc.unit_cost_hkd END) AS cogs_hkd,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.quantity END) AS costed_quantity,
          COUNT(DISTINCT s.sku) AS sku_count
        ${skuJoin}
        GROUP BY ${skuBrandKey}
        HAVING ABS(revenue) > 0.01
        ORDER BY revenue DESC
        LIMIT 80
        `
      )
      .all(skuFilter.values);
    skuCustomers = db
      .prepare(
        `
        SELECT
          s.customer AS customer_key,
          s.customer AS customer,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN NULL ELSE s.quantity * sc.unit_cost_hkd END) AS cogs_hkd,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.quantity END) AS costed_quantity,
          COUNT(DISTINCT s.sku) AS sku_count
        ${skuJoin}
        GROUP BY s.customer
        HAVING ABS(revenue) > 0.01
        ORDER BY revenue DESC
        LIMIT 80
        `
      )
      .all(skuFilter.values);

    const brandMarginParams = new URLSearchParams(params);
    brandMarginParams.set("dimension", "class");
    if (params.get("dimension") !== "customer") {
      brandMarginParams.delete("entity");
    }
    const brandMarginFilter = whereFromSearch(brandMarginParams);
    const brandMarginAmount = pnlAmountExpression(brandMarginParams);
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
          SUM(CASE WHEN f.line_item = 'Total for Income' THEN ${brandMarginAmount} ELSE 0 END) AS pnl_revenue,
          SUM(CASE WHEN f.line_item = 'Gross Profit' THEN ${brandMarginAmount} ELSE 0 END) AS gross_profit
        ${brandMarginJoin}
        GROUP BY ${pnlBrandKey}
        HAVING ABS(pnl_revenue) + ABS(gross_profit) > 0.01
        `
      )
      .all(brandMarginFilter.values);

    skuActiveRange = { from: p1From || "", to: p1To || "" };
    skuComparison = {
      current: { start: p1From, end: p1To },
      ly: { start: p2From, end: p2To },
      p3m: { start: p3From, end: p3To },
    };
    if (p1From && p1To) {
      const currentFilter = skuWhereFromSearch(periodParams(params, p1From, p1To));
      const lyFilter = skuWhereFromSearch(periodParams(params, p2From, p2To));
      const p3mFilter = skuWhereFromSearch(periodParams(params, p3From, p3To));
      const comparisonSql = `
        SELECT ${skuBrandKey} AS brand_key, SUM(s.amount_hkd) AS revenue
        FROM sku_sales s
        JOIN batches b ON b.id = s.batch_id
        JOIN companies c ON c.id = s.company_id
        LEFT JOIN sku_costs sc ON sc.sku = lower(s.sku)
      `;
      skuBrandCurrent = db
        .prepare(
          `
          ${comparisonSql}
          ${currentFilter.sql}
          GROUP BY ${skuBrandKey}
          `
        )
        .all(currentFilter.values);
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

      const comparisonCustomerSql = `
        SELECT s.customer AS customer_key, SUM(s.amount_hkd) AS revenue
        FROM sku_sales s
        JOIN batches b ON b.id = s.batch_id
        JOIN companies c ON c.id = s.company_id
        LEFT JOIN sku_costs sc ON sc.sku = lower(s.sku)
      `;
      skuCustomerCurrent = db
        .prepare(
          `
          ${comparisonCustomerSql}
          ${currentFilter.sql}
          GROUP BY s.customer
          `
        )
        .all(currentFilter.values);
      skuCustomerLy = db
        .prepare(
          `
          ${comparisonCustomerSql}
          ${lyFilter.sql}
          GROUP BY s.customer
          `
        )
        .all(lyFilter.values);
      skuCustomerP3m = db
        .prepare(
          `
          ${comparisonCustomerSql}
          ${p3mFilter.sql}
          GROUP BY s.customer
          `
        )
        .all(p3mFilter.values);

      const skuComparisonSql = `
        SELECT
          ${skuBrandKey} || '|' || lower(s.sku) || '|' || lower(trim(COALESCE(sc.mapped_product_name, s.product_name))) AS sku_key,
          SUM(s.amount_hkd) AS revenue
        FROM sku_sales s
        JOIN batches b ON b.id = s.batch_id
        JOIN companies c ON c.id = s.company_id
        LEFT JOIN sku_costs sc ON sc.sku = lower(s.sku)
      `;
      skuCurrent = db
        .prepare(
          `
          ${skuComparisonSql}
          ${currentFilter.sql}
          GROUP BY ${skuBrandKey}, lower(s.sku), lower(trim(COALESCE(sc.mapped_product_name, s.product_name)))
          `
        )
        .all(currentFilter.values);
      skuLy = db
        .prepare(
          `
          ${skuComparisonSql}
          ${lyFilter.sql}
          GROUP BY ${skuBrandKey}, lower(s.sku), lower(trim(COALESCE(sc.mapped_product_name, s.product_name)))
          `
        )
        .all(lyFilter.values);
      skuP3m = db
        .prepare(
          `
          ${skuComparisonSql}
          ${p3mFilter.sql}
          GROUP BY ${skuBrandKey}, lower(s.sku), lower(trim(COALESCE(sc.mapped_product_name, s.product_name)))
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
  const topRevenueBrand = byEntity
    .filter((row) => Number(row.revenue || 0) > 0 && String(row.entity || "").toLowerCase() !== "not specified")
    .map((row) => ({
      ...row,
      revenue_share: revenueTotal ? Number(row.revenue || 0) / revenueTotal : 0,
      net_margin: Number(row.revenue || 0) ? Number(row.net_earnings || 0) / Number(row.revenue || 0) : 0,
    }))
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];
  const bestMarginBrand = byEntity
    .filter((row) => Number(row.revenue || 0) > 0 && String(row.entity || "").toLowerCase() !== "not specified")
    .map((row) => ({
      ...row,
      revenue_share: revenueTotal ? Number(row.revenue || 0) / revenueTotal : 0,
      net_margin: Number(row.net_earnings || 0) / Number(row.revenue || 0),
    }))
    .sort((a, b) => b.net_margin - a.net_margin)[0];
  const topCostOfSalesBrand = costOfSalesByEntity[0];

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
  const skuBrandCurrentMap = new Map(skuBrandCurrent.map((row) => [row.brand_key, Number(row.revenue || 0)]));
  const skuBrandLyMap = new Map(skuBrandLy.map((row) => [row.brand_key, Number(row.revenue || 0)]));
  const skuBrandP3mMap = new Map(skuBrandP3m.map((row) => [row.brand_key, Number(row.revenue || 0)]));
  const skuCustomerCurrentMap = new Map(skuCustomerCurrent.map((row) => [row.customer_key, Number(row.revenue || 0)]));
  const skuCustomerLyMap = new Map(skuCustomerLy.map((row) => [row.customer_key, Number(row.revenue || 0)]));
  const skuCustomerP3mMap = new Map(skuCustomerP3m.map((row) => [row.customer_key, Number(row.revenue || 0)]));
  const skuCurrentMap = new Map(skuCurrent.map((row) => [row.sku_key, Number(row.revenue || 0)]));
  const skuLyMap = new Map(skuLy.map((row) => [row.sku_key, Number(row.revenue || 0)]));
  const skuP3mMap = new Map(skuP3m.map((row) => [row.sku_key, Number(row.revenue || 0)]));
  const hasSkuComparison = Boolean(skuComparison.current.start && skuComparison.current.end);
  const sumRevenue = (rows) => rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const skuCurrentRevenue = sumRevenue(skuBrandCurrent);
  const skuLyRevenue = sumRevenue(skuBrandLy);
  const skuP3mRevenue = sumRevenue(skuBrandP3m);
  const skuKey = (row) =>
    `${row.brand_key || String(row.brand || "").toLowerCase()}|${String(row.sku || "").toLowerCase()}|${String(row.product_name || "").trim().toLowerCase()}`;
  const skuGrossProfit = (row) => {
    if (row.cogs_hkd === null || row.cogs_hkd === undefined) return null;
    return Number(row.revenue || 0) - Number(row.cogs_hkd || 0);
  };
  const skuGrossMargin = (row, grossProfit) => {
    const revenue = Number(row.revenue || 0);
    return grossProfit === null || !revenue ? null : grossProfit / revenue;
  };

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
      revenueTotal,
      expenseTotal,
      costOfSalesTotal,
      netEarnings: Number((kpiRows[0] || {}).net_earnings || 0),
      netMargin: revenueTotal ? Number((kpiRows[0] || {}).net_earnings || 0) / revenueTotal : 0,
      skuGrowth: {
        current_revenue: skuCurrentRevenue,
        p2_revenue: skuLyRevenue,
        p3_revenue: skuP3mRevenue,
        growth_p2: fairGrowthMetric(skuCurrentRevenue, daysP1, new Map([["total", skuLyRevenue]]), daysP2, "total").growth,
        growth_p3: fairGrowthMetric(skuCurrentRevenue, daysP1, new Map([["total", skuP3mRevenue]]), daysP3, "total").growth,
        window: skuComparison,
      },
      topRevenueCompany,
      topRevenueBrand,
      bestMarginCompany,
      bestMarginBrand,
      largestExpense,
      topCostOfSalesBrand,
      lossCompanies,
    },
    intercompany: {
      included: false,
      eliminated: intercompanyEliminations || {},
      rule: "Entity/customer names matching group company names are excluded by default.",
    },
    sku: {
      totals: skuTotals,
      activeRange: skuActiveRange,
      dataRange: meta.skuDateRange,
      comparison: skuComparison,
      costCoverage: skuCostCoverage,
      rows: skuRows.map((row) => {
        const key = row.brand_key || String(row.brand || "").toLowerCase();
        const rowKey = skuKey(row);
        const currentRevenue = hasSkuComparison ? Number(skuCurrentMap.get(rowKey) || 0) : Number(row.revenue || 0);
        const mappedGrossProfit = skuGrossProfit(row);
        const grossMargin = skuGrossMargin(row, mappedGrossProfit);
        const p2Metric = fairGrowthMetric(currentRevenue, daysP1, skuLyMap, daysP2, rowKey);
        const p3Metric = fairGrowthMetric(currentRevenue, daysP1, skuP3mMap, daysP3, rowKey);
        return {
          ...row,
          brand: brandLabel(key, row.brand),
          revenue_share: Number(skuTotals.revenue || 0) ? Number(row.revenue || 0) / Number(skuTotals.revenue || 0) : 0,
          gross_margin: grossMargin,
          gross_profit: mappedGrossProfit,
          margin_source: mappedGrossProfit === null ? "missing_sku_cogs" : "sku_cogs",
          growth_p2: p2Metric.growth,
          growth_p3: p3Metric.growth,
          growth_status_p2: p2Metric.status,
          growth_status_p3: p3Metric.status,
          growth_value_p2: p2Metric.value,
          growth_value_p3: p3Metric.value,
        };
      }),
      brands: skuBrands.map((row) => {
        const currentRevenue = hasSkuComparison ? Number(skuBrandCurrentMap.get(row.brand_key) || 0) : Number(row.revenue || 0);
        const mappedGrossProfit = skuGrossProfit(row);
        const grossMargin = skuGrossMargin(row, mappedGrossProfit);
        const p2Metric = fairGrowthMetric(currentRevenue, daysP1, skuBrandLyMap, daysP2, row.brand_key);
        const p3Metric = fairGrowthMetric(currentRevenue, daysP1, skuBrandP3mMap, daysP3, row.brand_key);
        return {
          ...row,
          brand: brandLabel(row.brand_key, row.brand),
          revenue_share: Number(skuTotals.revenue || 0) ? Number(row.revenue || 0) / Number(skuTotals.revenue || 0) : 0,
          gross_profit: mappedGrossProfit,
          gross_margin: grossMargin,
          margin_source: mappedGrossProfit === null ? "missing_sku_cogs" : "sku_cogs",
          growth_p2: p2Metric.growth,
          growth_p3: p3Metric.growth,
          growth_status_p2: p2Metric.status,
          growth_status_p3: p3Metric.status,
        };
      }),
      customers: skuCustomers.map((row) => {
        const currentRevenue = hasSkuComparison ? Number(skuCustomerCurrentMap.get(row.customer_key) || 0) : Number(row.revenue || 0);
        const mappedGrossProfit = skuGrossProfit(row);
        const grossMargin = skuGrossMargin(row, mappedGrossProfit);
        const p2Metric = fairGrowthMetric(currentRevenue, daysP1, skuCustomerLyMap, daysP2, row.customer_key);
        const p3Metric = fairGrowthMetric(currentRevenue, daysP1, skuCustomerP3mMap, daysP3, row.customer_key);
        return {
          ...row,
          revenue_share: Number(skuTotals.revenue || 0) ? Number(row.revenue || 0) / Number(skuTotals.revenue || 0) : 0,
          gross_profit: mappedGrossProfit,
          gross_margin: grossMargin,
          margin_source: mappedGrossProfit === null ? "missing_sku_cogs" : "sku_cogs",
          growth_p2: p2Metric.growth,
          growth_p3: p3Metric.growth,
          growth_status_p2: p2Metric.status,
          growth_status_p3: p3Metric.status,
        };
      }),
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
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
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

  if (url.pathname === "/api/auth/captcha" && req.method === "GET") {
    try {
      json(res, 200, generateCaptcha());
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (!isAuthConfigured()) {
      json(res, 500, { ok: false, error: "Login is not configured. Set CRM_PASSWORD_HASH and SESSION_SECRET." });
      return;
    }

    try {
      const body = await readJson(req);

      // Verify signed math captcha
      const captchaOk = verifyCaptcha(body.captchaToken, body.captchaAnswer);
      if (!captchaOk) {
        json(res, 400, { ok: false, error: "Incorrect or expired math captcha. Please try again." });
        return;
      }

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

  if (url.pathname === "/api/debit-notes/audit" && req.method === "GET") {
    try {
      json(res, 200, getDebitNotesAudit());
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/upload-debit-note" && req.method === "POST") {
    try {
      json(res, 200, await uploadDebitNoteFiles(req));
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/reimport-debit-notes" && req.method === "POST") {
    try {
      json(res, 200, await runDebitNoteImporter());
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/clear-debit-notes" && req.method === "POST") {
    try {
      json(res, 200, await clearDebitNotes());
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
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
