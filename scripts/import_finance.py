from __future__ import annotations

import json
import os
import re
import sqlite3
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
FINANCE_DIR = Path(os.environ.get("FINANCE_DIR", ROOT / "finance consilidation"))
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "finance.sqlite"))
TARGET_CURRENCY = "HKD"

COMPANY_CURRENCY = {
    "Moment Health Sdn Bhd": "MYR",
    "健康創富有限公司": "TWD",
}

FALLBACK_RATES_TO_HKD = {
    "HKD": 1.0,
    "MYR": 1.65,
    "TWD": 0.24,
}

SECTION_NAMES = {
    "Income",
    "Cost of Sales",
    "Other Income(Loss)",
    "Expenses",
    "Other Expenses",
}

MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def infer_currency(company: str) -> str:
    return COMPANY_CURRENCY.get(company, "HKD")


def fetch_rate_to_hkd(source: str) -> tuple[float, str, str]:
    if source == TARGET_CURRENCY:
        return 1.0, "fixed", datetime.now(timezone.utc).date().isoformat()

    url = f"https://open.er-api.com/v6/latest/{source}"
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rate = float(payload["rates"][TARGET_CURRENCY])
        return rate, "open.er-api.com", payload.get("time_last_update_utc", "")
    except Exception:
        return FALLBACK_RATES_TO_HKD[source], "fallback", datetime.now(timezone.utc).date().isoformat()


def load_stored_rates(db_path: Path) -> dict[str, tuple[float, str, str]]:
    if not db_path.exists():
        return {}
    conn = sqlite3.connect(db_path)
    try:
        table = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fx_rates'"
        ).fetchone()
        if not table:
            return {}
        return {
            source: (float(rate), provider, as_of)
            for source, rate, provider, as_of in conn.execute(
                "SELECT source_currency, rate, provider, as_of FROM fx_rates"
            )
        }
    finally:
        conn.close()


def clean_label(value) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def numeric(value):
    if pd.isna(value):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_period(period_label: str) -> tuple[str | None, str | None]:
    text = period_label.replace(",", "").strip()
    long_range = re.match(
        r"(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})",
        text,
    )
    if long_range:
        start = date(int(long_range.group(3)), MONTHS[long_range.group(2).lower()], int(long_range.group(1)))
        end = date(int(long_range.group(6)), MONTHS[long_range.group(5).lower()], int(long_range.group(4)))
        return start.isoformat(), end.isoformat()

    year_match = re.search(r"(20\d{2})", text)
    if not year_match:
        return None, None
    year = int(year_match.group(1))
    cleaned = text[: year_match.start()].strip()

    cross = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s*-\s*(\d{1,2})\s+([A-Za-z]+)", cleaned)
    if cross:
        start = date(year, MONTHS[cross.group(2).lower()], int(cross.group(1)))
        end = date(year, MONTHS[cross.group(4).lower()], int(cross.group(3)))
        return start.isoformat(), end.isoformat()

    same = re.match(r"(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)", cleaned)
    if same:
        month = MONTHS[same.group(3).lower()]
        start = date(year, month, int(same.group(1)))
        end = date(year, month, int(same.group(2)))
        return start.isoformat(), end.isoformat()

    one_day = re.match(r"(\d{1,2})\s+([A-Za-z]+)", cleaned)
    if one_day:
        day = int(one_day.group(1))
        month = MONTHS[one_day.group(2).lower()]
        value = date(year, month, day).isoformat()
        return value, value

    return None, None


def looks_like_transaction(value) -> bool:
    if pd.isna(value):
        return False
    text = str(value).strip()
    return bool(re.match(r"\d{1,2}[./]\d{1,2}[./]\d{4}", text))


def normalize_transaction_date(value) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.date().isoformat()
    text = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return text


def extract_barcode(*values) -> str:
    for value in values:
        if pd.isna(value):
            continue
        text = str(value)
        matches = re.findall(r"\d{8,14}", text)
        if matches:
            return matches[0]
    return ""


