from __future__ import annotations

import collections
import importlib.util
import math
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts" / "import_finance.py"

spec = importlib.util.spec_from_file_location("finance_importer", IMPORTER_PATH)
importer = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(importer)

TOLERANCE = 0.02
KEY_LINES = {
    "Total for Income",
    "Total for Cost of Sales",
    "Gross Profit",
    "Total for Other Income(Loss)",
    "Total for Expenses",
    "Total for Other Expenses",
    "Net Earnings",
}


def assert_close(actual, expected, message, tolerance=TOLERANCE):
    if not math.isclose(float(actual or 0), float(expected or 0), abs_tol=tolerance):
        raise AssertionError(f"{message}: actual={actual!r}, expected={expected!r}")


def report_fact_key(fact):
    return (
        fact["entity"],
        fact["entity_group"],
        fact["line_item"],
        fact["section"],
        int(fact["row_order"]),
        round(float(fact["amount_original"]), 6),
        int(fact["is_total"]),
    )


def sale_key(company, sale):
    return (
        company,
        sale["transaction_date"],
        sale["transaction_type"].strip().casefold(),
        sale["transaction_number"].strip().casefold(),
        sale["customer"].strip().casefold(),
        importer.normalize_sku(sale["sku"]),
        sale["product_name"].strip().casefold(),
        round(float(sale["quantity"] or 0), 6),
        round(float(sale["amount_original"] or 0), 6),
    )


def audit_pnl_sources(conn):
    parsed = []
    for item in importer.discover_report_files():
        report = importer.parse_file(item["path"])
        report.update(item)
        parsed.append(report)
    reports = importer.dedupe_exact_period_reports(parsed)

    source_rows_checked = 0
    entity_equations_checked = 0
    report_totals = {}

    for report in reports:
        df = importer.pd.read_excel(report["path"], sheet_name=0, header=None)
        entity_columns = [
            col
            for col in range(1, df.shape[1])
            if (label := importer.clean_label(df.iat[4, col]))
            and label != "Total"
            and not label.startswith("Total for ")
        ]
        total_column = next(
            (
                col
                for col in range(1, df.shape[1])
                if importer.clean_label(df.iat[4, col]) == "Total"
            ),
            None,
        )
        if total_column is None:
            raise AssertionError(f"{report['path'].name}: source Total column is missing")

        for row in range(5, df.shape[0]):
            values = [
                importer.numeric(df.iat[row, col])
                for col in entity_columns
            ]
            values = [value for value in values if value is not None]
            source_total = importer.numeric(df.iat[row, total_column])
            if values and source_total is not None:
                source_rows_checked += 1
                assert_close(
                    sum(values),
                    source_total,
                    f"{report['path'].name} row {row + 1} does not tie to its Total column",
                )

        by_entity = collections.defaultdict(lambda: collections.defaultdict(float))
        consolidated = collections.defaultdict(float)
        for fact in report["facts"]:
            by_entity[fact["entity"]][fact["line_item"]] += fact["amount_original"]
            if fact["line_item"] in KEY_LINES:
                consolidated[fact["line_item"]] += fact["amount_original"]

        for entity, lines in by_entity.items():
            revenue = lines.get("Total for Income")
            cost_of_sales = lines.get("Total for Cost of Sales")
            gross_profit = lines.get("Gross Profit")
            other_income = lines.get("Total for Other Income(Loss)", 0)
            expenses = lines.get("Total for Expenses", 0)
            other_expenses = lines.get("Total for Other Expenses", 0)
            net_earnings = lines.get("Net Earnings")
            if revenue is not None and cost_of_sales is not None and gross_profit is not None:
                assert_close(
                    gross_profit,
                    revenue - cost_of_sales,
                    f"{report['path'].name} / {entity}: gross profit equation failed",
                )
                entity_equations_checked += 1
            if gross_profit is not None and net_earnings is not None:
                assert_close(
                    net_earnings,
                    gross_profit + other_income - expenses - other_expenses,
                    f"{report['path'].name} / {entity}: net earnings equation failed",
                )
                entity_equations_checked += 1

        report_totals[
            (
                report["company"],
                report["period_start"],
                report["period_end"],
                report["dimension"],
            )
        ] = consolidated

        db_report = conn.execute(
            """
            SELECT r.id
            FROM reports r
            JOIN batches b ON b.id = r.batch_id
            JOIN companies c ON c.id = r.company_id
            WHERE b.batch_key = ?
              AND c.name = ?
              AND r.dimension = ?
              AND r.period_start = ?
              AND r.period_end = ?
              AND r.source_file = ?
            """,
            (
                report["batch_key"],
                report["company"],
                report["dimension"],
                report["period_start"],
                report["period_end"],
                report["source_file"],
            ),
        ).fetchone()
        if not db_report:
            raise AssertionError(f"{report['path'].name}: parsed report is missing from SQLite")
        db_facts = conn.execute(
            """
            SELECT entity, COALESCE(entity_group, entity), line_item, section,
                   row_order, amount_original, is_total
            FROM facts
            WHERE report_id = ?
            """,
            (db_report[0],),
        ).fetchall()
        expected_facts = collections.Counter(report_fact_key(fact) for fact in report["facts"])
        actual_facts = collections.Counter(
            (
                row[0],
                row[1],
                row[2],
                row[3],
                int(row[4]),
                round(float(row[5]), 6),
                int(row[6]),
            )
            for row in db_facts
        )
        if actual_facts != expected_facts:
            raise AssertionError(f"{report['path'].name}: SQLite facts differ from parsed source rows")

    dimensional_ties = 0
    for key, class_totals in report_totals.items():
        company, start, end, dimension = key
        if dimension != "class":
            continue
        customer_totals = report_totals.get((company, start, end, "customer"))
        if customer_totals is None:
            continue
        for line_item in KEY_LINES:
            assert_close(
                class_totals.get(line_item, 0),
                customer_totals.get(line_item, 0),
                f"{company} {start} to {end}: class/customer {line_item} mismatch",
            )
        dimensional_ties += 1

    return {
        "reports": len(reports),
        "source_rows": source_rows_checked,
        "equations": entity_equations_checked,
        "dimension_ties": dimensional_ties,
    }


