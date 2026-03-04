# MyStaff RRP Quick Quote Calculator — Modular Split Guide

## What Changed

The monolithic `mystaff_rrp_calculator_v13_r31.html` (7,803 lines, single file) has been split into **19 files** across a clean project structure:

```
mystaff-rrp/
├── index.html                  (2,259 lines — HTML shell only)
├── css/
│   └── styles.css              (396 lines — all CSS)
└── js/
    ├── config.js               (93 lines — Supabase config, globals, constants)
    ├── utils.js                (41 lines — fmtCurr, fmtRange, modal helpers, date/time)
    ├── formula-engine.js       (98 lines — evaluateBenefitFormula, IF/condition parser)
    ├── auth.js                 (273 lines — login, logout, hashPassword, forgot password)
    ├── app.js                  (155 lines — initializeApp, sidebar, nav, role visibility, hardware grids)
    ├── admin-users.js          (157 lines)
    ├── admin-hardware.js       (246 lines)
    ├── admin-salary.js         (236 lines)
    ├── admin-pricebooks.js     (502 lines — PB_GROUPS, pbCache, full CRUD)
    ├── calculator-ph.js        (938 lines — PH calc init, calculate(), role search, save/load)
    ├── quotes-and-ph-pdf.js   (250 lines — loadQuotes, renderQuotesTable, PH PDF)
    ├── calculator-co.js        (884 lines — CO calc, CO roles, CO save, CO PDF)
    ├── admin-benefits.js       (269 lines — market tabs, CRUD)
    ├── admin-sss.js            (351 lines — tables, snapshots, CRUD)
    ├── admin-fx.js             (278 lines — market-aware FX CRUD)
    ├── admin-hmo.js            (208 lines — market tabs, CRUD)
    └── admin-night-meals.js    (176 lines — Planet Yum multi-currency)
```

## Script Load Order (in index.html)

The `<script>` tags in `index.html` are ordered so that dependencies load first:

1. **Supabase JS** (CDN) — creates `window.supabase`
2. **EmailJS** (CDN) — for forgot password
3. **config.js** — `supabaseClient`, `currentUser`, all global caches and constants
4. **utils.js** — `fmtCurr()`, `fmtRange()`, modal helpers, date/time
5. **formula-engine.js** — `evaluateBenefitFormula()` (needed by CO calc)
6. **auth.js** — `login()`, `hashPassword()`, forgot password flow
7. **app.js** — `initializeApp()`, sidebar, nav, `checkLogin()` call
8. **admin-*.js** — each admin page module (order doesn't matter among them)
9. **calculator-ph.js** — PH calculator
10. **quotes-and-ph-pdf.js** — quotes page + PH PDF
11. **calculator-co.js** — CO calculator + CO PDF

## Important: Nothing Changed Functionally

Every function, variable, and line of code is identical to v13 r31. The split is purely structural — no logic was modified.

---

## GitHub Setup Guide (Step by Step)

### If you already have a GitHub repo for this project

Your existing repo probably has the single HTML file. Here's how to replace it with the modular version:

#### Option A: Using GitHub Web Interface (Easiest)

1. **Go to your repo** on github.com
2. **Delete the old single HTML file:**
   - Click on the file (e.g., `mystaff_rrp_calculator_v13_r31.html`)
   - Click the **trash can icon** (top right of file view)
   - Scroll down, add commit message: "Remove monolithic file — replacing with modular split"
   - Click **Commit changes**

3. **Upload the new folder structure:**
   - From your repo's main page, click **Add file → Upload files**
   - Drag the entire contents of the `mystaff-rrp` folder into the upload area:
     - `index.html`
     - `css/` folder (with `styles.css`)
     - `js/` folder (with all 16 `.js` files)
   - ⚠️ **Important:** GitHub web upload flattens folders. You may need to upload in steps:
     1. First upload `index.html` to the repo root
     2. Then create the `css` folder: Click **Add file → Create new file**, type `css/styles.css`, paste the CSS content
     3. Do the same for each JS file: `js/config.js`, `js/utils.js`, etc.

   **This is tedious for 18 files.** Option B is faster.

#### Option B: Using GitHub Desktop (Recommended)

1. **Install GitHub Desktop** if you haven't: https://desktop.github.com/
2. **Clone your repo:**
   - Open GitHub Desktop
   - Click **File → Clone Repository**
   - Select your repo from the list → Click **Clone**
   - Note the local folder path (e.g., `C:\Users\Lee\Documents\GitHub\your-repo-name`)

3. **Replace files:**
   - Open that folder in File Explorer
   - Delete the old single HTML file
   - Copy the entire `mystaff-rrp` folder contents into the repo folder:
     - `index.html` goes in the root
     - `css/` folder goes in the root
     - `js/` folder goes in the root
   - Your folder should now look like:
     ```
     your-repo-name/
     ├── index.html
     ├── css/
     │   └── styles.css
     └── js/
         ├── config.js
         ├── utils.js
         ├── ... (all 16 .js files)
     ```

4. **Commit and Push:**
   - Go back to GitHub Desktop
   - You'll see all the file changes listed
   - Type a commit message: "Modular split v13 r31 — split into 19 files"
   - Click **Commit to main**
   - Click **Push origin** (top bar)

5. **Verify on GitHub Pages:**
   - Go to your repo on github.com
   - Click **Settings → Pages**
   - Make sure Source is set to **Deploy from a branch** → **main** → **/ (root)**
   - Wait 1-2 minutes for deployment
   - Visit your GitHub Pages URL to test

### If you need a NEW repo

1. Go to https://github.com/new
2. Name it (e.g., `mystaff-rrp`)
3. Set to **Public** (since security is handled by Supabase auth)
4. Check **Add a README file**
5. Click **Create repository**
6. Follow **Option B** above to clone and add files

---

## Testing After Deployment

Test in this order — if any step fails, the issue is likely in the script load order:

1. **Login** — verifies `config.js` + `auth.js` + `app.js`
2. **Dashboard** — verifies `app.js` nav and role visibility
3. **PH Calculator** — verifies `calculator-ph.js` + `config.js` globals
4. **CO Calculator** — verifies `calculator-co.js` + `formula-engine.js`
5. **Save a PH quote** — verifies `calculator-ph.js` save flow
6. **Save a CO quote** — verifies `calculator-co.js` save flow
7. **Saved Quotes page** — verifies `quotes-and-ph-pdf.js`
8. **Generate PH PDF** — verifies `quotes-and-ph-pdf.js` PDF template
9. **Generate CO PDF** — verifies `calculator-co.js` PDF template
10. **Each admin page** (Users, Hardware, Salary, Price Books, Benefits, SSS, FX, HMO, Night Meals)

## Backup

The original single-file version (`mystaff_rrp_calculator_v13_r31_BACKUP.html`) is included in the outputs. Keep it safe — you can always fall back to it if anything goes wrong with the modular version.