def normalize_sku(value) -> str:
    text = clean_label(value) or ""
    barcode = extract_barcode(text)
    if barcode:
        return barcode
    text = re.sub(r"^Total for\s+", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"^\(?\d{5,14}\)?\s*[-–]?\s*", "", text).strip()
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def clean_product_name(label: str) -> str:
    text = re.sub(r"^Total for\s+", "", label or "").strip()
    text = re.sub(r"^\(?\d{5,14}\)?\s*[-–]?\s*", "", text).strip()
    text = re.sub(r"^\d{5,14}\s*[-–]\s*", "", text).strip()
    return text or label


def parse_mapping_file(path: Path):
    if not path.exists():
        return []

    try:
        df = pd.read_excel(path, sheet_name="SKU MASTER")
    except Exception:
        return []

    costs = []
    for _, row in df.iterrows():
        unit_cost = numeric(row.get("COSGS"))
        if unit_cost is None:
            unit_cost = numeric(row.get("COSGS.1"))
        if unit_cost is None:
            currency = str(row.get("CURRENCY") or "").strip().upper()
            cogs = numeric(row.get("COGS"))
            if cogs is not None and currency in {"", "0", "HK", "HKD"}:
                unit_cost = cogs
        if unit_cost is not None and unit_cost <= 0:
            unit_cost = None

        brand = clean_label(row.get("BRAND")) or ""
        product_name = clean_label(row.get("NAME (ENG)")) or clean_label(row.get("NAME (CHI)")) or ""
        aliases = {
            normalize_sku(row.get("BARCODE")),
            normalize_sku(row.get("NAME (ENG)")),
            normalize_sku(row.get("NAME (CHI)")),
            normalize_sku(row.get("Unnamed: 0")),
        }
        for sku in aliases:
            if not sku:
                continue
            costs.append(
                {
                    "sku": sku,
                    "mapped_brand": brand,
                    "mapped_product_name": product_name,
                    "unit_cost_hkd": unit_cost,
                    "source_file": path.name,
                }
            )

    return costs


def discover_mapping_files():
    candidates = []
    seen = set()
    for path in [FINANCE_DIR / "MAPPING DATA.xlsx", *sorted(FINANCE_DIR.glob("**/*MAPPING*.xlsx"))]:
        key = str(path.resolve()).lower()
        if key in seen or not path.exists():
            continue
        seen.add(key)
        candidates.append(path)
    return candidates


def parse_mapping_files(paths):
    candidates_by_sku = {}
    for path in paths:
        for cost in parse_mapping_file(path):
            candidates_by_sku.setdefault(cost["sku"], []).append(cost)

    resolved = []
    for sku, candidates in candidates_by_sku.items():
        valid_costs = [cost for cost in candidates if cost["unit_cost_hkd"] is not None]
        if not valid_costs:
            chosen = candidates[0]
            resolved.append(chosen)
            continue

        counts = {}
        for cost in valid_costs:
            rounded = round(float(cost["unit_cost_hkd"]), 6)
            counts[rounded] = counts.get(rounded, 0) + 1
        chosen_value = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
        chosen = next(cost for cost in valid_costs if round(float(cost["unit_cost_hkd"]), 6) == chosen_value)
        chosen["unit_cost_hkd"] = chosen_value
        resolved.append(chosen)

    return resolved


