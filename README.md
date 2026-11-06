# Shakh Store

Shakh Store is a Sorani Kurdish, RTL-first multi-store marketplace built with Next.js 16, React 19, TypeScript, and Supabase.

## Product scope

- Customer marketplace for restaurants, supermarkets, meat and seafood, and fruits and vegetables.
- Customer accounts, password recovery, address book, persistent cart, and cash-on-delivery checkout.
- Merchant onboarding with an administrator review workflow.
- Role-aware dashboards for customers, merchants, delivery captains, admins, and super admins.
- Delivery-zone administration with city/district coverage and IQD fees.
- Real Supabase data only. Empty states are used instead of fabricated operational metrics.

## Security principles

- Supabase Row Level Security is the authorization boundary; client-side role checks only control navigation and presentation.
- Authorization roles are read from trusted Supabase Auth app metadata, not user-editable metadata.
- Order creation, fee calculation, product prices, inventory checks, and stock updates are performed by database-side logic.
- The public application uses only the Supabase publishable key. Never expose a service-role or secret key in browser code or a `NEXT_PUBLIC_*` variable.
- HTTP security headers are configured globally: MIME sniffing and framing are blocked, referrer exposure is limited, and camera/microphone permissions are disabled by default.
- HSTS is added only in production responses. A Content Security Policy is intentionally not enabled until the complete set of Supabase, image, and asset origins has been audited, to avoid breaking authentication or media loading.
- Checkout currently supports cash on delivery only. Wallet settlement, payment integrations, and commission settlement remain disabled until their operational rules are confirmed.

## Local development

1. Use Node.js 22.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Install dependencies with `npm ci`.
5. Start the app with `npm run dev`.

## Validation commands

- `npm run typecheck`
- `npm test` (Node.js built-in test runner; no extra test dependency)
- `npm run lint`
- `npm audit --omit=dev --audit-level=high`
- `npm run build`

GitHub Actions runs install, production dependency audit, TypeScript, domain-rule unit tests, ESLint, and production build checks for pushes and pull requests to `main`.

## Supabase project and migrations

The application is connected to Supabase project `vtxntrcsjmnmbnfxhfgz`.

- SQL migration sources live in `supabase/migrations` and are named with the exact versions recorded in the remote migration history.
- Apply migrations in ascending version order in a new environment. Do not replay migrations that are already recorded on a linked project.
- Before pushing schema changes, inspect the linked migration history and review the generated SQL.
- Deployed Edge Function sources live in `supabase/functions`; JWT verification is enabled for the role-management and merchant-review functions.
- Regenerate `lib/database.types.ts` after schema changes and commit it with the matching migration.
- Migration `m13_serialize_default_address_updates` serializes default-address changes per customer to avoid concurrent writes racing the unique default-address index.
- Migration `m14_restrict_customer_address_write_columns` limits direct customer writes to address details; default/active state remains server-controlled, and the insert policy enforces active, non-default creation.
- Do not run `supabase db reset --linked` against production. It is destructive.

## Delivery-zone operations

Administrators manage delivery zones at `/dashboard/delivery-zones`. A zone with a blank district applies to all districts within the exact city value. Customer and merchant address forms must use the same city spelling stored in the zone configuration.

The first confirmed coverage entry is:

| City | District | Delivery fee | Status |
| --- | --- | ---: | --- |
| بەردەڕەش | All districts | 1,000 IQD | Active |

The fee is a flat non-distance-based fee. Per-kilometre pricing remains disabled until a distance calculation service is implemented and verified. Checkout rejects addresses outside active coverage.

## Merchant operations

Customers can submit store applications at `/merchant/apply`. Admins and super admins review them at `/dashboard/merchant-applications`. The review Edge Function performs trusted role assignment and records the review through the database workflow. A merchant cannot assign their own role.

## Deployment

The production project is `shakh-store1` on Vercel. The production hostname is `shakh-store1.vercel.app`. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production, Preview, and Development. Preview-only access protection may be enabled independently of Production.


## Authentication setup

The Shakh Store production domains are `https://daim-post.online` and `https://www.daim-post.online`; the Vercel fallback domain is `https://shakh-store1.vercel.app`.

### Supabase Auth URL configuration

Set the Auth **Site URL** to `https://daim-post.online`. Add these application callback URLs to the Redirect URLs allow list:

- `https://daim-post.online/auth/callback`
- `https://www.daim-post.online/auth/callback`
- `https://shakh-store1.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback` (local development only)

Do not add wildcard domains. Keep the app callback path exact. The callback exchanges the PKCE code for a Supabase session and validates the `next` destination as an in-app path to prevent open redirects.

