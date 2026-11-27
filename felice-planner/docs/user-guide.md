# User guide

How to use **Alur & Felice Planner** to plan weekly costs, keep recurring costs up to date, and report on Felice, Alur, or both together.

## Contents

1. [Signing in](#1-signing-in)
2. [Finding your way around](#2-finding-your-way-around)
3. [Weekly planner](#3-weekly-planner)
4. [Recurring costs](#4-recurring-costs)
   * [Rider prices and the rider calculator](#rider-prices-and-the-rider-calculator)
5. [Dashboard](#5-dashboard)
6. [Reports](#6-reports)
7. [Compare](#7-compare)
8. [Plan vs actual](#8-plan-vs-actual)
9. [Import and export](#9-import-and-export)
10. [Master view (both companies)](#10-master-view-both-companies)
11. [Common tasks](#11-common-tasks)
12. [Good to know](#12-good-to-know)

---

## 1. Signing in

Open the app (for local use: <http://localhost:5173/> while it is running with `npm run dev`). Enter the password and press **Sign in**. The password is the `APP_PASSWORD` value in `server/.env`.

* You stay signed in for 12 hours, then you are asked to sign in again.
* After 5 wrong attempts you must wait 15 minutes.
* **Sign out** is at the bottom of the left menu.

## 2. Finding your way around

The left menu has two parts.

**Choose where you are working** (top of the menu):

| Choice | What it opens |
|---|---|
| **All organisations** | The master view: Felice and Alur combined, read-only. |
| **Felice** (logo) | Felice's own planner and reports. |
| **Alur** (logo) | Alur's own planner and reports. |

The choice you are in is highlighted. A logo next to each page heading tells you which company's data you are looking at.

**Pages** (below that):

| Inside Felice or Alur | Inside All organisations |
|---|---|
| Dashboard | Master dashboard |
| Weekly planner | Combined reports |
| Recurring costs | Plan vs actual |
| Rider prices | Compare |
| Reports | |
| Plan vs actual | |
| Compare | |
| Import & export | |

Each company's data is completely separate. Changing a figure in Felice never changes Alur.

On a narrow screen the menu moves to the top of the page.

## 3. Weekly planner

Choose **Felice** or **Alur**, then **Weekly planner**. Use it to record what each week costs.

### Adding a week
1. In the box on the left, check the year (change it with the **Year** list).
2. Under **Add a week to 20xx**, choose the **Month** and the **Week** number (1 to 5).
3. Leave **Add the recurring costs** ticked to start the week with your standing costs (see [section 4](#4-recurring-costs)). Untick it for an empty week.
4. Press **Add week**.

If that week already exists, the button is disabled and a note says so.

### Editing a week
Pick a week from the list. You see its total at the top and a section for each cost category. **Click any name, amount or note, change it, and click away: it saves automatically.** To remove a line, press **✕** next to it.

To add a line, use the form at the bottom of the category: fill in the fields and press **Add**.

| Category | What to enter |
|---|---|
| Headline Acts | **Name, Rate and Rider cost.** All three are required. |
| Hosts & Promoters | **Name, Rate and Rider cost.** All three are required. |
| Resident DJs | **Name and Rate** for each DJ, one line per DJ. See [Resident DJs](#resident-djs). |
| Rider Costs, Standard Costs, Physical Marketing, Social Media, Other | Name and Amount. |

### Resident DJs

Each week lists its resident DJs one by one, each with a **Rate**. **The Resident DJs cost is the total of those rates**, so it always matches the DJs you can see. The week total, the dashboard and every report follow from it.

**Add a DJ by hand.** In the Resident DJs box, type the **Name** and **Rate** and press **Add**. To change a rate or a name, click it, change it and click away. Press **✕** to remove a DJ from the week. A DJ can be in a week once (names are compared without regard to capital letters); if a DJ plays two nights in one week, enter one line with the combined rate.

**Import many DJs at once.** Under the DJs, use **Import resident DJs from a file**, which also offers a template with examples (**Excel** or **CSV**) to start from:
1. Prepare an Excel (.xlsx) or CSV file. The top row needs a **Name** column and a **Rate** column (**Fee** or **Amount** also work). **Notes** is optional. Rates can be written `1500`, `R1 500,50` or `1,500.50`.
2. Choose the file and press **Preview**. You see every DJ with what will happen: **Added**, **Updated** (with the rate they have now) or **No change**. Rows that cannot be read, and names that appear twice in the file, are listed under *things to check* and are skipped.
3. Press **Import**. New DJs are added and DJs already in the week get the new rate. **Nobody is removed.**

**If the week already has a lump-sum "Resident DJs" amount.** Older weeks have one line for all the DJs together. As soon as you add individual DJs, that line **stops counting**, so the cost is never counted twice. It stays in a box called *Lump-sum Resident DJs line*, struck through and marked *Not counted*, so you can see it. Remove it when you no longer need it. If you remove all the individual DJs, the lump sum counts again.

**Pay the DJs in batches.** Under the DJs, the **Payment schedule** lists the week's DJs by name in **batches of 5**, with a total for each batch and a grand total to pay. Press **Download .xlsx** for a file you can send on: one block per batch, with the totals and an empty **Paid** column to tick off. The schedule is built from the week as it is now, so it always matches. It covers the DJ rates only; riders are separate lines.

**Standing DJs.** DJs you book most weeks can also go on the [Recurring costs](#4-recurring-costs) page. They are added to each new week as that week's own DJs, which you can then remove, add to or re-rate for that week without changing the standing list.

### Rate and rider cost
For a headline act or a host, enter their **Rate** (fee) and their **Rider cost** (drinks, food and so on). If there is no rider, type **0**. Each line shows its own total (rate plus rider). The section heading shows *Rate + Rider = total*.

Rider costs from acts and hosts are included in **Rider Costs** in every report, so you do not add them a second time. Use the **Rider Costs** section for other riders, such as the resident DJs'.

To work the rider cost out from the drinks and items actually asked for, use the **Calculate** button under the rider cost: see [Rider prices and the rider calculator](#rider-prices-and-the-rider-calculator).

### Week notes and deleting
* **Week notes** is a free-text box for reminders about that week.
* **Delete week** removes the week and all its lines. You are asked to confirm, and it cannot be undone.

### Suggestions
Some name fields suggest common names as you type (for example MC, Graphics, Photographer, Bottle Girls, Instagram). You can type anything you like.

## 4. Recurring costs

Choose **Recurring costs** inside Felice or Alur. This is each company's list of **standing costs**, such as resident DJs, MC, photographer and social media. They are added to every new week when you leave **Add the recurring costs** ticked.

* Edit them exactly like lines in a week: click, change, click away.
* Resident DJs work the same way as in a week: add each DJ with a rate, or import a list. Each DJ is added to new weeks as that week's own DJ (see [Resident DJs](#resident-djs)).
* The page shows the total added to each new week.
* **Changes affect new weeks only.** Weeks you have already created keep their own figures, so old reports never change by accident. To change an existing week, edit it in the planner.
* Headline Acts and Other cannot be recurring, because they differ every week.

### Rider prices and the rider calculator

A headline act or host usually asks for a rider: bottles, mixers, water, food. Instead of adding it up by hand, keep a **price list** and let the calculator total the rider.

**The price list.** Choose **Rider prices** inside Felice or Alur. It lists each item with its cost **including VAT**. Add an item with **Add**, change a name or cost by clicking it and clicking away, and remove one with **✕**. Each company has its own list.

To load many items at once, use **Import price list**: choose an Excel (.xlsx) or CSV file with an **Item** column (or **Beverage**) and a **Cost** column, then **Preview** and **Import**. New items are added, items already listed get the new cost, and nobody is removed. The **Sheet1** tab of the Rider Calc workbook imports as it is. A **template** with examples is linked on the page.

**Choosing the rider while adding.** In the add row of Headline Acts or Hosts & Promoters, press **Choose rider items** under the rider cost, pick items from the price list with how many, and press **Use these items**. The rider cost fills in from the items, and they are saved with the booking when you press **Add**. If you skip this, type a rider cost as before.

**Working out a rider afterwards.** On the Weekly planner, press **Calculate** under the rider cost of an existing headline act or host:
1. Choose an item (its cost fills in), say **how many**, and press **Add item**. Adding the same item again adds to its quantity.
2. An item that is not in the list can be typed in with its own cost.
3. The **rider cost** at the bottom is the total. Press **Save rider cost**.

The booking's rider cost is now that total, and it appears under **Rider Costs** in every report, as before. The button then reads *Rider: 4 items*; press it to see or change the items. While a rider is calculated, the rider cost box cannot be typed over, so the figure always matches its items. **Clear items** then **Save** sets the rider cost to R0,00, after which it can be typed again.

**Copying a rider to another act or host.** When a headline act or host has a rider, a **Copy rider** button appears under its rider cost. Press it, tick the other headline acts and hosts in the same week that should have the same rider, and press **Copy rider**. The items and the rider cost are copied. A booking that already had a rider has it **replaced**, and the list says which ones. A typed-in rider cost is copied as typed.

A rider **keeps the prices it was worked out with**. Changing the price list never changes a week you have already done. Recurring hosts are copied into new weeks with their rider cost, not their items.

## 5. Dashboard

Choose **Dashboard** inside Felice or Alur for an at-a-glance picture.

**Choosing the period.** Use the buttons **3 months**, **6 months**, **12 months** or **Year to date**, or set **From** and **To** months yourself. The dashboard opens on the last 12 months.

You see:
* **Key figures:** total spend, average per week, average per active month, busiest month and largest cost.
* **Monthly spend by category** (stacked bars), **Category split** (donut) and **Weekly totals** (line).
* **Top headline acts** and **Top hosts & promoters**, showing how often they were booked, their rate, rider cost and total.

If there is no data in the period, the page tells you and links to the planner and to import.

## 6. Reports

Choose **Reports** inside Felice or Alur.

1. Pick the period.
2. Choose **By month** or **By week**.
3. Read the chart and the **Breakdown** table: each row shows every category and the total, with a grand total and each category's share at the bottom.
4. Under the table, **Top spend by name** ranks acts, hosts, or anything in the category you pick from the list.
5. **Resident DJ bookings per month** shows each resident DJ down the page and each month of the period across it, with how many times they were booked. **One booking is one week a DJ is on**, so a DJ on four weeks of a month shows 4. The last columns give each DJ's total bookings and what their rates came to, and the bottom row totals each month. DJs are listed most booked first. Only DJs entered individually appear; an older lump-sum line has no names to count. The combined reports show the same table for both companies together.
6. **Export to Excel** downloads the same report.

In the by-week view, click a week's name to open it in the planner. Months with nothing planned appear greyed out.

## 7. Compare

Choose **Compare** inside Felice or Alur.

* **Month vs month:** pick two months.
* **Week vs week:** pick two weeks.

You get a table of every category side by side with the difference and the percentage change (▲ up, ▼ down), a chart, and the headline acts booked on each side. For months it also shows the number of weeks and the average per week.

## 8. Plan vs actual

This compares what you **planned** with what was **actually spent**. The actuals come from the weekly expense workbook, and **only section totals are compared, never the individual lines**.

### Importing a week's actuals

Do this at the end of each week.

1. Choose **Import & export** inside Felice or Alur, and find **Import actual expenditure** (or press **Import this week's actuals** on the Plan vs actual page). If you are not sure how the workbook should look, download the **expense workbook template**: two example weekly tabs and a READ ME tab.
2. Choose the expense workbook (.xlsx). Its tabs are listed. **One tab is one week.** The last tab with figures is pre-selected.
3. Check **Month**, **Year** and **Week**. The **Week** follows the tab's position: the **first weekly tab is week 1, the second is week 2**, and so on up to week 5. A tab with nothing to import (such as READ ME) is not counted. **Month** and **Year** are suggested as the first planned week after the latest week that already has actuals. Pick another tab and the week changes with it; you can still change any of them by hand.
4. Press **Preview**. You see each section's total from the sheet, a table of planned against actual for that week, and anything to check. Nothing is saved yet.
5. If the sheet's **Miscellaneous** section includes costs that belong to the other company, type the amount that belongs here in the **Amount to import** box. The comparison updates and the week is marked *adjusted*. The sheet's own figure is remembered.
6. Press **Import** (or **Replace** if that week was imported before).

Importing the same week again **replaces** it, so a mistake is easy to put right. **✕** in the *Imported actuals* list removes a week's actuals; the plan is not touched.

### What is compared

Each section total is compared with the plan in one of six cost groups:

| Cost group | Sheet section | Planned from |
|---|---|---|
| Headline Acts | HEADLINERS | Headline Acts |
| Resident DJs | LOCAL DJ's | Resident DJs |
| Hosts & Promoters | HOSTS | Hosts & Promoters |
| Rider Costs | RIDERS | Rider Costs |
| Standard Costs | RESIDENTS, BOTTLE GIRLS | Standard Costs |
| Marketing & other | Miscellenious | Physical Marketing + Social Media + Other |

The sheet reports marketing and other costs together as Miscellaneous, which is why those three planned categories are added up here.

### Reading the page

Choose **Plan vs actual** inside Felice or Alur, pick the period and **By month** or **By week**. You see the planned, actual and variance totals, a chart, and a table by month (or week) and by cost group.

* **Variance is actual minus planned.** ▲ with red text means **over plan** (overspent). ▼ with green text means **under plan**. The words *over plan* and *under plan* are always shown too, with the percentage.
* **Only weeks that have actuals are compared.** A week that has not happened yet never looks under budget. The *Weeks compared* column says how many weeks are in each row, and *Whole plan for the period* shows everything planned, for context.
* A week with actuals but **no plan** is compared against R0 and flagged.
* **Paid** shows what the sheet says has been paid. If the sheet's paid column is empty, it is R0 and the actual is shown as outstanding.

The **Dashboard** has a *Plan vs actual* card with the same three figures and a chart; **Full report** opens this page.

## 9. Import and export

Choose **Import & export** inside Felice or Alur.

### Importing
Use this to bring in the original planner spreadsheet, or a file you exported earlier.

1. Choose the **Excel file (.xlsx)**.
2. If it is the original planner layout (months across the top), set **Year**, because that layout has no year.
3. Press **Preview**. You see each week found, how many lines and its total, whether it already exists and will be **replaced**, and a list of **things to check**.
4. If it looks right, press **Import**.

**Templates.** Under the file box, **planned weeks (Excel)** downloads a ready-to-fill file with example rows (shaded), drop-down lists for the month, category and Resident DJ columns, and a READ ME sheet. **The original planner layout (Excel)** is the same data laid out like the old Weekly Planner. Replace the examples with your own, **delete the example rows you do not need** (every week in the file replaces that week), then Preview.

Good to know:
* Importing a week **replaces** that week's lines.
* The preview warns when the spreadsheet's own TOTALS row disagrees with the sum of its lines, so you can see where the old sheet's totals were wrong.
* Files exported from the combined (master) view contain both companies. When you import one into Felice, only Felice's rows come in, and the preview says how many rows were skipped.

### Exporting
Choose the period and **By month** or **By week**, then **Download .xlsx**. The file has a **Summary** sheet and a **Line Items** sheet with every line, which can be imported again.

## 10. Master view (both companies)

Choose **All organisations**. The master view is for reading and reporting only; to change a figure, open that company first.

### Master dashboard
* **Combined spend** and a tile for each company with its share and its number of weeks.
* **Monthly spend by organisation**, **Monthly spend by category (combined)** and **Weekly totals** with a line for each company and a dashed combined line.
* **By organisation** table: weeks, total, average per week, share and largest cost, with a combined row.
* **Top headline acts** and **Top hosts & promoters** across both companies.

### Combined reports
* Pick the period and **By month** or **By week**.
* **Category by organisation** shows each category for Felice, Alur and combined, with each category's share.
* **Breakdown** shows each period with a column per company, per category, and the combined total. In the by-week view, the same week number from both companies is one row.
* **Export combined report to Excel** downloads the combined summary and every line, with an **Organisation** column.

### Plan vs actual
**Plan vs actual** adds both companies together, with a table by organisation, then the same month and cost-group tables as a single company (see [section 8](#8-plan-vs-actual)). Actuals are imported into one company at a time, so the master view cannot import. The master dashboard has the same summary card.

### Compare
* **Organisation vs organisation:** Felice against Alur over a period you choose, category by category.
* **Month vs month (combined):** both companies added together for one month against another.

### Backup and restore
Choose **Backup & restore** at the bottom of the sidebar (it is on every page). It covers **both companies**.

* **Download backup** saves everything in one file: weeks and cost lines, riders and rider prices, recurring costs and imported actuals. Do this before importing a spreadsheet or deleting weeks, and at the end of each week. Keep the file somewhere other than this computer too.
* **Restore from a backup**: choose a backup file. It is checked and shown next to what is there now (weeks, cost lines, recurring costs, rider prices, actual weeks and the latest week for each company). Nothing changes until you press **Restore this backup** and confirm.
* Restoring **replaces everything** for both companies with what is in the file. What was there is **saved first** as a file in the planner's `server/backups` folder, named `before-restore-…`, and the page tells you its name. To undo a restore, restore that file.
* A file that is not a planner backup, or is damaged, is refused and nothing changes.

## 11. Common tasks

| I want to… | Do this |
|---|---|
| Start a new week | Company → Weekly planner → pick month and week → leave "Add the recurring costs" ticked → Add week. |
| Record a headline act | Open the week → Headline Acts → Name, Rate, Rider cost → Add. |
| Change what every new week starts with | Company → Recurring costs → edit the line. |
| Fix one week's recurring figure | Open that week in the planner and edit the line there. |
| See last year's spending | Reports or Dashboard → set From and To, or press **12 months**. |
| Compare this month with last month | Company → Compare → Month vs month. |
| See Felice and Alur together | All organisations → Master dashboard. |
| Compare the two companies | All organisations → Compare → Organisation vs organisation. |
| Send a report to someone | Reports (or Combined reports) → Export to Excel. |
| Load the old spreadsheet | Company → Import & export → choose file → set Year → Preview → Import. |
| Work out an act's or host's rider | Company → Weekly planner → the week → press Calculate under the rider cost → choose items → Save rider cost. |
| Load the rider price list | Company → Rider prices → Import price list (or add items one by one). |
| Add a resident DJ to a week | Company → Weekly planner → pick the week → Resident DJs → Name and Rate → Add. |
| Add many resident DJs at once | The week → Import resident DJs from a file → choose file → Preview → Import. |
| Start an import from a template | Company → Import & export (or the week's Resident DJs box) → the template link on the import card. |
| Back up everything / restore a backup | Sidebar → Backup & restore → Download backup, or choose a file under Restore from a backup. |
| Import the week's actual spend | Company → Import & export → Import actual expenditure → choose workbook → pick the tab → Preview → Import. |
| See if I am over or under plan | Company (or All organisations) → Plan vs actual. |
| Pay the week's resident DJs | The week → Payment schedule → Download .xlsx (batches of 5). |
| See how often each DJ was booked | Company → Reports → Resident DJ bookings per month. |

## 12. Good to know

* **Everything saves as you go.** There is no Save button for existing lines: change a value, then click away or press Tab. In the "add a line" forms, press **Add** (or Enter).
* **Totals are always calculated.** You never type a total.
* **Amounts are in rand.** Use a full stop for cents (for example `1500.50`).
* **Both companies use the same cost categories.**
* **One shared password** opens both companies. Anyone who can sign in can see and edit both.
* **Every import has a template with examples.** They are linked from the import cards (planned weeks, resident DJs, actual expenditure). The files contain example names, so replace them before importing.
* **Back up regularly.** See the [operations guide](operations.md#5-backups).
