# Karnataka Surveyor Taluk Admin

Local web app for maintaining Karnataka licensed surveyor data at admin and taluk levels.

## Start

```powershell
npm start
```

Open `http://localhost:3000`.

## Workflow

1. Admin signs in.
2. Admin opens **Taluk Team** and creates a login for a taluk data team.
3. Admin assigns district and taluk to that team.
4. Taluk user signs in and can add or update only records for the assigned taluk.
5. District President signs in and can view all member data and taluk team logins for the assigned district.
6. Admin can view, add, edit, and delete records across all districts and taluks.

## Data

The import script reads:

`C:\Users\suraj\Downloads\LS_Karnataka_Report (1).xlsx`

Imported data is stored in:

`data\db.json`

To re-import from the Excel file:

```powershell
& 'C:\Users\suraj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/import_excel.py
```

Re-importing replaces `data\db.json`, so export or back it up first if you have made manual edits.

## PostgreSQL

For live hosting, use PostgreSQL instead of `data\db.json`.

1. Create a PostgreSQL database.
2. Set `DATABASE_URL`.
3. Import the current local JSON data into PostgreSQL.
4. Start the app.

PowerShell example:

```powershell
$env:DATABASE_URL="postgres://username:password@host:5432/karnataka_surveyors"
$env:PGSSLMODE="disable"
npm run import:pg
npm start
```

For Render, Railway, or other hosted PostgreSQL providers, copy their database connection string into the `DATABASE_URL` environment variable. Most hosted databases need SSL, so leave `PGSSLMODE` unset unless your provider says SSL should be disabled.

When `DATABASE_URL` is set, the app creates the required PostgreSQL tables automatically and reads/writes all users and member records from PostgreSQL. When `DATABASE_URL` is not set, it uses the local JSON file for development.

Do not upload `data\db.json` to a public GitHub repository because it contains member data. It is ignored by Git.

## Taluk Master

The app uses a fixed Karnataka master list of 239 taluks across 31 districts for dashboards, member filters, and taluk-team assignment dropdowns. This prevents messy Excel values, alternate spellings, Kannada/English variants, and address-like text from becoming separate taluk options.

After importing data into PostgreSQL, run this once to standardize clear taluk spelling variants:

```powershell
$env:DATABASE_URL="postgres://username:password@host:5432/karnataka_surveyors"
$env:PGSSLMODE="disable"
npm run normalize:taluks
```

Rows that cannot be confidently matched are left unchanged for manual correction.

## District President Logins

Create or update one District President login for each of the 31 districts:

```powershell
$env:DISTRICT_PRESIDENT_PASSWORD="set-a-strong-password"
npm run seed:district-presidents
```

On Linux/VPS:

```bash
DISTRICT_PRESIDENT_PASSWORD='set-a-strong-password' npm run seed:district-presidents
```

Username format is `president_<district_name>`, for example `president_tumakuru`. District President accounts are view-only and can see their district member data plus taluk technical team logins for that district.