def parse_file(path: Path):
    df = pd.read_excel(path, sheet_name=0, header=None)
    company = clean_label(df.iat[0, 0]) or path.name.split("_")[0]
    report_title = clean_label(df.iat[1, 0]) or ""
    period_label = clean_label(df.iat[2, 0]) or ""
    period_start, period_end = parse_period(period_label)
    dimension = "customer" if "Customer" in report_title else "class"
    currency = infer_currency(company)

    headers = []
    for col in range(1, df.shape[1]):
        label = clean_label(df.iat[4, col])
        if not label:
            continue
        if label == "Total" or label.startswith("Total for "):
            continue
        headers.append((col, label))

    facts = []
    current_section = None
    for row in range(5, df.shape[0]):
        line_item = clean_label(df.iat[row, 0])
        if not line_item:
            continue
        if line_item.startswith("Accrual Basis"):
            continue

        values = [(col, entity, numeric(df.iat[row, col])) for col, entity in headers]
        has_any_number = any(amount is not None for _, _, amount in values)

        if line_item in SECTION_NAMES:
            current_section = line_item
            continue

        if not has_any_number:
            if not line_item.startswith("Total for") and line_item not in {"Gross Profit", "Net Earnings"}:
                current_section = line_item if current_section is None else current_section
            continue

        for _, entity, amount in values:
            if amount is None:
                continue
            facts.append(
                {
                    "entity": entity,
                    "line_item": line_item,
                    "section": current_section or "Unclassified",
                    "row_order": row,
                    "amount_original": amount,
                    "is_total": int(line_item.startswith("Total for") or line_item in {"Gross Profit", "Net Earnings"}),
                }
            )

    return {
        "company": company,
        "currency": currency,
        "dimension": dimension,
        "report_title": report_title,
        "period_label": period_label,
        "period_start": period_start,
        "period_end": period_end,
        "source_file": path.name,
        "facts": facts,
    }


def parse_sales_file(path: Path):
    df = pd.read_excel(path, sheet_name=0, header=None)
    company = clean_label(df.iat[0, 0]) or path.name.split("_")[0]
    report_title = clean_label(df.iat[1, 0]) or ""
    period_label = clean_label(df.iat[2, 0]) or ""
    period_start, period_end = parse_period(period_label)
    currency = infer_currency(company)

    current_brand = None
    current_product = None
    sales = []

    for row in range(5, df.shape[0]):
        first = clean_label(df.iat[row, 0])
        transaction_date = clean_label(df.iat[row, 1])
        if looks_like_transaction(transaction_date):
            description = clean_label(df.iat[row, 5]) or current_product or ""
            sku = extract_barcode(description, current_product)
            amount = numeric(df.iat[row, 8])
            quantity = numeric(df.iat[row, 6])
            if amount is None and quantity is None:
                continue
            product_name = clean_product_name(current_product or description)
            brand = current_brand or product_name.split(" - ")[0].strip() or "Unmapped"
            sales.append(
                {
                    "transaction_date": normalize_transaction_date(transaction_date),
                    "customer": clean_label(df.iat[row, 4]) or "Not specified",
                    "brand": brand,
                    "sku": sku or product_name,
                    "product_name": product_name,
                    "quantity": quantity or 0,
                    "amount_original": amount or 0,
                }
            )
            continue

        if not first:
            continue

        if first.startswith("Total for"):
            continue

        next_is_transaction = row + 1 < df.shape[0] and looks_like_transaction(df.iat[row + 1, 1])
        if next_is_transaction:
            current_product = first
        else:
            current_brand = first.replace(" with sub-items", "").strip()
            current_product = None

    return {
        "company": company,
        "currency": currency,
        "report_title": report_title,
        "period_label": period_label,
        "period_start": period_start,
        "period_end": period_end,
        "source_file": path.name,
        "sales": sales,
    }


def discover_report_files():
    items = []
    for path in sorted(FINANCE_DIR.glob("*Profit and Loss*.xlsx")):
        items.append(
            {
                "path": path,
                "batch_key": "initial-import",
                "batch_name": "Initial import",
                "uploaded_at": "",
                "batch_period_start": "",
                "batch_period_end": "",
            }
        )

    batches_dir = FINANCE_DIR / "batches"
    for batch_dir in sorted(batches_dir.glob("*")):
        if not batch_dir.is_dir():
            continue
        meta_path = batch_dir / "batch.json"
        batch_key = batch_dir.name
        batch_name = batch_key
        uploaded_at = ""
        period_start = ""
        period_end = ""
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                batch_name = meta.get("name") or batch_name
                uploaded_at = meta.get("uploaded_at") or ""
                period_start = meta.get("period_start") or ""
                period_end = meta.get("period_end") or ""
            except Exception:
                pass
        for path in sorted(batch_dir.glob("*Profit and Loss*.xlsx")):
            items.append(
                {
                    "path": path,
                    "batch_key": batch_key,
                    "batch_name": batch_name,
                    "uploaded_at": uploaded_at,
                    "batch_period_start": period_start,
                    "batch_period_end": period_end,
                }
            )
    return items


