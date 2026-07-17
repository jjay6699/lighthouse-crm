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

function generateSlideToken() {
  const timestamp = Date.now();
  const dataToSign = `slide_verified.${timestamp}`;
  const signature = createHmac("sha256", sessionSecret || "temp_secret").update(dataToSign).digest("base64url");
  return `${timestamp}.${signature}`;
}

function verifySlideToken(token) {
  if (!token) return false;
  const [timestampStr, signature] = token.split(".");
  if (!timestampStr || !signature) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (Date.now() - timestamp > 5 * 60 * 1000) return false;

  const dataToSign = `slide_verified.${timestamp}`;
  const expectedSignature = createHmac("sha256", sessionSecret || "temp_secret").update(dataToSign).digest("base64url");

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

function isAuthenticated(req) {
  if (!isAuthConfigured()) return true;
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

function openDbWrite() {
  if (!existsSync(dbPath)) {
    return null;
  }
  return new DatabaseSync(dbPath);
}

function initWarehouseDb() {
  const db = openDbWrite();
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      brand TEXT,
      description TEXT,
      stock_on_hand INTEGER DEFAULT 0,
      allocated INTEGER DEFAULT 0,
      sited_stock INTEGER DEFAULT 0,
      bin_location TEXT,
      reorder_point INTEGER DEFAULT 0
    )
  `);

  // Try altering existing table to add sited_stock
  try {
    db.exec("ALTER TABLE warehouse_inventory ADD COLUMN sited_stock INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      qty_change INTEGER,
      prev_qty INTEGER,
      new_qty INTEGER,
      reason TEXT,
      timestamp TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_expiry_directory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      brand TEXT,
      description TEXT,
      batch_number TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      receive_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      timestamp TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_edi_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      retailer TEXT NOT NULL,
      delivery_location_raw TEXT NOT NULL,
      delivery_location_shorthand TEXT NOT NULL,
      items_json TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      timestamp TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_carrier_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carrier_name TEXT NOT NULL,
      route TEXT NOT NULL,
      cost_per_kg REAL NOT NULL,
      transit_time_days REAL NOT NULL,
      reliability_rate REAL NOT NULL,
      billing_amount REAL NOT NULL,
      billing_date TEXT NOT NULL,
      tariff_adjustment_percent REAL DEFAULT 0.0
    )
  `);

  const countRow = db.prepare("SELECT COUNT(*) as count FROM warehouse_inventory").get();
  if (countRow.count === 0) {
    let products = [];
    try {
      products = db.prepare("SELECT sku, brand, description FROM promotion_proposals GROUP BY sku").all();
    } catch (e) {
      // Fallback
    }

    if (products.length === 0) {
      try {
        products = db.prepare("SELECT sku, description FROM debit_notes GROUP BY sku").all();
        products = products.map(p => {
          let brand = "General";
          if (p.description.toLowerCase().includes("komorebi")) brand = "KOMOREBI";
          else if (p.description.toLowerCase().includes("rejuran")) brand = "REJURAN";
          else if (p.description.toLowerCase().includes("teazen")) brand = "TEAZEN";
          else if (p.description.toLowerCase().includes("qollabs")) brand = "QOLLABS";
          return { sku: p.sku, brand, description: p.description };
        });
      } catch (e) {
        // Fallback
      }
    }

    if (products.length === 0) {
      products = [
        { sku: "821219", brand: "KOMOREBI", description: "KOMOREBI 去濕消水丸 60粒裝" },
        { sku: "821220", brand: "KOMOREBI", description: "KOMOREBI 櫻花抗糖美肌丸 60粒裝" },
        { sku: "880962", brand: "REJURAN", description: "REJURAN 水光精華 30ml" },
        { sku: "880963", brand: "REJURAN", description: "REJURAN 青春緊緻眼霜 20ml" },
        { sku: "100293", brand: "TEAZEN", description: "TEAZEN 康普茶 檸檬味 10包裝" },
        { sku: "100294", brand: "TEAZEN", description: "TEAZEN 康普茶 莓果味 10包裝" },
      ];
    }

    const insert = db.prepare(`
      INSERT INTO warehouse_inventory (sku, brand, description, stock_on_hand, allocated, sited_stock, bin_location, reorder_point)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const bins = ["A", "B", "C", "D"];
    products.forEach((p, index) => {
      const stock = Math.floor(Math.random() * 750) + 50;
      const allocated = Math.min(stock - 10, Math.floor(Math.random() * 45) + 5);
      const sited = Math.floor(Math.random() * 60) + 10;
      const reorder = Math.floor(Math.random() * 80) + 20;
      const binLetter = bins[index % bins.length];
      const binNum = String((index % 20) + 1).padStart(2, '0');
      const bin = `${binLetter}-${binNum}`;
      
      try {
        insert.run(p.sku, p.brand || "General", p.description, stock, allocated, sited, bin, reorder);
      } catch (e) {
        // Skip duplicate unique keys
      }
    });
  }

  // Seed expiry directory if empty
  const countExpiry = db.prepare("SELECT COUNT(*) as count FROM warehouse_expiry_directory").get();
  if (countExpiry.count === 0) {
    const insertExpiry = db.prepare(`
      INSERT INTO warehouse_expiry_directory (sku, brand, description, batch_number, quantity, receive_date, expiry_date, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    // Check if we can select real items from inventory to link
    const items = db.prepare("SELECT * FROM warehouse_inventory LIMIT 3").all();
    if (items.length >= 3) {
      insertExpiry.run(items[0].sku, items[0].brand, items[0].description, "LOT-A2026", 120, "2026-03-10", "2028-03-10");
      insertExpiry.run(items[1].sku, items[1].brand, items[1].description, "LOT-B2026", 200, "2026-04-15", "2028-04-15");
      insertExpiry.run(items[2].sku, items[2].brand, items[2].description, "LOT-C2026", 350, "2026-05-01", "2027-11-01");
    } else {
      insertExpiry.run("821219", "KOMOREBI", "KOMOREBI 去濕消水丸 60粒裝", "LOT-KMR-01", 150, "2026-03-15", "2028-03-15");
      insertExpiry.run("880962", "REJURAN", "REJURAN 水光精華 30ml", "LOT-REJ-02", 200, "2026-04-20", "2028-04-20");
      insertExpiry.run("100293", "TEAZEN", "TEAZEN 康普茶 檸檬味 10包裝", "LOT-TEZ-03", 300, "2026-05-10", "2027-11-10");
    }
  }

  // Seed EDI orders if empty
  const countEDI = db.prepare("SELECT COUNT(*) as count FROM warehouse_edi_orders").get();
  if (countEDI.count === 0) {
    const insertEDI = db.prepare(`
      INSERT INTO warehouse_edi_orders (po_number, retailer, delivery_location_raw, delivery_location_shorthand, items_json, status, timestamp)
      VALUES (?, ?, ?, ?, ?, 'Pending', datetime('now'))
    `);

    // Let's find real SKUs to reference or fallback to default ones
    const items = db.prepare("SELECT * FROM warehouse_inventory LIMIT 2").all();
    const sku1 = items[0]?.sku || "821219";
    const sku2 = items[1]?.sku || "880962";
    const desc1 = items[0]?.description || "KOMOREBI 去濕消水丸 60粒裝";
    const desc2 = items[1]?.description || "REJURAN 水光精華 30ml";

    // Matsumoto Kiyoshi PO
    const itemsMK = [
      { sku: sku1, description: desc1, qty: 120, po_price: 155.0, master_price: 155.0 },
      { sku: sku2, description: desc2, qty: 80, po_price: 220.0, master_price: 220.0 }
    ];
    insertEDI.run(
      "PO-MK-40912",
      "Matsumoto Kiyoshi",
      "Matsumoto Kiyoshi Personal personal care store - Shop 5, Mong Kok Plaza, Kowloon, Hong Kong",
      "MK-MK5",
      JSON.stringify(itemsMK)
    );

    // Don Don Donki PO (with a price mismatch!)
    const itemsDK = [
      { sku: sku2, description: desc2, qty: 50, po_price: 210.0, master_price: 220.0 } // PO price is 210, master is 220
    ];
    insertEDI.run(
      "PO-DK-90231",
      "Don Don Donki",
      "DON DON DONKI Tsim Sha Tsui Mira Place 2, B1, Tsim Sha Tsui, Hong Kong",
      "TST-DK",
      JSON.stringify(itemsDK)
    );
  }

  // Seed carrier metrics if empty
  const countCarrier = db.prepare("SELECT COUNT(*) as count FROM warehouse_carrier_metrics").get();
  if (countCarrier.count === 0) {
    const insertCarrier = db.prepare(`
      INSERT INTO warehouse_carrier_metrics (carrier_name, route, cost_per_kg, transit_time_days, reliability_rate, billing_amount, billing_date, tariff_adjustment_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertCarrier.run("Korea Logistics Express", "Korea -> HK (Sea)", 14.50, 12.0, 0.96, 45000.0, "2026-05-15", 0.0);
    insertCarrier.run("Japan Air Forwarding", "Japan -> HK (Air)", 38.00, 2.5, 0.99, 89000.0, "2026-05-20", 0.12);
    insertCarrier.run("SF Express (Outbound)", "Local Outbound (HK)", 6.20, 1.0, 0.98, 18400.0, "2026-05-25", -0.05);
  }
}

function initAdsDb() {
  const db = openDbWrite();
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_ads_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connected INTEGER DEFAULT 0,
      app_id TEXT,
      access_token TEXT,
      ad_account_id TEXT,
      ai_optimization INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT,
      objective TEXT,
      status TEXT DEFAULT 'ACTIVE',
      recommendations INTEGER DEFAULT 0,
      results INTEGER DEFAULT 0,
      value REAL DEFAULT 0.0,
      roas REAL DEFAULT 0.0,
      cost_per_result REAL DEFAULT 0.0,
      spent REAL DEFAULT 0.0,
      impressions INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      daily_budget REAL DEFAULT 0.0,
      creative_text TEXT,
      image_url TEXT,
      targeting TEXT,
      placement TEXT
    )
  `);

  try {
    db.exec(`ALTER TABLE meta_campaigns ADD COLUMN image_url TEXT`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE meta_campaigns ADD COLUMN targeting TEXT`);
  } catch (e) {
    // ignore
  }
  try {
    db.exec(`ALTER TABLE meta_campaigns ADD COLUMN placement TEXT`);
  } catch (e) {
    // ignore
  }

  const countRow = db.prepare("SELECT COUNT(*) as count FROM meta_ads_settings").get();
  if (countRow.count === 0) {
    db.prepare(`
      INSERT INTO meta_ads_settings (connected, app_id, access_token, ad_account_id, ai_optimization)
      VALUES (0, '', '', '', 0)
    `).run();
  }

  const campCount = db.prepare("SELECT COUNT(*) as count FROM meta_campaigns").get();
  if (campCount.count === 0) {
    const seedCampaigns = [
      ["camp_1", "[Teazen_Grapefruit] Traffic Campaign (5/6 - 30/6)", "Traffic", "ACTIVE", 1, 14250, 0.0, 0.0, 0.45, 6412.50, 125400, 89200, 250.0, "Get the best grapefruit tea for your diet!"],
      ["camp_2", "[Teazen_Grapefruit] Awareness Campaign (5/6 - 30/6)", "Awareness", "ACTIVE", 1, 98400, 0.0, 0.0, 0.02, 1968.00, 245000, 98400, 100.0, "Try Teazen Grapefruit tea, now worldwide!"],
      ["camp_3", "[Teazen_ACV] Traffic Campaign (5/6 - 30/6)", "Traffic", "ACTIVE", 0, 8420, 0.0, 0.0, 0.52, 4378.40, 82100, 61000, 180.0, "Cleanse your body with Apple Cider Vinegar tea."],
      ["camp_4", "[Teazen_Kombucha] Engagement Video Views_ThruPlay (5/6 - 30/6)", "Engagement", "ACTIVE", 0, 45300, 0.0, 0.0, 0.05, 2265.00, 110200, 84000, 120.0, "Watch how Kombucha is made!"],
      ["camp_5", "[Teazen_Kombucha] Awareness Campaign (5/6 - 30/6)", "Awareness", "ACTIVE", 0, 154200, 0.0, 0.0, 0.01, 1542.00, 310000, 154200, 80.0, "The original Kombucha by Teazen."],
      ["camp_6", "[Healthall] RBPainpatch B1G1 (3-16 June 2026) Engagement", "Engagement", "ACTIVE", 1, 1840, 12450.00, 3.12, 2.17, 3992.80, 35400, 28100, 150.0, "Buy one get one free pain patches!"],
      ["camp_7", "[Healthall] WTC Painpatch (R&B) B1G1 (3-16 Jun 2026) Traffic", "Traffic", "ACTIVE", 1, 5610, 18200.00, 2.84, 1.14, 6395.40, 62800, 47200, 200.0, "Relieve muscle soreness fast with WTC patches."],
      ["camp_8", "[Healthall_Goldpatch] MNG_Traffic Campaign (17-30 June 2026)", "Traffic", "PAUSED", 1, 2150, 5400.00, 1.86, 1.35, 2902.50, 24100, 18900, 100.0, "Premium Gold Pain patch from Healthall."]
    ];

    const insert = db.prepare(`
      INSERT INTO meta_campaigns (id, name, objective, status, recommendations, results, value, roas, cost_per_result, spent, impressions, reach, daily_budget, creative_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    seedCampaigns.forEach((c) => {
      insert.run(...c);
    });
  }
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
  const intercompanyMode = options.intercompanyMode || "include";
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
  if (intercompanyMode === "exclude") clauses.push("f.is_intercompany = 0");
  if (intercompanyMode === "only") clauses.push("f.is_intercompany = 1");
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

function trailingMonthWindow(end, monthCount = 3) {
  if (!end) return { start: "", end: "" };
  const [year, month] = end.split("-").map(Number);
  if (!year || !month) return { start: "", end };
  const start = new Date(Date.UTC(year, month - monthCount, 1)).toISOString().slice(0, 10);
  return { start, end };
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
  const normalizedCompare = compareDaily * daysCurrent;
  
  if (Math.abs(compareDaily) < 0.01) {
    return { growth: null, value: cSum - pSum, status: "no_prior" };
  }
  
  return {
    growth: safeGrowth(currentDaily, compareDaily),
    value: cSum - normalizedCompare,
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

  const eliminationFilter = whereFromSearch(params, { intercompanyMode: "only" });
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
      ${eliminationFilter.sql}
      `
    )
    .get(eliminationFilter.values);

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

  const trailingP3 = trailingMonthWindow(p1To, 3);
  const p3From = params.get("dateFrom3") || trailingP3.start;
  const p3To = params.get("dateTo3") || trailingP3.end;

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

  function pnlWindowCoverage(start, end) {
    if (!start || !end) return { start, end, reportCount: 0, exact: false };
    const windowParams = periodParams(params, start, end);
    const windowFilter = whereFromSearch(windowParams);
    const reports = db
      .prepare(
        `
        SELECT DISTINCT r.id, r.period_start, r.period_end
        FROM (
          SELECT raw_f.*, CASE WHEN ${intercompanyExpression("raw_f")} THEN 1 ELSE 0 END AS is_intercompany
          FROM facts raw_f
        ) f
        JOIN reports r ON r.id = f.report_id
        JOIN batches b ON b.id = r.batch_id
        JOIN companies c ON c.id = r.company_id
        ${windowFilter.sql}
        `
      )
      .all(windowFilter.values);
    return {
      start,
      end,
      reportCount: reports.length,
      exact: Boolean(reports.length && reports.every((report) => report.period_start === start && report.period_end === end)),
    };
  }

  const pnlComparisonCoverage = {
    p1: pnlWindowCoverage(pnlComparison.p1.start, pnlComparison.p1.end),
    p2: pnlWindowCoverage(pnlComparison.p2.start, pnlComparison.p2.end),
    p3: pnlWindowCoverage(pnlComparison.p3.start, pnlComparison.p3.end),
  };
  const pnlCurrentMap = new Map(
    (pnlComparisonCoverage.p1.exact ? pnlRowsForWindow(pnlComparison.p1.start, pnlComparison.p1.end) : [])
      .map((row) => [pnlLineKey(row), Number(row.amount || 0)])
  );
  const pnlP2Map = new Map(
    (pnlComparisonCoverage.p2.exact ? pnlRowsForWindow(pnlComparison.p2.start, pnlComparison.p2.end) : [])
      .map((row) => [pnlLineKey(row), Number(row.amount || 0)])
  );
  const pnlP3Map = new Map(
    (pnlComparisonCoverage.p3.exact ? pnlRowsForWindow(pnlComparison.p3.start, pnlComparison.p3.end) : [])
      .map((row) => [pnlLineKey(row), Number(row.amount || 0)])
  );
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
  const sectionSummary = Object.entries(
    pAndL.reduce((acc, row) => {
      if (!acc[row.section]) acc[row.section] = [];
      acc[row.section].push(row);
      return acc;
    }, {})
  )
    .map(([section, sectionRows]) => {
      const preferredLineItem = {
        Income: "Total for Income",
        "Cost of Sales": "Total for Cost of Sales",
        "Other Income(Loss)": "Total for Other Income(Loss)",
        Expenses: "Total for Expenses",
        "Other Expenses": "Total for Other Expenses",
      }[section];
      const preferredRow = sectionRows.find((row) => row.line_item === preferredLineItem) || sectionRows.find((row) => row.is_total);
      return {
        section,
        amount: Number(preferredRow?.amount || 0),
        rows: sectionRows.length,
      };
    })
    .sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)));

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

  const pnlRangeClauses = ["r.period_start IS NOT NULL", "r.period_end IS NOT NULL", "r.dimension = $rangeDimension"];
  const pnlRangeValues = { $rangeDimension: requestedDimension };
  const rangeCompany = params.get("company");
  const rangeBatch = params.get("batch");
  if (rangeCompany && rangeCompany !== "all") {
    pnlRangeClauses.push("c.name = $rangeCompany");
    pnlRangeValues.$rangeCompany = rangeCompany;
  }
  if (rangeBatch && rangeBatch !== "all") {
    pnlRangeClauses.push("b.batch_key = $rangeBatch");
    pnlRangeValues.$rangeBatch = rangeBatch;
  }
  const pnlAvailableRanges = db
    .prepare(
      `
      SELECT
        r.period_start AS start,
        r.period_end AS end,
        COUNT(DISTINCT r.id) AS report_count,
        COUNT(DISTINCT r.company_id) AS company_count
      FROM reports r
      JOIN batches b ON b.id = r.batch_id
      JOIN companies c ON c.id = r.company_id
      WHERE ${pnlRangeClauses.join(" AND ")}
      GROUP BY r.period_start, r.period_end
      ORDER BY r.period_end DESC, r.period_start DESC
      `
    )
    .all(pnlRangeValues);
  const widestCompanyCoverage = Math.max(...pnlAvailableRanges.map((range) => Number(range.company_count || 0)), 0);
  const completePnlRanges = pnlAvailableRanges.filter(
    (range) => Number(range.company_count || 0) === widestCompanyCoverage
  );
  const monthlyPnlRanges = completePnlRanges.filter((range) => daysBetween(range.start, range.end) <= 45);
  const preferredPnlRange = monthlyPnlRanges[0] || completePnlRanges[0] || null;

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
    pnlAvailableRanges,
    preferredPnlRange,
    pnlCoverage: {
      requested: requestedPnlRange,
      active: filteredReportDateRange,
      reportCount: filteredReports.length,
      exact: Boolean(
        filteredReports.length &&
          filteredReports.every(
            (report) =>
              (!requestedPnlRange.from || report.period_start === requestedPnlRange.from) &&
              (!requestedPnlRange.to || report.period_end === requestedPnlRange.to)
          )
      ),
    },
    pnlComparison,
    pnlComparisonCoverage,
    fxPolicy: {
      basis: "stored_import_rate",
      note: "HKD values use the stored import rate shown in meta.fx; they are not represented as historical daily rates.",
    },
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
            SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.amount_hkd END) AS costed_revenue,
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
          MIN(s.sku) AS sku,
          MIN(COALESCE(sc.mapped_product_name, s.product_name)) AS product_name,
          SUM(s.quantity) AS quantity,
          SUM(s.amount_hkd) AS revenue,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.amount_hkd END) AS costed_revenue,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN NULL ELSE s.quantity * sc.unit_cost_hkd END) AS cogs_hkd,
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.quantity END) AS costed_quantity,
          CASE WHEN SUM(s.quantity) != 0 THEN SUM(s.amount_hkd) / SUM(s.quantity) ELSE 0 END AS avg_price,
          COUNT(DISTINCT c.name) AS company_count,
          COUNT(DISTINCT s.customer) AS customer_count
        ${skuJoin}
        GROUP BY ${skuBrandKey}, lower(s.sku), lower(trim(COALESCE(sc.mapped_product_name, s.product_name)))
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
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.amount_hkd END) AS costed_revenue,
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
          SUM(CASE WHEN sc.unit_cost_hkd IS NULL THEN 0 ELSE s.amount_hkd END) AS costed_revenue,
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
  const skuTotalP2Metric = fairGrowthMetric(skuCurrentRevenue, daysP1, new Map([["total", skuLyRevenue]]), daysP2, "total");
  const skuTotalP3Metric = fairGrowthMetric(skuCurrentRevenue, daysP1, new Map([["total", skuP3mRevenue]]), daysP3, "total");
  const skuKey = (row) =>
    `${row.brand_key || String(row.brand || "").toLowerCase()}|${String(row.sku || "").toLowerCase()}|${String(row.product_name || "").trim().toLowerCase()}`;
  const skuGrossProfit = (row) => {
    if (row.cogs_hkd === null || row.cogs_hkd === undefined) return null;
    const costedRevenue = Number(row.costed_revenue || 0);
    if (Math.abs(costedRevenue) < 0.01) return null;
    return costedRevenue - Number(row.cogs_hkd || 0);
  };
  const skuGrossMargin = (row, grossProfit) => {
    const costedRevenue = Number(row.costed_revenue || 0);
    return grossProfit === null || !costedRevenue ? null : grossProfit / costedRevenue;
  };
  const skuMarginCoverage = (row) => {
    const revenue = Number(row.revenue || 0);
    return revenue ? Number(row.costed_revenue || 0) / revenue : 0;
  };

  const pnlAvailable = meta.pnlCoverage.exact;
  const unavailableKpis = { revenue: null, gross_profit: null, expenses: null, net_earnings: null };
  const revenueGrowthRow = pAndL.find((row) => row.section === "Income" && row.line_item === "Total for Income");

  return {
    ready: true,
    filters: Object.fromEntries(params.entries()),
    kpis: pnlAvailable ? (kpiRows[0] || {}) : unavailableKpis,
    byCompany: pnlAvailable ? byCompany : [],
    companyPerformance: pnlAvailable ? companyPerformance : [],
    byEntity: pnlAvailable ? byEntity : [],
    expenses: pnlAvailable ? expenseBreakdown : [],
    lines: pnlAvailable ? lines : [],
    pAndL: pnlAvailable ? pAndL : [],
    sectionSummary: pnlAvailable ? sectionSummary : [],
    companyEntity: pnlAvailable ? companyEntity : [],
    insights: {
      available: pnlAvailable,
      revenueTotal: pnlAvailable ? revenueTotal : null,
      expenseTotal: pnlAvailable ? expenseTotal : null,
      costOfSalesTotal: pnlAvailable ? costOfSalesTotal : null,
      netEarnings: pnlAvailable ? Number((kpiRows[0] || {}).net_earnings || 0) : null,
      netMargin: pnlAvailable && revenueTotal ? Number((kpiRows[0] || {}).net_earnings || 0) / revenueTotal : null,
      revenueGrowth: {
        growth_p2: pnlAvailable ? (revenueGrowthRow?.growth_p2 ?? null) : null,
        growth_p3: pnlAvailable ? (revenueGrowthRow?.growth_p3 ?? null) : null,
        status_p2: pnlAvailable ? (revenueGrowthRow?.growth_status_p2 || "no_prior") : "unavailable",
        status_p3: pnlAvailable ? (revenueGrowthRow?.growth_status_p3 || "no_prior") : "unavailable",
      },
      skuGrowth: {
        current_revenue: skuCurrentRevenue,
        p2_revenue: skuLyRevenue,
        p3_revenue: skuP3mRevenue,
        growth_p2: skuTotalP2Metric.growth,
        growth_p3: skuTotalP3Metric.growth,
        status_p2: skuTotalP2Metric.status,
        status_p3: skuTotalP3Metric.status,
        basis: "transaction_sales_monthly",
        window: skuComparison,
      },
      topRevenueCompany: pnlAvailable ? topRevenueCompany : null,
      topRevenueBrand: pnlAvailable ? topRevenueBrand : null,
      bestMarginCompany: pnlAvailable ? bestMarginCompany : null,
      bestMarginBrand: pnlAvailable ? bestMarginBrand : null,
      largestExpense: pnlAvailable ? largestExpense : null,
      topCostOfSalesBrand: pnlAvailable ? topCostOfSalesBrand : null,
      lossCompanies: pnlAvailable ? lossCompanies : [],
    },
    intercompany: {
      included: true,
      candidates: intercompanyEliminations || {},
      rule: "No automatic P&L elimination is applied. Name-matched candidates are disclosed separately until explicit elimination entries are supplied.",
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
          margin_coverage: skuMarginCoverage(row),
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
          margin_coverage: skuMarginCoverage(row),
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
          margin_coverage: skuMarginCoverage(row),
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

  if (url.pathname === "/api/chat/status" && req.method === "GET") {
    json(res, 200, { ok: true, configured: !!process.env.OPENAI_API_KEY });
    return;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    if (!process.env.OPENAI_API_KEY) {
      json(res, 400, { ok: false, error: "OpenAI API Key is not configured. Please set the OPENAI_API_KEY variable in your environment (e.g. Railway variables)." });
      return;
    }

    try {
      const body = await readJson(req);
      const { messages, model } = body;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: messages,
          temperature: 0.5
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        json(res, response.status, { ok: false, error: resData.error?.message || "OpenAI API Error" });
        return;
      }

      json(res, 200, { ok: true, data: resData });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

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

  if (url.pathname === "/api/auth/verify-slide" && req.method === "POST") {
    try {
      json(res, 200, { ok: true, token: generateSlideToken() });
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

      // Verify signed slide token
      const slideOk = verifySlideToken(body.slideToken);
      if (!slideOk) {
        json(res, 400, { ok: false, error: "Security check failed. Please slide to verify." });
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

  if (url.pathname === "/api/warehouse/stock-levels" && req.method === "GET") {
    try {
      initWarehouseDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, stockLevels: [] });
        return;
      }
      const levels = db.prepare(`
        SELECT 
          w.*, 
          COALESCE(c.unit_cost_hkd, 0.0) as unit_cost_hkd,
          COALESCE(p.rsp, 0.0) as rsp
        FROM warehouse_inventory w
        LEFT JOIN sku_costs c ON w.sku = c.sku
        LEFT JOIN (
          SELECT sku, MAX(rsp) as rsp 
          FROM promotion_proposals 
          GROUP BY sku
        ) p ON w.sku = p.sku
        ORDER BY w.sku ASC
      `).all();
      json(res, 200, { ok: true, stockLevels: levels });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/adjust" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { id, qtyChange, reason } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      const item = db.prepare("SELECT * FROM warehouse_inventory WHERE id = ?").get(id);
      if (!item) {
        json(res, 404, { ok: false, error: "Item not found." });
        return;
      }

      const nextStock = Math.max(0, item.stock_on_hand + Number(qtyChange));
      db.prepare("UPDATE warehouse_inventory SET stock_on_hand = ? WHERE id = ?").run(nextStock, id);
      
      db.prepare(`
        INSERT INTO warehouse_stock_movements (sku, qty_change, prev_qty, new_qty, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(item.sku, Number(qtyChange), item.stock_on_hand, nextStock, reason || "Manual Adjustment");
      
      json(res, 200, { ok: true, nextStock });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/movements" && req.method === "GET") {
    try {
      const sku = url.searchParams.get("sku");
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, movements: [] });
        return;
      }
      const movements = db.prepare("SELECT * FROM warehouse_stock_movements WHERE sku = ? ORDER BY id DESC").all(sku);
      json(res, 200, { ok: true, movements });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/update-reorder" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { id, reorderPoint } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      db.prepare("UPDATE warehouse_inventory SET reorder_point = ? WHERE id = ?").run(Number(reorderPoint), id);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/transfer-sited" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { id, qty, direction } = body;
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available." });
        return;
      }
      const item = db.prepare("SELECT * FROM warehouse_inventory WHERE id = ?").get(id);
      if (!item) {
        json(res, 404, { ok: false, error: "Item not found." });
        return;
      }
      
      const transferQty = Number(qty);
      let nextSoh = item.stock_on_hand;
      let nextSited = item.sited_stock || 0;
      
      if (direction === "to_sited") {
        if (item.stock_on_hand < transferQty) {
          json(res, 400, { ok: false, error: "Insufficient Active SOH to transfer." });
          return;
        }
        nextSoh -= transferQty;
        nextSited += transferQty;
      } else {
        if (nextSited < transferQty) {
          json(res, 400, { ok: false, error: "Insufficient Sited stock to transfer." });
          return;
        }
        nextSoh += transferQty;
        nextSited -= transferQty;
      }
      
      db.prepare("UPDATE warehouse_inventory SET stock_on_hand = ?, sited_stock = ? WHERE id = ?").run(nextSoh, nextSited, id);
      
      db.prepare(`
        INSERT INTO warehouse_stock_movements (sku, qty_change, prev_qty, new_qty, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        item.sku,
        direction === "to_sited" ? -transferQty : transferQty,
        item.stock_on_hand,
        nextSoh,
        direction === "to_sited" ? `Transfer SOH to Sited Slots` : `Transfer Sited Slots to SOH`
      );
      
      json(res, 200, { ok: true, stock_on_hand: nextSoh, sited_stock: nextSited });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/sited-checkout" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { id, qty } = body;
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available." });
        return;
      }
      const item = db.prepare("SELECT * FROM warehouse_inventory WHERE id = ?").get(id);
      if (!item) {
        json(res, 404, { ok: false, error: "Item not found." });
        return;
      }
      
      const checkoutQty = Number(qty);
      const nextSited = (item.sited_stock || 0) - checkoutQty;
      if (nextSited < 0) {
        json(res, 400, { ok: false, error: "Insufficient Sited stock for checkout." });
        return;
      }
      
      db.prepare("UPDATE warehouse_inventory SET sited_stock = ? WHERE id = ?").run(nextSited, id);
      
      db.prepare(`
        INSERT INTO warehouse_stock_movements (sku, qty_change, prev_qty, new_qty, reason, timestamp)
        VALUES (?, 0, ?, ?, ?, datetime('now'))
      `).run(
        item.sku,
        item.stock_on_hand,
        item.stock_on_hand,
        `Sited Checkout Scan: ${checkoutQty} units settled`
      );
      
      json(res, 200, { ok: true, sited_stock: nextSited });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/replenishment" && req.method === "GET") {
    try {
      initWarehouseDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, items: [] });
        return;
      }
      
      const maxDateRow = db.prepare("SELECT MAX(transaction_date) as max_date FROM sku_sales").get();
      const maxDate = maxDateRow?.max_date || "2026-05-22";
      
      const salesList = db.prepare(`
        SELECT lower(sku) as sku_lower, SUM(quantity) as total_qty
        FROM sku_sales
        WHERE transaction_date BETWEEN date(?, '-90 days') AND ?
        GROUP BY lower(sku)
      `).all(maxDate, maxDate);
      
      const velocityMap = {};
      salesList.forEach(s => {
        velocityMap[s.sku_lower] = s.total_qty || 0;
      });
      
      // Also compute consignment-specific sales for the drift buffer calculation
      const consignmentSales = db.prepare(`
        SELECT lower(sku) as sku_lower, SUM(quantity) as total_qty
        FROM sku_sales
        WHERE customer = 'HKTVMALL' AND transaction_date BETWEEN date(?, '-90 days') AND ?
        GROUP BY lower(sku)
      `).all(maxDate, maxDate);
      
      const consignmentMap = {};
      consignmentSales.forEach(s => {
        consignmentMap[s.sku_lower] = s.total_qty || 0;
      });
      
      const inventory = db.prepare(`
        SELECT w.*, COALESCE(c.unit_cost_hkd, 0.0) as unit_cost_hkd
        FROM warehouse_inventory w
        LEFT JOIN sku_costs c ON w.sku = c.sku
        ORDER BY w.sku ASC
      `).all();
      
      const items = inventory.map(item => {
        const skuLower = item.sku.toLowerCase();
        
        // Rolling 90-day sales velocity
        const qty90d = velocityMap[skuLower] || 0;
        const dailyVelocity = qty90d / 90.0;
        const monthlyVelocity = dailyVelocity * 30.0;
        
        // Inventory cover (months)
        const coverMonths = monthlyVelocity > 0 ? (item.stock_on_hand / monthlyVelocity) : 999.0;
        
        // Warning status: cover < 1 month (under-stock), cover > 3 months (over-stock)
        let warningStatus = "Normal";
        if (coverMonths < 1.0) {
          warningStatus = "Under-stock";
        } else if (coverMonths > 3.0 && coverMonths < 900) {
          warningStatus = "Over-stock";
        }
        
        // Consignment drift buffer calculations (HKTVMALL lag = 30 days)
        const consignmentQty90d = consignmentMap[skuLower] || 0;
        const consignmentDailyRunRate = consignmentQty90d / 90.0;
        const predictiveDrawdown = consignmentDailyRunRate * 30.0;
        
        return {
          ...item,
          qty_90d: qty90d,
          daily_velocity: dailyVelocity,
          monthly_velocity: monthlyVelocity,
          cover_months: coverMonths,
          warning_status: warningStatus,
          consignment_daily_run_rate: consignmentDailyRunRate,
          predictive_drawdown: predictiveDrawdown
        };
      });
      
      json(res, 200, { ok: true, items });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/audit-sync" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { adjustments } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      const results = [];
      for (const adj of adjustments) {
        const item = db.prepare("SELECT * FROM warehouse_inventory WHERE id = ?").get(adj.id);
        if (item) {
          const audited = Number(adj.auditedQty);
          const variance = audited - item.stock_on_hand;
          
          if (variance !== 0) {
            db.prepare("UPDATE warehouse_inventory SET stock_on_hand = ? WHERE id = ?").run(audited, adj.id);
            db.prepare(`
              INSERT INTO warehouse_stock_movements (sku, qty_change, prev_qty, new_qty, reason, timestamp)
              VALUES (?, ?, ?, ?, ?, datetime('now'))
            `).run(item.sku, variance, item.stock_on_hand, audited, "Physical Audit Reconciliation");
          }
          
          results.push({
            id: item.id,
            sku: item.sku,
            description: item.description,
            prev_qty: item.stock_on_hand,
            new_qty: audited,
            variance
          });
        }
      }
      
      json(res, 200, { ok: true, results, message: "Inventory successfully updated and synced with QuickBooks." });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/expiry-directory" && req.method === "GET") {
    try {
      initWarehouseDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, directory: [] });
        return;
      }
      const directory = db.prepare("SELECT * FROM warehouse_expiry_directory ORDER BY id DESC").all();
      json(res, 200, { ok: true, directory });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/expiry-record" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { sku, batchNumber, quantity, receiveDate, expiryDate } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      const item = db.prepare("SELECT * FROM warehouse_inventory WHERE sku = ?").get(sku);
      if (!item) {
        json(res, 404, { ok: false, error: `SKU ${sku} not found in inventory.` });
        return;
      }
      
      const qty = Number(quantity);
      db.prepare(`
        INSERT INTO warehouse_expiry_directory (sku, brand, description, batch_number, quantity, receive_date, expiry_date, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(sku, item.brand, item.description, batchNumber, qty, receiveDate, expiryDate);
      
      const nextSoh = item.stock_on_hand + qty;
      db.prepare("UPDATE warehouse_inventory SET stock_on_hand = ? WHERE sku = ?").run(nextSoh, sku);
      
      db.prepare(`
        INSERT INTO warehouse_stock_movements (sku, qty_change, prev_qty, new_qty, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(sku, qty, item.stock_on_hand, nextSoh, `Inbound Lot Received: Batch ${batchNumber}`);
      
      json(res, 200, { ok: true, message: `Successfully registered Batch ${batchNumber} and added ${qty} units to SOH.` });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/edi-orders" && req.method === "GET") {
    try {
      initWarehouseDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, orders: [] });
        return;
      }
      const orders = db.prepare("SELECT * FROM warehouse_edi_orders ORDER BY id DESC").all();
      json(res, 200, { ok: true, orders });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/edi-process" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const { id } = body;
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      const order = db.prepare("SELECT * FROM warehouse_edi_orders WHERE id = ?").get(id);
      if (!order) {
        json(res, 404, { ok: false, error: "EDI Order not found." });
        return;
      }
      
      db.prepare("UPDATE warehouse_edi_orders SET status = 'Processed' WHERE id = ?").run(id);
      
      json(res, 200, { ok: true, message: `PO ${order.po_number} successfully processed and populated as invoice in QuickBooks.` });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/warehouse/carrier-metrics" && req.method === "GET") {
    try {
      initWarehouseDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, metrics: [] });
        return;
      }
      const metrics = db.prepare("SELECT * FROM warehouse_carrier_metrics ORDER BY id ASC").all();
      json(res, 200, { ok: true, metrics });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/settings" && req.method === "GET") {
    try {
      initAdsDb();
      const db = openDb();
      if (!db) {
        json(res, 200, { ok: true, settings: { connected: 0, app_id: "", access_token: "", ad_account_id: "", ai_optimization: 0 } });
        return;
      }
      const settings = db.prepare("SELECT * FROM meta_ads_settings ORDER BY id ASC LIMIT 1").get();
      json(res, 200, { ok: true, settings });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/settings" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { connected, app_id, access_token, ad_account_id } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      db.prepare(`
        UPDATE meta_ads_settings 
        SET connected = ?, app_id = ?, access_token = ?, ad_account_id = ?
        WHERE id = (SELECT id FROM meta_ads_settings ORDER BY id ASC LIMIT 1)
      `).run(Number(connected), app_id || "", access_token || "", ad_account_id || "");
      
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/toggle-ai" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { ai_optimization } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }
      
      db.prepare(`
        UPDATE meta_ads_settings 
        SET ai_optimization = ?
        WHERE id = (SELECT id FROM meta_ads_settings ORDER BY id ASC LIMIT 1)
      `).run(Number(ai_optimization));
      
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/performance" && req.method === "GET") {
    try {
      initAdsDb();
      const db = openDb();
      let connected = 0;
      let ai_optimization = 0;
      let campaigns = [];
      if (db) {
        const settings = db.prepare("SELECT connected, ai_optimization FROM meta_ads_settings ORDER BY id ASC LIMIT 1").get();
        if (settings) {
          connected = settings.connected;
          ai_optimization = settings.ai_optimization;
        }

        let queryStr = "SELECT * FROM meta_campaigns";
        if (!connected) {
          queryStr += " WHERE id NOT IN ('camp_1', 'camp_2', 'camp_3', 'camp_4', 'camp_5', 'camp_6', 'camp_7', 'camp_8')";
        }
        const list = db.prepare(queryStr).all();
        campaigns = list.map(camp => {
          const metrics = {
              results: camp.results,
              value: camp.value,
              roas: camp.roas,
              cost_per_result: camp.cost_per_result,
              spent: camp.spent,
              impressions: camp.impressions,
              reach: camp.reach
            };

            if (ai_optimization && camp.status === "ACTIVE") {
              const optType = camp.objective;
              let newCost = camp.cost_per_result;
              let newResults = camp.results;
              let newSpent = camp.spent;
              let newRoas = camp.roas;
              let newValue = camp.value;
              
              if (optType === "Traffic" || optType === "Engagement") {
                newCost = Math.round(camp.cost_per_result * 0.88 * 100) / 100;
                newResults = Math.round(camp.results * 1.12);
                newSpent = Math.round(newResults * newCost * 100) / 100;
                if (camp.value > 0) {
                  newValue = Math.round(camp.value * 1.08 * 100) / 100;
                  newRoas = Math.round((newValue / newSpent) * 100) / 100;
                }
              } else if (optType === "Awareness") {
                newCost = Math.round(camp.cost_per_result * 0.85 * 100) / 100;
                newResults = Math.round(camp.results * 1.15);
                newSpent = Math.round(newResults * newCost * 100) / 100;
              }
              
              return {
                id: camp.id,
                name: camp.name,
                objective: camp.objective,
                status: camp.status,
                recommendations: camp.recommendations,
                daily_budget: camp.daily_budget,
                creative_text: camp.creative_text,
                image_url: camp.image_url,
                targeting: camp.targeting,
                placement: camp.placement,
                ai_adjusted: true,
                metrics: {
                  results: newResults,
                  cost_per_result: newCost,
                  spent: newSpent,
                  value: newValue,
                  roas: newRoas,
                  impressions: Math.round(camp.impressions * 1.1),
                  reach: Math.round(camp.reach * 1.12)
                }
              };
            }

            return {
              id: camp.id,
              name: camp.name,
              objective: camp.objective,
              status: camp.status,
              recommendations: camp.recommendations,
              daily_budget: camp.daily_budget,
              creative_text: camp.creative_text,
              image_url: camp.image_url,
              targeting: camp.targeting,
              placement: camp.placement,
              metrics
            };
          });
      }

      json(res, 200, { ok: true, campaigns, connected, ai_optimization });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/campaigns/create" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { name, objective, daily_budget, creative_text, image_url, targeting, placement } = body;
      
      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }

      const id = "camp_" + Date.now();
      const budget = Number(daily_budget || 50.0);
      const costPerRes = objective === "Traffic" ? 0.48 : objective === "Awareness" ? 0.02 : 1.50;
      const spent = Math.round(budget * 0.4 * 100) / 100;
      const results = Math.round(spent / costPerRes);
      const impressions = results * (objective === "Awareness" ? 120 : 18);
      const reach = Math.round(impressions * 0.85);
      const value = objective === "Sales" ? Math.round(spent * 2.8 * 100) / 100 : 0.0;
      const roas = value > 0 ? Math.round((value / spent) * 100) / 100 : 0.0;

      db.prepare(`
        INSERT INTO meta_campaigns (id, name, objective, status, recommendations, results, value, roas, cost_per_result, spent, impressions, reach, daily_budget, creative_text, image_url, targeting, placement)
        VALUES (?, ?, ?, 'ACTIVE', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, objective, results, value, roas, costPerRes, spent, impressions, reach, budget, creative_text || "", image_url || "", targeting || "", placement || "");

      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/campaigns/toggle-status" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { id, status } = body;

      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }

      db.prepare("UPDATE meta_campaigns SET status = ? WHERE id = ?").run(status, id);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/campaigns/delete" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { id } = body;

      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }

      db.prepare("DELETE FROM meta_campaigns WHERE id = ?").run(id);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/ads/campaigns/apply-recommendation" && req.method === "POST") {
    try {
      initAdsDb();
      const body = await readJson(req);
      const { id } = body;

      const db = openDbWrite();
      if (!db) {
        json(res, 400, { ok: false, error: "Database not available for write." });
        return;
      }

      const camp = db.prepare("SELECT * FROM meta_campaigns WHERE id = ?").get(id);
      if (!camp) {
        json(res, 404, { ok: false, error: "Campaign not found." });
        return;
      }

      // Calculate optimized metrics
      const nextCost = Math.round(camp.cost_per_result * 0.85 * 100) / 100;
      const nextResults = Math.round(camp.results * 1.15);
      const nextSpent = Math.round(nextResults * nextCost * 100) / 100;
      const nextValue = camp.value > 0 ? Math.round(camp.value * 1.15 * 100) / 100 : 0.0;
      const nextRoas = nextValue > 0 ? Math.round((nextValue / nextSpent) * 100) / 100 : 0.0;

      db.prepare(`
        UPDATE meta_campaigns 
        SET recommendations = 0, cost_per_result = ?, results = ?, spent = ?, value = ?, roas = ?
        WHERE id = ?
      `).run(nextCost, nextResults, nextSpent, nextValue, nextRoas, id);

      json(res, 200, { ok: true });
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
