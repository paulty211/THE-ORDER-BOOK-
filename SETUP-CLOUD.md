# Turn on online registration (one-time setup, about 10 minutes)

When this is switched on, every business that registers in THE ORDER BOOK is also saved in **one online table that only you can see all of**.
Only the business profile is uploaded (business name, owner, type, phone, address, email, CAC number, Business ID).
**Customers, orders and payments never leave the phone.**

Until you finish these steps the app keeps working exactly as before (registration is saved on the phone only).

## 1. Create a free Supabase project
1. Go to https://supabase.com and sign up (free plan is enough).
2. Click **New project**. Choose a name (for example `the-order-book`), set a database password (keep it safe) and pick the region closest to your users.
3. Wait about two minutes until the project is ready.

## 2. Create the table
1. In your project, open **SQL Editor → New query**.
2. Open the file `supabase.sql` from this repository, copy everything, paste it in, and click **Run**. You should see "Success".

This creates the `businesses` table with security rules: a phone can create, read and change **only its own** registration, and cannot see anyone else's.

## 3. Allow anonymous sign-ins
Each phone quietly gets a private anonymous login so it can only touch its own row.
1. Open **Authentication → Sign In / Providers** (older dashboards: Authentication → Providers).
2. Turn **Allow anonymous sign-ins** ON and save.

## 4. Paste two values into `config.js`
1. Open **Project Settings → API** (or **API Keys**).
2. Copy the **Project URL** and the **anon / public** key.
   Do **not** use the `service_role` key anywhere in this app – it must stay secret.
3. On GitHub, open `config.js` in this repository, click the pencil icon, paste the values between the quotes, and commit.

```js
window.TOB_CLOUD = {
  url: 'https://YOUR-PROJECT.supabase.co',
  key: 'YOUR-ANON-PUBLIC-KEY'
};
```
The anon key is designed to be public; the security rules from step 2 are what protect the data.

## 5. See and export your registrations
- Open **Table Editor → businesses** to see every registered business (newest first in the `business_register` view).
- Click **Export → CSV** to download the list, for example to open in Excel.

## Good to know
- **Offline:** a business can register without data. It shows "Saved on this phone" and uploads by itself when internet returns.
- **Consent:** when online registration is on, the registration form shows a tick box so the business agrees to its details being stored online.
- **Same business twice:** if someone clears their browser data or uses a new phone, they get a new anonymous login, so a second row can appear. Check duplicates by phone number.
- **Fully private data:** the table is locked by Row Level Security. Never switch it off.
- **Updating the app:** the registration is re-uploaded whenever the business changes its details.
