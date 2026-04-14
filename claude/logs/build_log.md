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

❌ 2026-04-12: Failure - Missing Supabase environment variables during build prerendering

Same error as previous days - build fails during static generation because pages require Supabase client initialization but environment variables are not available in CI environment. All pages affected during prerendering phase.

❌ 2026-04-13: Failure - Missing Supabase environment variables during build prerendering

Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!

Build fails during static generation on all pages that initialize Supabase client:
- /_not-found, /dashboard, /forgot-password, /login, /onboarding, /, /pitchside, /reset-password, /signup, /staff

Root cause: Environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) not available in CI build environment. This is a configuration issue affecting auth system - not a trivial fix.

❌ 2026-04-14: Failure - Missing Supabase environment variables during build prerendering

Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!

Same ongoing issue - build fails during static generation phase. All pages that initialize Supabase client fail during prerendering:
- /_not-found, /dashboard, /forgot-password, /login, /onboarding, /, /pitchside, /reset-password, /signup, /staff

Environment configuration issue persists in CI environment. This touches auth infrastructure and is beyond trivial fix scope.