def discover_sales_files():
    items = []
    for path in sorted(FINANCE_DIR.glob("*Sales by Product*.xlsx")):
        items.append(
            {
                "path": path,
                "batch_key": "initial-import",
                "batch_name": "Initial import",
                "uploaded_at": "",
                "batch_period_start": "",
                "batch_period_end": "",
            }
        )

    batches_dir = FINANCE_DIR / "batches"
    for batch_dir in sorted(batches_dir.glob("*")):
        if not batch_dir.is_dir():
            continue
        meta_path = batch_dir / "batch.json"
        batch_key = batch_dir.name
        batch_name = batch_key
        uploaded_at = ""
        period_start = ""
        period_end = ""
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                batch_name = meta.get("name") or batch_name
                uploaded_at = meta.get("uploaded_at") or ""
                period_start = meta.get("period_start") or ""
                period_end = meta.get("period_end") or ""
            except Exception:
                pass
        for path in sorted(batch_dir.glob("*Sales by Product*.xlsx")):
            items.append(
                {
                    "path": path,
                    "batch_key": batch_key,
                    "batch_name": batch_name,
                    "uploaded_at": uploaded_at,
                    "batch_period_start": period_start,
                    "batch_period_end": period_end,
                }
            )
    return items


def contained_in_broader_report(report, all_reports) -> bool:
    start = report.get("period_start")
    end = report.get("period_end")
    if not start or not end:
        return False

    for other in all_reports:
        if other is report:
            continue
        if other.get("company") != report.get("company"):
            continue
        if other.get("dimension") != report.get("dimension"):
            continue
        other_start = other.get("period_start")
        other_end = other.get("period_end")
        if not other_start or not other_end:
            continue
        if other_start <= start and other_end >= end and (other_start < start or other_end > end):
            return True
    return False


def dedupe_exact_period_reports(reports):
    chosen = {}
    for report in reports:
        key = (
            report.get("company"),
            report.get("dimension"),
            report.get("period_start"),
            report.get("period_end"),
        )
        current = chosen.get(key)
        if current is None or (report.get("uploaded_at") or "") >= (current.get("uploaded_at") or ""):
            chosen[key] = report
    return list(chosen.values())


