# StixAnalytix Roadmap

## Known Technical Debt

1. **Large single-file components** -- dashboard/page.jsx (2500+ lines) and pitchside/page.jsx (1400+ lines) should be split into smaller components
2. **No TypeScript** -- entire codebase is JavaScript
3. **No tests** -- no unit, integration, or e2e tests
4. **No staging environment** -- pushes to main go directly to production
5. **Inline styles everywhere** -- no CSS modules, Tailwind, or styled-components
6. **Multiple clubs per coach** -- the data model allows it but the UI doesn't have a club selector
7. **No error boundaries** -- React errors crash the whole page with a generic Next.js error screen

## Future Considerations

- Add a club selector if coaches need to manage multiple clubs
- Add error boundaries to prevent full-page crashes
- Consider splitting large page components into smaller, focused modules
- Add a staging/preview environment for safer deployments
- Add basic test coverage for critical paths (auth, match saving)
