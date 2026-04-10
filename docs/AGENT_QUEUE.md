# Agent Queue

A shared inbox between Josh and the Claude integrator agents. Drop tasks here anytime; agents pick them up on next run. Agents append questions and proposals here for Josh.

## How to use

**Josh adds work:** append a task under "## Inbox" using the template below. Agents pick from top of Inbox on next scheduled run.

**Agents add questions/proposals:** append under "## Needs Josh" or under a dated proposal section.

## Task template

```
### <short title>
- **Why:** one sentence on why this matters now
- **Definition of done:** clear, checkable outcome
- **Constraints:** files to touch / not touch, max time, anything risky
- **Owner:** agent / josh / either
```

---

## Inbox

_(empty — drop tasks here)_

---

## Needs Josh

### Nightly build failing - Missing Supabase environment variables
- **Issue:** Build fails during static page generation because Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are not available in CI environment
- **Impact:** All pages that initialize Supabase clients fail to prerender, causing build to fail
- **Category:** Non-trivial infrastructure issue (touches auth/data layer)
- **Next step:** Configure environment variables in GitHub Actions workflow or adjust build configuration to handle missing env vars gracefully
- **Detected:** 2026-04-10 nightly build

---

## Done (last 14 days)

_(empty — agents move completed items here with a date)_