def audit_sales_sources(conn):
    reports = []
    for item in importer.discover_sales_files():
        report = importer.parse_sales_file(item["path"])
        report.update(item)
        reports.append(report)

    expected_rows = []
    seen_counts = {}
    source_grand_totals = 0
    for report in reports:
        df = importer.pd.read_excel(report["path"], sheet_name=0, header=None)
        grand_total_rows = [
            row
            for row in range(5, df.shape[0])
            if (importer.clean_label(df.iat[row, 0]) or "").casefold() in {"total", "grand total"}
        ]
        if not grand_total_rows:
            raise AssertionError(f"{report['path'].name}: source grand total row is missing")
        grand_total_row = grand_total_rows[-1]
        assert_close(
            sum(float(sale["quantity"] or 0) for sale in report["sales"]),
            importer.numeric(df.iat[grand_total_row, 6]),
            f"{report['path'].name}: transaction quantities do not tie to source TOTAL",
        )
        assert_close(
            sum(float(sale["amount_original"] or 0) for sale in report["sales"]),
            importer.numeric(df.iat[grand_total_row, 8]),
            f"{report['path'].name}: transaction amounts do not tie to source TOTAL",
        )
        source_grand_totals += 1

        report_counts = {}
        for sale in report["sales"]:
            key = sale_key(report["company"], sale)
            occurrence = report_counts.get(key, 0) + 1
            report_counts[key] = occurrence
            if occurrence > seen_counts.get(key, 0):
                expected_rows.append((report, sale))
        for key, count in report_counts.items():
            seen_counts[key] = max(seen_counts.get(key, 0), count)

    actual_count, actual_amount, actual_quantity = conn.execute(
        "SELECT COUNT(*), SUM(amount_original), SUM(quantity) FROM sku_sales"
    ).fetchone()
    assert_close(actual_count, len(expected_rows), "SQLite SKU row count differs from source", tolerance=0)
    assert_close(
        actual_amount,
        sum(float(sale["amount_original"] or 0) for _, sale in expected_rows),
        "SQLite SKU amount does not tie to deduplicated source reports",
    )
    assert_close(
        actual_quantity,
        sum(float(sale["quantity"] or 0) for _, sale in expected_rows),
        "SQLite SKU quantity does not tie to deduplicated source reports",
    )

    source_counter = collections.Counter(
        (
            report["company"],
            sale["transaction_date"],
            sale["transaction_type"],
            sale["transaction_number"],
            sale["customer"],
            sale["brand"],
            importer.normalize_sku(sale["sku"]),
            sale["product_name"],
            round(float(sale["quantity"] or 0), 6),
            round(float(sale["amount_original"] or 0), 6),
        )
        for report, sale in expected_rows
    )
    db_counter = collections.Counter(
        (
            row[0],
            row[1],
            row[2],
            row[3],
            row[4],
            row[5],
            row[6],
            row[7],
            round(float(row[8]), 6),
            round(float(row[9]), 6),
        )
        for row in conn.execute(
            """
            SELECT c.name, s.transaction_date, s.transaction_type, s.transaction_number,
                   s.customer, s.brand, s.sku, s.product_name, s.quantity, s.amount_original
            FROM sku_sales s
            JOIN companies c ON c.id = s.company_id
            """
        )
    )
    if db_counter != source_counter:
        raise AssertionError("SQLite SKU transaction rows differ from parsed source rows")

    return {
        "reports": len(reports),
        "grand_totals": source_grand_totals,
        "transactions": len(expected_rows),
    }


