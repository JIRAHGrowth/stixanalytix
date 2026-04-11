# Build Log

Nightly build results. Each entry includes date, status, and any relevant details.

## Format
- ✅ YYYY-MM-DD: Success
- ❌ YYYY-MM-DD: Failure - [cause/details]

---

## Entries

❌ 2026-04-11: Failure - Missing Supabase environment variables during build prerendering
❌ 2026-04-10: Failure - Missing Supabase environment variables during build prerendering

Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!

Affects all pages that use Supabase during static generation:
- /dashboard/page: /dashboard
- /staff/page: /staff  
- /_not-found/page: /_not-found
- /login/page: /login
- /onboarding/page: /onboarding
- /page: /
- /pitchside/page: /pitchside
- /forgot-password/page: /forgot-password
- /reset-password/page: /reset-password
- /signup/page: /signup

Build process requires environment variables for prerendering but .env.local is not present in CI environment.