def init_db(conn: sqlite3.Connection):
    conn.executescript(
        """
        DROP TABLE IF EXISTS facts;
        DROP TABLE IF EXISTS reports;
        DROP TABLE IF EXISTS sku_sales;
        DROP TABLE IF EXISTS sku_costs;
        DROP TABLE IF EXISTS fx_rates;
        DROP TABLE IF EXISTS companies;
        DROP TABLE IF EXISTS batches;

        CREATE TABLE batches (
            id INTEGER PRIMARY KEY,
            batch_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            period_start TEXT,
            period_end TEXT
        );

        CREATE TABLE companies (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            source_currency TEXT NOT NULL
        );

        CREATE TABLE fx_rates (
            source_currency TEXT NOT NULL,
            target_currency TEXT NOT NULL,
            rate REAL NOT NULL,
            provider TEXT NOT NULL,
            as_of TEXT NOT NULL,
            PRIMARY KEY (source_currency, target_currency)
        );

        CREATE TABLE reports (
            id INTEGER PRIMARY KEY,
            batch_id INTEGER NOT NULL REFERENCES batches(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            dimension TEXT NOT NULL,
            report_title TEXT NOT NULL,
            period_label TEXT NOT NULL,
            period_start TEXT,
            period_end TEXT,
            source_file TEXT NOT NULL
        );

        CREATE TABLE facts (
            id INTEGER PRIMARY KEY,
            report_id INTEGER NOT NULL REFERENCES reports(id),
            entity TEXT NOT NULL,
            line_item TEXT NOT NULL,
            section TEXT NOT NULL,
            row_order INTEGER NOT NULL,
            amount_original REAL NOT NULL,
            amount_hkd REAL NOT NULL,
            is_total INTEGER NOT NULL
        );

        CREATE TABLE sku_sales (
            id INTEGER PRIMARY KEY,
            batch_id INTEGER NOT NULL REFERENCES batches(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            source_file TEXT NOT NULL,
            period_label TEXT NOT NULL,
            period_start TEXT,
            period_end TEXT,
            transaction_date TEXT,
            customer TEXT NOT NULL,
            brand TEXT NOT NULL,
            sku TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            amount_original REAL NOT NULL,
            amount_hkd REAL NOT NULL
        );

        CREATE TABLE sku_costs (
            sku TEXT PRIMARY KEY,
            mapped_brand TEXT,
            mapped_product_name TEXT,
            unit_cost_hkd REAL,
            source_file TEXT NOT NULL
        );

        CREATE INDEX idx_facts_report ON facts(report_id);
        CREATE INDEX idx_facts_entity ON facts(entity);
        CREATE INDEX idx_facts_line_item ON facts(line_item);
        CREATE INDEX idx_reports_dimension ON reports(dimension);
        CREATE INDEX idx_sku_sales_brand ON sku_sales(brand);
        CREATE INDEX idx_sku_sales_sku ON sku_sales(sku);
        CREATE INDEX idx_sku_sales_batch ON sku_sales(batch_id);
        CREATE INDEX idx_sku_costs_sku ON sku_costs(sku);
        """
    )