def audit_fx(conn):
    checks = 0
    for company, source_currency, minimum, maximum in conn.execute(
        """
        SELECT c.name, c.source_currency,
               MIN(CASE WHEN f.amount_original != 0 THEN f.amount_hkd / f.amount_original END),
               MAX(CASE WHEN f.amount_original != 0 THEN f.amount_hkd / f.amount_original END)
        FROM facts f
        JOIN reports r ON r.id = f.report_id
        JOIN companies c ON c.id = r.company_id
        GROUP BY c.id
        """
    ):
        stored = conn.execute(
            "SELECT rate FROM fx_rates WHERE source_currency = ? AND target_currency = 'HKD'",
            (source_currency,),
        ).fetchone()
        if not stored:
            raise AssertionError(f"{company}: HKD conversion rate is missing")
        assert_close(minimum, stored[0], f"{company}: minimum applied FX rate mismatch", tolerance=0.000001)
        assert_close(maximum, stored[0], f"{company}: maximum applied FX rate mismatch", tolerance=0.000001)
        checks += 1
    return checks


def audit_cost_mappings(conn):
    expected = {
        cost["sku"]: cost
        for cost in importer.parse_mapping_files(importer.discover_mapping_files())
    }
    actual = {
        row[0]: row
        for row in conn.execute(
            """
            SELECT sku, mapped_brand, mapped_product_name, unit_cost_hkd,
                   cost_conflict, cost_variants
            FROM sku_costs
            """
        )
    }
    if set(actual) != set(expected):
        raise AssertionError("SQLite SKU cost keys differ from the mapping workbook")
    conflicts = 0
    for sku, cost in expected.items():
        row = actual[sku]
        assert_close(row[3], cost["unit_cost_hkd"], f"{sku}: mapped unit cost mismatch", tolerance=0.000001)
        if int(row[4]) != int(cost["cost_conflict"]):
            raise AssertionError(f"{sku}: cost-conflict flag mismatch")
        if row[5] != cost["cost_variants"]:
            raise AssertionError(f"{sku}: cost variants mismatch")
        if row[4]:
            conflicts += 1
            if row[3] is not None:
                raise AssertionError(f"{sku}: ambiguous cost was not withheld")
    return {"rows": len(expected), "conflicts": conflicts}


def main():
    if not importer.DB_PATH.exists():
        raise SystemExit(f"Finance database not found: {importer.DB_PATH}")
    conn = sqlite3.connect(importer.DB_PATH)
    try:
        pnl = audit_pnl_sources(conn)
        sales = audit_sales_sources(conn)
        fx_checks = audit_fx(conn)
        costs = audit_cost_mappings(conn)
    finally:
        conn.close()

    print(
        "Source finance audit passed: "
        f"{pnl['reports']} P&L reports, {pnl['source_rows']} source row totals, "
        f"{pnl['equations']} entity equations, {pnl['dimension_ties']} class/customer ties, "
        f"{sales['reports']} Sales-by-Product reports, {sales['grand_totals']} source grand totals, "
        f"{sales['transactions']:,} transaction rows, {costs['rows']:,} SKU cost mappings "
        f"({costs['conflicts']} ambiguous and withheld), and {fx_checks} company FX checks."
    )


if __name__ == "__main__":
    main()
