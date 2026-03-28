# SOTG Salon - Deployment Guide

## Step 1: Create Supabase Project

1. Go to https://supabase.com and create a free account
2. Click "New Project"
3. Name it "sotg-salon", set a database password, choose a region (Singapore recommended for PH)
4. Wait for the project to provision

## Step 2: Set Up Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Open the file `supabase/migrations/001_schema.sql` from this repo
3. Copy the entire contents and paste into the SQL Editor
4. Click **Run** to create all tables, policies, and seed data

## Step 3: Create Admin User

1. In Supabase dashboard, go to **Authentication** > **Users**
2. Click **Add User** > **Create New User**
3. Email: `admin@sotg.local`
4. Password: (choose a strong password)
5. Click **Create User** and note the user ID
6. Go to **SQL Editor** and run:
```sql
INSERT INTO profiles (id, display_name, role)
VALUES ('PASTE_USER_ID_HERE', 'admin', 'admin');
```
7. To create stylist users, repeat with email like `jet@sotg.local` and role `'stylist'`

## Step 4: Get Supabase Credentials

1. Go to **Project Settings** > **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (the long `eyJ...` string)

## Step 5: Deploy to Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New** > **Project**
3. Import the `sotg-salon` repository
4. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**

## Step 6: Configure Supabase Auth

1. In Supabase dashboard, go to **Authentication** > **URL Configuration**
2. Set **Site URL** to your Vercel deployment URL (e.g., `https://sotg-salon.vercel.app`)
3. Add the Vercel URL to **Redirect URLs**

## Usage

- **Customer Check-In**: Visit `/check-in` (or scan QR code)
- **Staff Login**: Visit `/login`, enter name (e.g., "admin") and password
- **Stylist Dashboard**: `/dashboard` - manage daily queue, expenses, attendance
- **Admin Panel**: `/admin` - income statement, payroll, cash flow, forecasting, import, settings

## Login Format
- Login uses **name only** (not email). Enter just the name part.
- Example: Enter "admin" (not "admin@sotg.local")
