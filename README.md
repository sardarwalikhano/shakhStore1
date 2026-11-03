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
