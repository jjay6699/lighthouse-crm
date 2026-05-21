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


def discover_report_files():
    items = []
    for path in sorted(FINANCE_DIR.glob("*.xlsx")):
        items.append(
            {
                "path": path,
                "batch_key": "initial-import",
                "batch_name": "Initial import",
                "uploaded_at": "",
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
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                batch_name = meta.get("name") or batch_name
                uploaded_at = meta.get("uploaded_at") or ""
            except Exception:
                pass
        for path in sorted(batch_dir.glob("*.xlsx")):
            items.append(
                {
                    "path": path,
                    "batch_key": batch_key,
                    "batch_name": batch_name,
                    "uploaded_at": uploaded_at,
                }
            )
    return items


def init_db(conn: sqlite3.Connection):
    conn.executescript(
        """
        DROP TABLE IF EXISTS facts;
        DROP TABLE IF EXISTS reports;
        DROP TABLE IF EXISTS fx_rates;
        DROP TABLE IF EXISTS companies;
        DROP TABLE IF EXISTS batches;

        CREATE TABLE batches (
            id INTEGER PRIMARY KEY,
            batch_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            uploaded_at TEXT NOT NULL
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

        CREATE INDEX idx_facts_report ON facts(report_id);
        CREATE INDEX idx_facts_entity ON facts(entity);
        CREATE INDEX idx_facts_line_item ON facts(line_item);
        CREATE INDEX idx_reports_dimension ON reports(dimension);
        """
    )


def main():
    DATA_DIR.mkdir(exist_ok=True)
    source_items = discover_report_files()
    reports = []
    for item in source_items:
        report = parse_file(item["path"])
        report.update(
            {
                "batch_key": item["batch_key"],
                "batch_name": item["batch_name"],
                "uploaded_at": item["uploaded_at"],
            }
        )
        reports.append(report)
    currencies = sorted({report["currency"] for report in reports})
    rates = {currency: fetch_rate_to_hkd(currency) for currency in currencies}

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    with conn:
        for currency, (rate, provider, as_of) in rates.items():
            conn.execute(
                "INSERT INTO fx_rates VALUES (?, ?, ?, ?, ?)",
                (currency, TARGET_CURRENCY, rate, provider, as_of),
            )

        for report in reports:
            conn.execute(
                "INSERT OR IGNORE INTO batches(batch_key, name, uploaded_at) VALUES (?, ?, ?)",
                (report["batch_key"], report["batch_name"], report["uploaded_at"]),
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

    total_facts = conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0]
    conn.close()
    print(f"Imported {len(reports)} reports and {total_facts:,} facts into {DB_PATH}")


if __name__ == "__main__":
    main()
