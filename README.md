# Shakh Store

Shakh Store is a Sorani Kurdish, RTL-first multi-store marketplace built with Next.js, TypeScript, and Supabase.

## Product principles

- Customer marketplace for restaurants, supermarkets, meat and seafood, and fruits and vegetables.
- Separate, permission-aware experiences for customers, merchants, delivery captains, and administrators.
- Actual application data comes from the configured Supabase project; empty states are used instead of fabricated operational metrics.
- Supabase Row Level Security remains the authorization boundary. Client-side role checks are only for navigation and never replace server/database enforcement.
- Financial and order operations remain server/database controlled.

## Local development

1. Install Node.js 20 or later.
2. Copy \`.env.example\` to \`.env.local\`.
3. Set \`NEXT_PUBLIC_SUPABASE_URL\` and the project's publishable/anon key.
4. Install dependencies with \`npm install\`.
5. Run \`npm run dev\`.

## Validation

- \`npm run typecheck\`
- \`npm run lint\`
- \`npm run build\`

## Deployment

The production branch is \`main\`. Connect this repository to a new Vercel project after the first verified code commit. Configure the same public Supabase URL and publishable key in Vercel for Preview and Production.

Do not add service-role keys or other server secrets to \`NEXT_PUBLIC_*\` variables.


## Supabase project and migrations

The application is connected to Supabase project \`vtxntrcsjmnmbnfxhfgz\`. SQL migrations live in \`supabase/migrations\`; deployed Edge Function sources live in \`supabase/functions\`.

- Keep \`NEXT_PUBLIC_SUPABASE_URL\` and \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\` in Vercel.
- Never expose a Supabase secret/service-role key in browser code or a \`NEXT_PUBLIC_*\` variable.
- Apply migrations in ascending version order to a new environment. Do not replay the M10 migrations against a database where they are already recorded.
- The customer checkout RPC accepts only cash on delivery. Wallet settlement and commissions remain disabled until their operating rules are confirmed.
- Checkout is intentionally blocked for addresses without an active delivery zone and a configured non-distance-based fee.


## Delivery-zone operations

Administrators can manage real delivery zones at \`/dashboard/delivery-zones\`. Checkout remains disabled until at least one active city/district zone has an operator-confirmed delivery fee. Per-kilometre pricing is deliberately disabled until routing/distance calculation is implemented and verified.
