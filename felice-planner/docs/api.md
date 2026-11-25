# API reference

The web app is the main client, but the API is plain JSON over HTTP and can be used from scripts.

* **Base path:** `/api`
* **Format:** JSON requests and responses, except the Excel upload (raw bytes) and Excel downloads.
* **Money:** amounts are in **rand** as numbers with up to two decimals (`1500.5`). They are stored internally as whole cents.
* **Periods:** months are written `YYYY-MM`. Periods are limited to 60 months, and `from` must not be after `to`.
* **Types:** the exact shapes are in [`shared/types.ts`](../shared/types.ts).

## Contents

1. [Requirements for every request](#1-requirements-for-every-request)
2. [Errors](#2-errors)
3. [Authentication](#3-authentication)
4. [Organisations](#4-organisations)
5. [Weeks](#5-weeks)
6. [Line items](#6-line-items) (including the [rider calculator](#rider-calculator) and [rider prices](#rider-prices))
7. [Recurring costs](#7-recurring-costs)
8. [Reports for one organisation](#8-reports-for-one-organisation)
9. [Import](#9-import)
   * [Import templates](#import-templates)
10. [Actual expenditure and planned vs actual](#10-actual-expenditure-and-planned-vs-actual)
11. [Master (combined) endpoints](#11-master-combined-endpoints)
12. [Cost categories](#12-cost-categories)
13. [Example session](#13-example-session)

---

## 1. Requirements for every request

| Requirement | Detail |
|---|---|
| Header `X-Requested-With: felice` | Needed on **every non-GET** request, including sign-in. Without it the answer is `403`. |
| Session cookie `fp_session` | Needed on everything except `/auth/*`. Without a valid cookie the answer is `401`. |
| `Content-Type: application/json` | For requests with a JSON body. |

## 2. Errors

Errors are returned as `{ "error": "message" }` with a status code:

| Status | Meaning |
|---|---|
| 400 | The input is invalid (message says which field), or the action is not allowed in this scope. |
| 401 | Not signed in, or the session expired. |
| 403 | The `X-Requested-With` header is missing. |
| 404 | Organisation, week, line or recurring cost not found, **or it belongs to a different organisation**. |
| 409 | The week already exists for that organisation. |
| 413 | The JSON body (over 100 kB) or upload (over 10 MB) is too large. |
| 429 | Too many failed sign-in attempts. Try again in 15 minutes. |
| 500 | Unexpected server error (details are in the server log, not in the response). |

## 3. Authentication

### `POST /api/auth/login`
Body: `{ "password": "…" }`. On success returns `{ "ok": true }` and sets the `fp_session` cookie (HttpOnly, SameSite=Strict, 12 hours).
`401` for a wrong password. `429` after 5 failures within 15 minutes from the same address.

### `POST /api/auth/logout`
Clears the cookie. Returns `{ "ok": true }`.

### `GET /api/auth/me`
Returns `{ "authenticated": true | false }`. Never returns 401.

## 4. Organisations

### `GET /api/orgs`
```json
[
  { "id": 1, "slug": "felice", "name": "Felice", "color": "#4338ca" },
  { "id": 2, "slug": "alur",   "name": "Alur",   "color": "#0f766e" }
]
```

Everything in sections 5 to 9 lives under **`/api/orgs/:org`**, where `:org` is the slug. An unknown slug answers `404 { "error": "Organisation not found" }`. Each organisation sees only its own data.

## 5. Weeks

### `GET /api/orgs/:org/weeks`
Optional query: `from`, `to` (months). Returns weeks with their totals, oldest first.

```json
[
  {
    "id": 1, "orgId": 1, "year": 2026, "month": 11, "weekNo": 1, "notes": "",
    "byCategory": { "headline": 0, "resident": 25000, "rider": 6250, "standard": 22000,
                    "physical": 0, "social": 5000, "hosts": 0, "other": 0 },
    "total": 58250, "itemCount": 7
  }
]
```

### `POST /api/orgs/:org/weeks`
Body:
```json
{ "year": 2026, "month": 11, "weekNo": 2, "notes": "", "copyRecurring": true }
```
`weekNo` is 1 to 5. With `copyRecurring: true` the organisation's recurring costs are added as lines. Returns `201` and the week with its `items`. `409` if the week already exists.

### `GET /api/orgs/:org/weeks/:id`
Returns the week with `items` (see [line item](#line-item-shape)).

### `PATCH /api/orgs/:org/weeks/:id`
Body: `{ "notes": "…" }` (up to 1000 characters). Returns the week.

### `DELETE /api/orgs/:org/weeks/:id`
Deletes the week and all its lines. Returns `204`.

## 6. Line items

### Line item shape
```json
{ "id": 12, "weekId": 1, "category": "headline", "name": "Maphorisa",
  "amount": 40000, "riderCost": 4000, "notes": "", "isDj": false, "riderItems": 0 }
```
For `headline` and `hosts`, `amount` is the **rate** and `riderCost` is required. For every other category `riderCost` is always 0 (any value sent is ignored).

`riderItems` is how many items the [rider calculator](#rider-calculator) holds for the line. `0` means the rider cost was typed in. While it is above 0, `PUT /items/:id` must send the same `riderCost` (`400` otherwise): the cost can only change in the calculator.

`isDj` is `true` for an individual [resident DJ](#resident-djs) (`category` is `resident` and `amount` is that DJ's rate), and `false` for every other line, including an older lump-sum Resident DJs line. Lines created here are never DJs: use the resident DJ endpoints for those.

### `POST /api/orgs/:org/weeks/:id/items`
Body:
```json
{ "category": "headline", "name": "Maphorisa", "amount": 40000, "riderCost": 4000, "notes": "" }
```
Returns `201` and the line. Validation:

| Field | Rule |
|---|---|
| `category` | One of the [eight categories](#12-cost-categories). |
| `name` | Required, up to 200 characters. |
| `amount` | A number from 0 to 1,000,000,000. Required for headline acts and hosts. |
| `riderCost` | **Required for headline acts and hosts** (send `0` for none). A blank value answers 400. |
| `notes` | Optional, up to 1000 characters. |

### `PUT /api/orgs/:org/items/:id`
Same body as above. Replaces the line and returns it.

### `DELETE /api/orgs/:org/items/:id`
Returns `204`.

### Rider calculator

The rider cost of a **headline act or host**, worked out from the items asked for. Saving it sets that line's `riderCost` to the total, so reports and totals need no change. The prices are stored with the rider, so later changes to the price list never alter it. Other categories answer `400 "Only headline acts and hosts have a rider"`.

#### `GET /api/orgs/:org/items/:id/rider`
```json
{ "itemId": 12, "name": "Sam Deep", "total": 2034.07,
  "lines": [ { "name": "Hennessey VSOP", "unitCost": 897, "quantity": 1, "total": 897 } ] }
```
With no items saved, `lines` is empty and `total` is the line's typed-in rider cost.

#### `PUT /api/orgs/:org/items/:id/rider`
Body: `{ "lines": [ { "name": "Hennessey VSOP", "unitCost": 897, "quantity": 1 } ] }`. Replaces the whole rider and returns `{ "item": <the line>, "rider": <as above> }`.

| Field | Rule |
|---|---|
| `lines` | A list of at most 100 items. An empty list clears the rider and sets the rider cost to 0. |
| `name` | Required, up to 200 characters. |
| `unitCost` | Required, rand including VAT, 0 to 1,000,000. |
| `quantity` | A whole number from 1 to 9999. |


#### `POST /api/orgs/:org/items/:id/rider/copy`
Body: `{ "toItemIds": [12, 13] }`. Copies the rider of line `:id` onto each of those lines, replacing the rider they had, and returns the updated lines in the order given. The items are copied with the prices they have, and a typed-in rider cost is copied as typed. The lines can be in any week of the organisation. All or nothing.

| Field | Rules |
|---|---|
| `toItemIds` | A list of 1 to 100 line ids. Each must be a headline act or host of this organisation and not the source itself. |

The source must be a headline act or host that has a rider (`400` otherwise). Unknown lines, or lines of another organisation, answer `404`.

### Rider prices

Each organisation's price list of the items a rider is made of. Names are unique per organisation, ignoring capitals (`409` otherwise).

| Request | |
|---|---|
| `GET /api/orgs/:org/rider-prices` | `[ { "id": 1, "name": "Hubbly", "cost": 25 } ]`, by name. |
| `POST /api/orgs/:org/rider-prices` | Body `{ "name", "cost" }`. Returns `201` and the item. |
| `PUT /api/orgs/:org/rider-prices/:id` | Same body. Changes the item. Riders already saved are not changed. |
| `DELETE /api/orgs/:org/rider-prices/:id` | Returns `204`. |
| `POST /api/orgs/:org/rider-prices/import?dryRun=1` | The `.xlsx` or `.csv` as the **raw body**. See below. |

The import file has an **Item** column (or Beverage, Product, Name) and a **Cost** column (or Price, optionally "incl VAT"). Every sheet is searched until one has both, so the **Sheet1** tab of the Rider Calc workbook imports as it is. New items are added, listed items get the new cost, nothing is removed, a repeated item is skipped with a warning, and an item called `0` (the workbook's blank placeholder) is ignored. Returns `{ applied, rows: [{ name, cost, status: "new"|"update"|"unchanged", currentCost }], added, updated, unchanged, warnings }`.

### Resident DJs

Individual DJs, each with a rate, linked to one week. **The week's Resident DJs cost is the sum of its DJs.** While a week has at least one DJ, its older lump-sum `resident` lines (`isDj: false`) are not counted in any total, report, top list or export. They are not deleted: if the DJs are removed they count again.

A DJ can be in a week once, whatever the capitalisation of the name (`409 "DJ A is already booked in this week"`). A DJ line stays under `resident` (`400` if `PUT /items/:id` tries to move it). Change a DJ's rate, name or notes, or remove one, with `PUT` and `DELETE /api/orgs/:org/items/:id`.

#### `POST /api/orgs/:org/weeks/:id/resident-djs`
```json
{ "name": "DJ Alpha", "rate": 3000, "notes": "" }
```
`name` is required (up to 200 characters). `rate` is required, 0 to 1,000,000,000 (`0` is allowed). Returns `201` and the line (`isDj: true`).

#### `POST /api/orgs/:org/weeks/:id/resident-djs/import?dryRun=1`
Bulk import. Send an **`.xlsx` or `.csv`** file as the raw request body (`Content-Type: application/octet-stream`, up to 2 MB, up to 200 DJs). The file needs a header row with a **Name** (or **DJ**) column and a **Rate** (or **Fee**, **Amount**) column; **Notes** is optional. A title above the header is fine. CSV can use commas, semicolons or tabs. Rates can be written `1500`, `R1 500,50` or `1,500.50`.

New DJs are added, DJs already in the week get the new rate (and notes, if given), and nobody is removed. Repeated names and unreadable rows are skipped and reported in `warnings`. All or nothing: a database error saves none.

With `dryRun=1` nothing is saved. The response is the same either way:
```json
{
  "applied": false,
  "added": 5, "updated": 1, "unchanged": 0,
  "total": 8650.5,
  "rows": [
    { "name": "DJ Alpha", "rate": 3200, "notes": "", "status": "new", "currentRate": null },
    { "name": "Standing DJ", "rate": 950, "notes": "", "status": "update", "currentRate": 900 }
  ],
  "warnings": ["Row 8 skipped: check the rate"]
}
```
`status` is `new`, `update` or `unchanged`. `400` for a file with no header, no DJs, or that cannot be read.

#### `GET /api/orgs/:org/weeks/:id/payment-schedule`
The week's DJs in name order, in **batches of 5** for a bulk payment. Only DJ rates are included; rider costs are separate lines.
```json
{
  "weekId": 1, "label": "November 2026 W1", "batchSize": 5, "count": 6, "total": 9700.5,
  "batches": [
    { "batchNo": 1, "total": 8700.5, "payments": [{ "no": 1, "name": "DJ Alpha", "amount": 3200, "notes": "" }] },
    { "batchNo": 2, "total": 1000, "payments": [{ "no": 6, "name": "DJ Foxtrot", "amount": 1000, "notes": "" }] }
  ]
}
```
A week with no DJs returns `count: 0` and no batches. `no` runs across the whole schedule.

#### `GET /api/orgs/:org/weeks/:id/payment-schedule.xlsx`
The same schedule as an Excel file: one block per batch with a batch total, a grand total, and an empty **Paid** column. `400` if the week has no resident DJs.

## 7. Recurring costs

The standing costs added to every new week when `copyRecurring` is true. Editing them changes **new weeks only**.

### `GET /api/orgs/:org/recurring`
Returns lines in the same shape as a line item (without `weekId`).

### `POST /api/orgs/:org/recurring` · `PUT /api/orgs/:org/recurring/:id` · `DELETE /api/orgs/:org/recurring/:id`
Same body and validation as line items. Only categories that can recur are accepted; `headline` and `other` answer `400 "That category cannot be a recurring cost"`.

### `POST /api/orgs/:org/recurring/resident-djs` · `POST /api/orgs/:org/recurring/resident-djs/import?dryRun=1`
Standing resident DJs, with the same bodies, file format and responses as the [week endpoints](#resident-djs). They are copied into every new week as that week's own DJs (`isDj: true`), which can then be changed, removed or added to without touching the list. A DJ can be in the list once (`409`).

## 8. Reports for one organisation

All take `from` and `to` (`YYYY-MM`, required).

### `GET /api/orgs/:org/reports/summary?from=…&to=…&groupBy=month|week`
`groupBy` defaults to `month`. Months with no data are included as empty rows.

```json
{
  "from": "2026-01", "to": "2026-12", "groupBy": "month",
  "rows": [
    { "key": "2026-11", "label": "Nov 2026", "year": 2026, "month": 11, "weekNo": null, "weekId": null,
      "weeks": 2, "total": 117000,
      "byCategory": { "headline": 0, "…": 0 },
      "byOrg": { "felice": 117000 } }
  ],
  "totals": {
    "byCategory": { "…": 0 }, "total": 117000, "weeks": 2,
    "byOrg": { "felice": { "byCategory": { "…": 0 }, "total": 117000, "weeks": 2 } }
  }
}
```

### `GET /api/orgs/:org/reports/top?from=…&to=…&category=headline&limit=10`
Spend by name (case-insensitive), highest first. `limit` is 1 to 100.
```json
[ { "name": "Maphorisa", "total": 80000, "riderTotal": 4000, "count": 2 } ]
```
`total` is the sum of rates (or costs); `riderTotal` is the sum of rider costs.

### `GET /api/orgs/:org/reports/resident-bookings?from=…&to=…`
How many times each resident DJ was booked in each month. **One booking is one week a DJ is on.** Names are matched without regard to capitalisation. Lump-sum Resident DJs lines have no names and are not counted. Most booked first, then by name.
```json
{
  "from": "2026-11", "to": "2026-12",
  "months": [{ "key": "2026-11", "label": "Nov 2026" }, { "key": "2026-12", "label": "Dec 2026" }],
  "rows": [
    { "name": "Zed", "bookings": 4, "paid": 5006,
      "byMonth": { "2026-11": { "bookings": 3, "paid": 3006 }, "2026-12": { "bookings": 1, "paid": 2000 } } }
  ],
  "totals": { "bookings": 4, "paid": 5006, "byMonth": { "2026-11": { "bookings": 3, "paid": 3006 } } }
}
```
`paid` is the DJ's rates added up. Months with no booking are left out of `byMonth`.

### `GET /api/orgs/:org/reports/compare?mode=month&a=2026-05&b=2026-06`
### `GET /api/orgs/:org/reports/compare?mode=week&a=<weekId>&b=<weekId>`
Returns two sides to compare:
```json
{
  "mode": "month",
  "a": { "key": "2026-05", "label": "May 2026", "weeks": 5, "total": 916623.88,
         "byCategory": { "…": 0 },
         "headliners": [ { "name": "Act", "amount": 20000, "riderCost": 1000, "week": "May 2026 W1" } ] },
  "b": { "…": "same shape" }
}
```

### `GET /api/orgs/:org/reports/export.xlsx?from=…&to=…&groupBy=month|week`
Downloads an Excel file: a **Summary** sheet (period rows, categories, totals) and a **Line Items** sheet (one row per line, importable again). A **Resident DJ** column holds `Yes` for individual resident DJs, so importing the file again keeps them as DJs. A lump-sum Resident DJs line that is not being counted (because the week has DJs) is left out, so the file adds up to the report.

## 9. Import

### `POST /api/orgs/:org/import?year=2026&dryRun=1`
Send the `.xlsx` file as the **raw request body** (`Content-Type: application/octet-stream`). Maximum 10 MB.

| Query | Meaning |
|---|---|
| `year` | Used for the original planner layout only (it has no year). Defaults to the current year. |
| `dryRun` | `1` previews without saving. Anything else imports. |

Returns:
```json
{
  "format": "planner",
  "applied": false,
  "weeks": [ { "year": 2026, "month": 4, "weekNo": 1, "label": "Apr 2026 W1",
               "itemCount": 7, "total": 58250, "exists": false } ],
  "warnings": [ "Apr 2026 W1: planner TOTALS says R 52 000,00, the lines add up to R 58 250,00 …" ]
}
```
`format` is `"planner"` (original layout) or `"flat"` (the app's export). Importing a week **replaces** that week's lines. The whole import succeeds or fails together.

A combined export contains an `Organisation` column. When importing into one organisation, rows for other organisations are skipped and a warning gives the count.

### Import templates

Example files for every import. Each is generated on request, needs a signed-in session, and is read by the matching importer without warnings.

#### `GET /api/templates`
```json
[ { "id": "planned-weeks", "file": "planned-weeks-template.xlsx", "title": "Planned weeks (Excel)", "description": "…" } ]
```

#### `GET /api/templates/:id`
Downloads the file (`Content-Disposition: attachment`). `404` for an unknown id.

| `id` | File | Use it with |
|---|---|---|
| `planned-weeks` | `planned-weeks-template.xlsx` | [`POST /orgs/:org/import`](#post-apiorgsorgimportyear2026dryrun1): one row per cost line, the same format the app exports |
| `planner-layout` | `planner-layout-template.xlsx` | The same endpoint: the layout of the original Weekly Planner (months and WEEK columns across the top) |
| `resident-djs` | `resident-djs-template.xlsx` | `POST /orgs/:org/weeks/:id/resident-djs/import` and `POST /orgs/:org/recurring/resident-djs/import` |
| `resident-djs-csv` | `resident-djs-template.csv` | The same two endpoints, as CSV |
| `rider-prices` | `rider-prices-template.xlsx` | `POST /orgs/:org/rider-prices/import` |
| `actual-expenditure` | `actual-expenditure-template.xlsx` | [`POST /orgs/:org/actuals/sheets`](#post-apiorgsorgactualssheets) and `…/actuals/import`: two example weekly tabs |

Every workbook template has a **READ ME** sheet that explains its columns.

## 10. Actual expenditure and planned vs actual

Actuals come from the weekly expense workbook. **One tab is one week**, and **only each section's subtotal is read**: the individual lines are never stored or compared. Actuals live in their own tables, so the plan can never change because of an import.

The sections of the sheet are compared with the plan in six **cost groups**:

| Group key | Label | Sheet section | Planned categories |
|---|---|---|---|
| `headline` | Headline Acts | HEADLINERS | `headline` |
| `resident` | Resident DJs | LOCAL DJ's | `resident` |
| `hosts` | Hosts & Promoters | HOSTS | `hosts` |
| `rider` | Rider Costs | RIDERS | `rider` |
| `standard` | Standard Costs | RESIDENTS, BOTTLE GIRLS | `standard` |
| `marketing` | Marketing & other | Miscellenious | `social` + `physical` + `other` |

A section with a heading that is not recognised is compared as `marketing`, with a warning.

### `POST /api/orgs/:org/actuals/sheets`
Send the `.xlsx` as the **raw request body** (maximum 10 MB). Lists the tabs so one can be chosen.
```json
{ "sheets": [ { "name": "29-05", "total": 217962.96, "sections": 7 } ], "suggested": "27-02" }
```
A tab with `total` 0 (for example `SUMMARY`) is empty or is not a weekly tab. `suggested` is the last tab that has data.

### `POST /api/orgs/:org/actuals/import?sheet=27-02&year=2026&month=7&weekNo=5`
Send the `.xlsx` as the raw body.

| Query | Meaning |
|---|---|
| `sheet` | The tab to read. `400` if the workbook has no such tab. |
| `year`, `month`, `weekNo` | The planned week the tab belongs to (`weekNo` 1 to 5). |
| `adjust` | Optional JSON object of section heading → amount in rand, replacing the sheet's figure. Used to take another company's costs out of the shared Miscellaneous section. The sheet's own figure is kept and the week is marked `adjusted`. |
| `dryRun` | `1` previews without saving. |

Returns:
```json
{
  "applied": true, "tab": "27-02", "year": 2026, "month": 7, "weekNo": 5,
  "total": 204418.16, "paid": 0,
  "byGroup": { "headline": 78000, "resident": 26000, "hosts": 29700, "rider": 44618.16, "standard": 23600, "marketing": 2500 },
  "sections": [ { "heading": "Miscellenious", "group": "marketing", "sheetAmount": 5000, "amount": 2500 } ],
  "planned": { "total": 194307.5, "byGroup": { "…": 0 } },
  "replaces": true, "adjusted": true,
  "warnings": []
}
```
`planned` is `null` when the week has no plan (a warning says so and the plan counts as 0). `replaces` is `true` when actuals for that week were imported before: importing again **replaces** them. Warnings also cover a section with no usable subtotal (its amounts are added up instead) and a tab total (cell D3) that disagrees with the section subtotals. A workbook that cannot be read, or a tab with no section totals, gives `400` with a clear message.

### `GET /api/orgs/:org/actuals?from=…&to=…`
The imported weeks, oldest first. Each has `id`, `year`, `month`, `weekNo`, `label` (the tab), `byGroup`, `total`, `paid` and `adjusted`. Without `from` and `to`, every imported week.

### `GET /api/orgs/:org/actuals/:id`
One imported week with its `sections` (`heading`, `group`, `amount`, `sheetAmount`, `paid`).

### `DELETE /api/orgs/:org/actuals/:id`
Removes the imported actuals of that week. The plan is untouched. Returns `204`.

### `GET /api/orgs/:org/reports/variance?from=…&to=…&groupBy=month|week`
Planned against actual. The response holds `planned` and `actual` and leaves the subtraction to you: **variance is actual minus planned**, so a positive figure is an overspend.
```json
{
  "from": "2026-07", "to": "2026-07", "groupBy": "month",
  "rows": [ { "key": "2026-07", "label": "Jul 2026", "year": 2026, "month": 7, "weekNo": null,
              "weeksPlanned": 5, "weeksCompared": 4, "weeksUnplanned": 0,
              "plannedAll": 944157.92, "planned": 745016.11, "actual": 816153.03, "paid": 0,
              "byGroup": { "headline": { "planned": 319500, "actual": 314500 } },
              "byOrg": { "felice": { "planned": 745016.11, "actual": 816153.03 } } } ],
  "totals": { "…": "the same fields as a row, without key, label, year, month and weekNo" }
}
```
**Only weeks that have actuals are compared**, so a week that has not happened yet never looks under budget. `planned` is the plan for those same weeks; `plannedAll` is the whole plan for the period, for context. A week with actuals but no plan counts against a plan of 0 and is counted in `weeksUnplanned`.

## 11. Master (combined) endpoints

These read across **all organisations** and are read-only. Every response includes the per-organisation breakdown, keyed by slug.

### `GET /api/master/summary?from=…&to=…&groupBy=month|week`
Same shape as the single-organisation summary, with `byOrg` filled in for every organisation. In the `week` view, the same week number in both companies is one row.

### `GET /api/master/top?from=…&to=…&category=…&limit=…`
Top spend by name across both companies.

### `GET /api/master/resident-bookings?from=…&to=…`
Resident DJ bookings per month across both companies, in the [same shape](#get-apiorgsorgreportsresident-bookingsfromto) as a single company's. A DJ booked by both companies in the same week counts as two bookings.

### `GET /api/master/compare?mode=org&a=felice&b=alur&from=…&to=…`
Compares two organisations over a period. `a` and `b` are slugs. `404` for an unknown slug.

### `GET /api/master/compare?mode=month&a=2026-05&b=2026-06`
Compares two combined months.

### `GET /api/master/export.xlsx?from=…&to=…&groupBy=month|week`
Combined Excel report. The Summary sheet has a total column per organisation, and the Line Items sheet has an Organisation column.

### `GET /api/master/variance?from=…&to=…&groupBy=month|week`
Planned against actual for both companies, in the [same shape](#get-apiorgsorgreportsvariancefromtogroupbymonthweek) as a single company's, with `byOrg` filled in for every organisation. Only organisations with actuals in a week are compared for that week. There is no import route here: actuals are imported into one company at a time.

## 12. Cost categories

| Key | Label | Can recur | Needs rider cost |
|---|---|:-:|:-:|
| `headline` | Headline Acts | no | **yes** |
| `resident` | Resident DJs | yes | no |
| `rider` | Rider Costs | yes | no |
| `standard` | Standard Costs | yes | no |
| `physical` | Physical Marketing | yes | no |
| `social` | Social Media | yes | no |
| `hosts` | Hosts & Promoters | yes | **yes** |
| `other` | Other | no | no |

In reports, rider costs entered on headline acts and hosts are added to the **`rider`** category, and every line's total is rate plus rider cost.

## 13. Example session

```bash
BASE=http://127.0.0.1:4000/api
H='X-Requested-With: felice'

# sign in and keep the cookie
curl -s -c jar -X POST -H "$H" -H 'Content-Type: application/json' \
     -d '{"password":"YOUR_PASSWORD"}' $BASE/auth/login

# add an Alur week with its recurring costs
curl -s -b jar -X POST -H "$H" -H 'Content-Type: application/json' \
     -d '{"year":2026,"month":12,"weekNo":1,"copyRecurring":true}' $BASE/orgs/alur/weeks

# add a headline act (rate and rider cost are both required)
curl -s -b jar -X POST -H "$H" -H 'Content-Type: application/json' \
     -d '{"category":"headline","name":"Maphorisa","amount":40000,"riderCost":4000}' \
     $BASE/orgs/alur/weeks/1/items

# combined monthly report for 2026
curl -s -b jar "$BASE/master/summary?from=2026-01&to=2026-12&groupBy=month"
```
