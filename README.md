# TNN Platform

Project management platform for The News Network.

---

## Setup (do this once)

### 1. Create a Supabase project
1. Go to https://supabase.com and create a free account
2. Click "New Project" — name it `tnn-platform`
3. Pick a region close to you, set a database password, wait ~2 min for it to spin up

### 2. Run the database schema
1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open `supabase/schema.sql` from this folder, copy the entire contents, paste it in, and click **Run**
4. You should see "Success" — this creates all 5 tables with the right permissions

### 3. Get your API keys
1. In Supabase, go to **Project Settings → API**
2. Copy **Project URL** and **anon public** key

### 4. Create your .env file
In the root of this project, create a file called `.env`:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SITE_URL=http://platform.bthstnn.org
```
(Never commit this file — it's already in .gitignore)

### 5. Install and run locally
```bash
npm install
npm run dev
```
Open http://localhost:5173/

### 6. Make the first exec account
1. Sign up at the login page with your email
2. In Supabase, go to **Table Editor → profiles**
3. Find your row and change `role` from `member` to `admin`
4. Refresh the app — you now have exec access

---

## Deploying to the custom domain

### First time setup
1. Create a GitHub repo named `tnn-platform`
2. Point the custom domain at your static host and configure it as `platform.bthstnn.org`
3. In Supabase Auth settings, add these redirect URLs:
```
http://platform.bthstnn.org/login
http://platform.bthstnn.org/reset-password
```
4. Set the Supabase Edge Function secrets for Slack notifications:
```
SITE_URL=http://platform.bthstnn.org
ALLOWED_ORIGINS=http://platform.bthstnn.org
```
5. Push your code:
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/tnn-platform.git
git push -u origin main
```

### Deploy
```bash
npm run deploy
```
This builds the app and pushes to the `gh-pages` branch automatically.
Your app will be live at: `http://platform.bthstnn.org/`

### Re-deploying after changes
Just run `npm run deploy` again anytime you make changes.

### Add Supabase env vars to GitHub (for CI)
If you want GitHub Actions to deploy, add your env vars in:
**GitHub repo → Settings → Secrets and variables → Actions**

---

## Project structure

```
src/
  lib/
    supabase.js      ← Supabase client (uses .env vars)
    constants.js     ← Priorities, statuses, roles, departments
  context/
    AuthContext.jsx  ← Auth state, login/logout, profile
  components/
    layout/
      AppLayout.jsx  ← Sidebar + main content wrapper
      Sidebar.jsx    ← Navigation sidebar
    ui/
      Badge.jsx      ← Priority, status, department badges
      Modal.jsx      ← Reusable modal dialog
      PageHeader.jsx ← Page title + actions row
      Spinner.jsx    ← Loading spinner
  pages/
    Login.jsx           ← Sign in / sign up
    Dashboard.jsx       ← Role-aware home
    Segments.jsx        ← Segments list with filters
    SegmentDetail.jsx   ← Full segment view (tabs: overview, subtasks, roles, notes)
    Tasks.jsx           ← Standalone tasks
    Views.jsx           ← Gantt / Kanban / Table (exec only)
    Members.jsx         ← Member management (exec only)
    Settings.jsx        ← Org settings (exec only)
    Notifications.jsx   ← Notifications
  App.jsx    ← Router + auth protection
  main.jsx   ← Entry point
supabase/
  schema.sql   ← Run this in Supabase SQL editor
```

---

## Adding a new member

Members sign up themselves at the login page. By default they get `member` role.
To promote someone to exec, go to **Supabase → Table Editor → profiles** and change their role to `exec`.
