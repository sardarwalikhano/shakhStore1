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
