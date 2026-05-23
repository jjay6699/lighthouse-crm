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

Use the dashboard upload panel in `Financial Consolidation` > `Import`. Give the upload a batch name such as `April 2026 closing pack`, set the batch period dates, then select the `.xlsx` files.

Each upload is stored as its own batch under:

```text
finance consilidation/batches/
```

The original source files in `finance consilidation/` are treated as the `Initial import` batch. Use the Batch filter in the dashboard to view one upload batch at a time or all batches together. All batches intentionally accumulate, which is useful when each upload is a separate month.

For manual file placement, create a folder inside `finance consilidation/batches/`, add a `batch.json`, place the `.xlsx` files there, then rebuild the SQLite database:

```json
{
  "name": "April 2026 closing pack",
  "uploaded_at": "2026-05-23T00:00:00.000Z",
  "period_start": "2026-04-01",
  "period_end": "2026-04-30"
}
```

```powershell
python scripts/import_finance.py
```

The expected file pattern is a QuickBooks-style Profit and Loss export by Class or by Customer. The importer reads the company name, report type, period, columns, line items, and totals from the workbook.

## Railway deploy

1. Push this folder to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Railway will use `npm start`, which runs `node server.js`.
4. Do not commit finance source files or `data/finance.sqlite`.
5. Add the login environment variables below.
6. After deployment, open the app and upload the first finance reports from the empty-state upload screen or from `Financial Consolidation` > `Import`.

## Login configuration

The app requires a login before serving the dashboard or finance APIs. Passwords are not stored in plain text. Generate a hash locally:

```powershell
npm run hash:password
```

Then set these Railway variables:

```text
CRM_USERNAME=your-login-name
CRM_PASSWORD_HASH=the-generated-pbkdf2-hash
SESSION_SECRET=a-long-random-secret
```

Generate `SESSION_SECRET` with a password manager or a command such as:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For persistent uploads across redeploys, attach a Railway volume and set:

```text
PERSIST_DIR=/data
```

The app will then store uploaded reports under `/data/finance consilidation/` and the SQLite database under `/data/data/finance.sqlite`.

## Notes

- Currency assumptions: `Moment Health Sdn Bhd = MYR`, `健康創富有限公司 = TWD`, all other companies are treated as HKD.
- The dashboard uses the Excel files as source reports and stores normalized fact rows in SQLite.
- If currency or import rules change after files are uploaded, use `Financial Consolidation` > `Import` > `Rebuild database`.
