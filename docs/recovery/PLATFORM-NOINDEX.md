# Platform noindex / Git hosting preparation

D4 metadata/header configuration is prepared only; no site, Vercel project, DNS, API or database setting was changed. The built HTML carries robots noindex,nofollow and vercel.json applies X-Robots-Tag: noindex, nofollow to every response path. robots.txt allows crawling so a crawler can see noindex. These controls are indexing preferences, not authentication or RLS.

Vercel is configured to build from Git with npm run build into dist and provide the SPA index fallback for platform navigation. Link this branch/project and review a preview only after the corresponding plan gate. Actual response headers and unknown-route behavior must be checked on that preview; this source change does not prove deployed header behavior. Platform content still depends on the live RLS baseline/proposals. No public secret or client-side role guard is treated as data protection.

The preserved source's 20 ESLint errors/three warnings remain documented and must be reviewed before release. This small metadata/config patch does not silently fix or suppress them. No public visual layout changes were introduced.
