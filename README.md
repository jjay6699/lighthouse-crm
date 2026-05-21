# Lightmart CRM

Custom CRM dashboard for consolidated financial reporting across Lightmart group companies.

## What is included

- React dashboard served by a small Node app
- SQLite finance database at `data/finance.sqlite`
- Excel importer for files in `finance consilidation/`
- Financial Consolidation view with company, class/brand, customer, and P&L section filters
- Standardized HKD reporting using free no-key exchange rates from `open.er-api.com`
- The dashboard defaults to the class/brand view so the same P&L is not double-counted across class and customer report exports.

## Local run

```powershell
python scripts/import_finance.py
node server.js
```

Open `http://localhost:3000`.

## Adding new finance files

Use the dashboard upload panel in `Financial Consolidation` > `Import`. Give the upload a batch name such as `April 2026 closing pack`, then select the `.xlsx` files.

Each upload is stored as its own batch under:

```text
finance consilidation/batches/
```

The original source files in `finance consilidation/` are treated as the `Initial import` batch. Use the Batch filter in the dashboard to view one upload batch at a time or all batches together.

For manual file placement, create a folder inside `finance consilidation/batches/`, add a `batch.json`, place the `.xlsx` files there, then rebuild the SQLite database:

```powershell
python scripts/import_finance.py
```

The expected file pattern is a QuickBooks-style Profit and Loss export by Class or by Customer. The importer reads the company name, report type, period, columns, line items, and totals from the workbook.

## Railway deploy

1. Push this folder to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Railway will use `npm start`, which runs `node server.js`.
4. Keep `data/finance.sqlite` in the repo for the first deploy, or run the importer before deployment whenever the Excel files change.

## Notes

- The current currency assumption is `Moment Health Sdn Bhd = MYR`; all other companies are treated as HKD.
- The dashboard uses the Excel files as source reports and stores normalized fact rows in SQLite.