def main():
    DATA_DIR.mkdir(exist_ok=True)
    source_items = discover_report_files()
    sales_items = discover_sales_files()
    reports = []
    for item in source_items:
        report = parse_file(item["path"])
        report.update(
            {
                "batch_key": item["batch_key"],
                "batch_name": item["batch_name"],
                "uploaded_at": item["uploaded_at"],
                "batch_period_start": item["batch_period_start"],
                "batch_period_end": item["batch_period_end"],
            }
        )
        reports.append(report)
    reports = dedupe_exact_period_reports(reports)

    sales_reports = []
    for item in sales_items:
        report = parse_sales_file(item["path"])
        report.update(
            {
                "batch_key": item["batch_key"],
                "batch_name": item["batch_name"],
                "uploaded_at": item["uploaded_at"],
                "batch_period_start": item["batch_period_start"],
                "batch_period_end": item["batch_period_end"],
            }
        )
        sales_reports.append(report)

    sku_costs = parse_mapping_files(discover_mapping_files())
    currencies = sorted({report["currency"] for report in reports + sales_reports})
    refresh_fx = os.environ.get("REFRESH_FX_RATES", "").strip().lower() in {"1", "true", "yes"}
    stored_rates = {} if refresh_fx else load_stored_rates(DB_PATH)
    rates = {
        currency: stored_rates.get(currency) or fetch_rate_to_hkd(currency)
        for currency in currencies
    }

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    with conn:
        for currency, (rate, provider, as_of) in rates.items():
            conn.execute(
                "INSERT INTO fx_rates VALUES (?, ?, ?, ?, ?)",
                (currency, TARGET_CURRENCY, rate, provider, as_of),
            )

        conn.executemany(
            """
            INSERT INTO sku_costs(sku, mapped_brand, mapped_product_name, unit_cost_hkd, source_file)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    cost["sku"],
                    cost["mapped_brand"],
                    cost["mapped_product_name"],
                    cost["unit_cost_hkd"],
                    cost["source_file"],
                )
                for cost in sku_costs
            ],
        )

        for report in reports:
            conn.execute(
                "INSERT OR IGNORE INTO batches(batch_key, name, uploaded_at, period_start, period_end) VALUES (?, ?, ?, ?, ?)",
                (
                    report["batch_key"],
                    report["batch_name"],
                    report["uploaded_at"],
                    report["batch_period_start"],
                    report["batch_period_end"],
                ),
            )
            batch_id = conn.execute(
                "SELECT id FROM batches WHERE batch_key = ?", (report["batch_key"],)
            ).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO companies(name, source_currency) VALUES (?, ?)",
                (report["company"], report["currency"]),
            )
            company_id = conn.execute(
                "SELECT id FROM companies WHERE name = ?", (report["company"],)
            ).fetchone()[0]
            cursor = conn.execute(
                """
                INSERT INTO reports(batch_id, company_id, dimension, report_title, period_label, period_start, period_end, source_file)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    company_id,
                    report["dimension"],
                    report["report_title"],
                    report["period_label"],
                    report["period_start"],
                    report["period_end"],
                    report["source_file"],
                ),
            )
            report_id = cursor.lastrowid
            rate = rates[report["currency"]][0]
            conn.executemany(
                """
                INSERT INTO facts(report_id, entity, line_item, section, row_order, amount_original, amount_hkd, is_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        report_id,
                        fact["entity"],
                        fact["line_item"],
                        fact["section"],
                        fact["row_order"],
                        fact["amount_original"],
                        fact["amount_original"] * rate,
                        fact["is_total"],
                    )
                    for fact in report["facts"]
                ],
            )

        seen_sales = set()
        for report in sales_reports:
            conn.execute(
                "INSERT OR IGNORE INTO batches(batch_key, name, uploaded_at, period_start, period_end) VALUES (?, ?, ?, ?, ?)",
                (
                    report["batch_key"],
                    report["batch_name"],
                    report["uploaded_at"],
                    report["batch_period_start"],
                    report["batch_period_end"],
                ),
            )
            batch_id = conn.execute(
                "SELECT id FROM batches WHERE batch_key = ?", (report["batch_key"],)
            ).fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO companies(name, source_currency) VALUES (?, ?)",
                (report["company"], report["currency"]),
            )
            company_id = conn.execute(
                "SELECT id FROM companies WHERE name = ?", (report["company"],)
            ).fetchone()[0]
            rate = rates[report["currency"]][0]
            sale_rows = []
            for sale in report["sales"]:
                dedupe_key = (
                    report["company"],
                    sale["transaction_date"],
                    sale["customer"].strip().lower(),
                    normalize_sku(sale["sku"]),
                    sale["product_name"].strip().lower(),
                    round(float(sale["quantity"] or 0), 6),
                    round(float(sale["amount_original"] or 0), 6),
                )
                if dedupe_key in seen_sales:
                    continue
                seen_sales.add(dedupe_key)
                sale_rows.append(
                    (
                        batch_id,
                        company_id,
                        report["source_file"],
                        report["period_label"],
                        report["period_start"],
                        report["period_end"],
                        sale["transaction_date"],
                        sale["customer"],
                        sale["brand"],
                        normalize_sku(sale["sku"]),
                        sale["product_name"],
                        sale["quantity"],
                        sale["amount_original"],
                        sale["amount_original"] * rate,
                    )
                )

            conn.executemany(
                """
                INSERT INTO sku_sales(
                    batch_id, company_id, source_file, period_label, period_start, period_end,
                    transaction_date, customer, brand, sku, product_name, quantity, amount_original, amount_hkd
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                sale_rows,
            )

    total_facts = conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0]
    total_sku_sales = conn.execute("SELECT COUNT(*) FROM sku_sales").fetchone()[0]
    total_sku_costs = conn.execute("SELECT COUNT(*) FROM sku_costs").fetchone()[0]
    conn.close()
    print(
        f"Imported {len(reports)} P&L reports, {total_facts:,} facts, "
        f"{total_sku_sales:,} SKU sales rows, and {total_sku_costs:,} SKU costs into {DB_PATH}"
    )


if __name__ == "__main__":
    main()