### Google OAuth

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add authorized JavaScript origins for the production domains and the Vercel fallback domain. Add `http://localhost:3000` only while developing locally.
3. In Google Cloud **Authorized redirect URIs**, add the Supabase callback shown on the Supabase Authentication > Providers > Google page. For this project, the standard callback is `https://vtxntrcsjmnmbnfxhfgz.supabase.co/auth/v1/callback`; confirm the exact URL shown in the dashboard.
4. Enable Google in Supabase Authentication > Providers and paste the Google Client ID and Client Secret there. Never commit the Client Secret to Git or expose it as a `NEXT_PUBLIC_*` variable.

The app's own post-login callback is `/auth/callback`; this is distinct from Google's redirect URI, which points to Supabase Auth.

### Resend SMTP for Supabase Auth

Use a dedicated Resend API key with **sending access only**, restricted to the verified sending domain. In Supabase Authentication > SMTP Settings configure:

| Setting | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) |
| Username | `resend` |
| Password | Dedicated Resend sending API key |
| Sender address | `no-reply@mail.daim-post.online` |
| Sender name | `Shakh Store` |

Keep email confirmation enabled. Keep Resend click/open tracking disabled for authentication messages so reset and confirmation links are not rewritten. The current Resend domain has verified DKIM and sending SPF records; its failed MX record is for inbound receiving and is not required for outbound SMTP sending.

Use the Supabase **Reset Password** email template with a link using `{{ .ConfirmationURL }}`. The app requests a redirect to `/auth/callback`, then sends the user to `/reset-password?mode=update` after the PKCE session is established.


## Order and delivery operations

- The customer order list reads order headers under the existing participant RLS policy.
- Merchant accounts read only their own `order_stores` rows and linked order numbers.
- Captains have a dedicated `/dashboard/deliveries` read-only queue. Its RLS scope exposes only assignments where `captain_user_id = auth.uid()`; admin roles can audit all assignments.
- The captain view exposes the delivery address snapshot and contact details only for assignments visible under the participant policy.
- Merchant order transitions are: `placed → accepted → preparing → ready_for_pickup`. Only the owning merchant can advance its own store-order row.
- Admins and super admins can list verified, non-banned accounts with trusted Auth `app_metadata.role = captain`, then assign one only after the store-order is ready for pickup. The directory is exposed through an admin-checked RPC; it does not expose the Auth user list to customers or merchants.
- Captains can advance only their own assignment: `assigned → accepted → picked_up → on_the_way → delivered`. Pickup requires the merchant's ready-for-pickup state.
- Every transition is checked and written in a database-side SECURITY DEFINER RPC with ownership/role checks and an append-only order status event. Parent order status is recalculated from its store-order rows.
- Checkout now snapshots the active merchant commission rule on each order item. The default rule is 350 IQD per kg; commission is capped at the line value and excluded for non-weighted items under a per-kg rule.
- Captains can confirm COD only after their own delivery assignment reaches `delivered`. The database calculates each store consignment's share of the order-level delivery fee, validates the exact cash amount, and posts a balanced, idempotent wallet ledger transaction.
- COD cash collection debits a dedicated debit-normal `cash_clearing` account; merchant net proceeds, captain delivery earnings, and platform commission are credited separately. Existing `escrow` accounts for post-share rewards remain supported and are not reclassified.
- The order is marked paid only after every delivery assignment has a recorded COD collection. Multi-store delivery-fee rounding remainder is assigned to the final consignment.
- `/dashboard/wallets` provides role-scoped wallet balances and ledger history. Admin roles can also inspect active commission rules; this page is read-only.
- Customer cancellation is available only for the complete COD order and only before any delivery assignment is picked up. The database RPC locks the order and all consignments, rejects pickup/delivery/COD collection, restores finite product stock atomically, cancels every store-order and delivery assignment, and appends status events. It does not create a refund or wallet ledger entry.
- Refunds after pickup or COD collection, merchant payouts, and cash remittance reconciliation remain disabled pending separately approved business rules. COD collection records receipt and accrues wallet balances; it does not itself transfer physical cash or trigger a bank payout.


## Customer order tracking

- Customers can open a private order detail page from `/dashboard/orders`.
- The page reads the order header, store-level statuses, delivery assignments, and status-event timeline using the authenticated Supabase session.
- Existing participant RLS policies scope all four reads to the signed-in customer's own orders. No service-role access or new database write privileges are used.
- The timeline intentionally displays status, actor category, and timestamp only; it does not expose internal actor IDs or operational notes.
- Delivery tracking is status-based. Live GPS tracking is not enabled until a verified location-update workflow and consent/privacy requirements are in place.
