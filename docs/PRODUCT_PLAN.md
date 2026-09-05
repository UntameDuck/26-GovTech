# GovTech Public Website Platform - Product Plan v0.1

## 1. Product Positioning

This is not a spam detection tool and not another custom website agency.

It is a public-sector website building, deployment, and operations platform. The first target market is school websites, because schools have repeated website needs, fragmented outsourcing structures, public communication obligations, accessibility requirements, and visible spam/security pain.

Core sentence:

> A K-PaaS-based public website platform where schools and public institutions can create, deploy, govern, and continuously maintain compliant websites without repeated custom outsourcing.

## 2. Reference Models

### Korea Public Sector Baseline

- KRDS: Use as the primary UI/UX design baseline for Korean public digital services. It provides design principles, design resources, tokens, and HTML component kits for consistency, accessibility, and usability.
- Digital Government Service UI/UX Guideline: Treat its service patterns and component guidance as platform policy presets, not optional documentation.
- E-government website quality management guidance: Use as a compliance checklist for accessibility, usability, openness, reliability, and quality management.
- KWCAG 2.2: Use as the accessibility acceptance standard.
- K-PaaS: Use as the deployment target and policy-aligned cloud foundation.

### International Product References

- Cloud.gov Pages: The strongest conceptual reference. It packages secure public-sector website deployment, preview, approval, compliance support, scaling, and reduced infrastructure burden.
- GOV.UK Design System and USWDS: Reference for reusable government components, patterns, plain-language service design, and accessibility-by-default.
- LocalGov Drupal: Reference for shared open-source public-sector publishing modules and reusable local government website patterns.
- Wagtail CMS: Reference for editor-friendly content management, workflow, permissions, accessibility tooling, and multisite support.
- Webflow Enterprise: Reference for visual site editing, collaboration, audit logs, SSO, enterprise governance, and managed hosting.
- WordPress Multisite: Reference for the multisite network pattern, but not necessarily the implementation choice.

## 3. Proposed Program Shape

Build as a multi-tenant public website platform with four surfaces:

1. Site Factory
   - Create a new school/public site from a governed template.
   - Select institution type, region/education office, identity, domain, modules, and approval workflow.
   - Generate deployable site configuration in minutes.

2. Drag-and-Drop Module Builder
   - Build a real drag-and-drop editor, but limit the draggable units to governed school/public-site modules.
   - This should feel closer to "arrange approved public website blocks" than a fully freeform Webflow/Figma canvas.
   - Use structured blocks: hero, quick links, notice tabs, board list, gallery, calendar, meal menu, popup zone, banner collection, document list, FAQ, staff/contact, map/location, external service link, emergency notice.
   - Each block is KRDS/KWCAG-compliant by default and exposes only safe configuration fields.

3. Migration Studio
   - Import legacy board data, attachments, menu trees, and URLs.
   - Normalize to the platform schema.
   - Run spam, malware-link, privacy exposure, broken-link, and attachment checks during migration.
   - Produce a migration report that is useful for judging/demo.

4. Education Office Operations Dashboard
   - View all schools/sites in one screen.
   - Show compliance score, update status, spam/security events, traffic anomalies, unpublished approvals, accessibility scan status, and outdated content.
   - Convert scattered site-level incidents into cross-school patterns.

## 4. MVP Boundary

For the competition prototype, avoid building a full Webflow clone.

MVP should prove the platform thesis with a thin but complete vertical slice:

1. Import sample legacy school data from CSV/JSON.
2. Clean and normalize the data.
3. Create a school site from a template.
4. Edit the homepage by dragging school modules into layout slots.
5. Preview the site.
6. Deploy/publish a generated static or server-rendered site.
7. Show the education-office dashboard with multiple schools and cross-school spam/security patterns.

This demonstrates the full loop: migrate -> build -> publish -> monitor.

## 4.1 Reference-Site Module Findings

The first builder module set should be selected from real school websites, not invented from scratch.

Reference websites checked:

- Daejeon Daeshin High School: https://www.dshs.kr/
- Daejeon Donghwa Middle School: https://djdhms.djsch.kr/main.do

Repeated homepage/content modules found:

- Header and global navigation
- School identity hero/main visual
- Search box
- Login/sitemap/top utility links
- Quick-link cards
- Notice board
- Tabbed notice board such as notice + parent letters
- Gallery/photo board
- Academic calendar/schedule
- Popup zone
- Banner collection
- Meal/food menu
- School introduction/static info pages
- Map/location page
- Information disclosure boards
- Civil complaint/request pages
- External public-service links

MVP drag-and-drop builder should support only these module families first.

Recommended MVP editing model:

1. Left panel: module library.
2. Center canvas: homepage preview with fixed responsive layout regions.
3. Right panel: selected module settings.
4. Top bar: preview, accessibility check, save draft, request approval, publish.
5. Dashboard link: return to education-office/site operations console.

Important constraint:

The user can drag modules, reorder sections, switch approved variants, and edit content/settings. The user should not freely edit arbitrary CSS, HTML, script, or plugin code.

## 5. Architecture Direction

### High-Level Components

- Frontend app: Admin console, builder, migration studio, operations dashboard, site preview.
- API server: Auth, tenant/site management, module config, content APIs, migration jobs, scan results.
- Content store: Institutions, sites, pages, blocks, boards, posts, attachments, redirects, audit logs.
- Migration worker: Legacy parsers, file import, normalization, spam/privacy checks.
- Site renderer: Generates public-facing websites from templates and content schemas.
- Publish pipeline: Preview builds, approval, production deployment, domain binding, rollback.
- Observability/security service: Event collection, anomaly detection, compliance scans, dashboard metrics.

### Deployment Model

- Local prototype: Single app with mock tenants and simulated deployment.
- Production direction: Kubernetes/K-PaaS-ready services.
- Static-first public sites where possible, with dynamic APIs only for boards/search/admin. This reduces attack surface and makes public pages easier to cache and scale.
- Tenant isolation by institution/education office, with clear RBAC and audit logs.
- K-PaaS deployment direction: Package the builder/admin app, renderer, API, worker, and object/database dependencies as containerized workloads. Deploy through Kubernetes manifests/Helm-compatible descriptions or K-PaaS pipeline/source-control services where available.
- Public school sites can be published as generated static assets plus API-backed dynamic modules, or as a server-rendered site renderer behind Ingress.

### Suggested Stack for Prototype

- Next.js or Remix for admin console and site rendering.
- PostgreSQL for content and tenant data.
- Object storage-compatible layer for attachments.
- Background jobs with BullMQ/Redis or a lightweight worker queue.
- Playwright for visual/regression testing.
- axe/pa11y-style accessibility scans.
- Containerized deployment path so the K-PaaS story is credible.

## 6. Core Data Model

- EducationOffice: region, policies, approved templates, dashboard scope.
- Institution: school/public institution metadata.
- Site: domain, theme, template, status, deployment history.
- User: role, institution, permissions.
- Page: slug, title, blocks, publication state.
- Block: type, schema, content, accessibility metadata.
- Board: category, policy, moderation settings.
- Post: title, body, author, attachments, moderation status.
- Attachment: file metadata, scan status, privacy flags.
- MigrationJob: source, parser, mapping, progress, report.
- SecurityEvent: spam pattern, suspicious link, account event, affected sites.
- ComplianceCheck: accessibility, quality, security headers, broken links.
- Redirect: legacy URL to new URL mapping.
- AuditLog: who changed what and when.

## 7. Product Design Direction

The interface should feel like a reliable public operations console, not a marketing SaaS page.

Tone:

- calm
- accountable
- work-focused

Design principles:

1. Make compliance visible without making teachers feel like security experts.
2. Prefer guided configuration over freeform design freedom.
3. Make every site action traceable: preview, approve, publish, rollback.
4. Show the education office the whole fleet, while showing each school only its own manageable tasks.
5. Treat migration as a cleaning and verification process, not only data import.

Primary screens:

- Education office dashboard
- Site factory wizard
- School site editor
- Drag-and-drop homepage builder
- Module library
- Migration studio
- Scan/compliance report
- Public school site preview

## 7.1 Web or App Definition

This should be defined as a web-based SaaS/platform, not a native desktop/mobile app.

There are two web surfaces:

1. Builder/Admin Web App
   - Used by education offices, school administrators, and teachers after login.
   - Includes the drag-and-drop builder, content management, migration studio, approval workflow, dashboard, and deployment controls.

2. Generated Public Websites
   - Used by students, parents, teachers, and citizens.
   - Generated from approved templates/modules and served as public school or institution websites.

Mobile app is not part of the MVP.

Mobile/responsive support is required for the generated public websites and the admin app, but the core product is a browser-based web platform.

## 8. Development Phases

### Phase 1: Concept Prototype

- Build sample data model.
- Implement 3-5 school modules.
- Create one public site template.
- Build migration import from CSV/JSON.
- Show dashboard with simulated multi-school patterns.

### Phase 2: Credible Technical Prototype

- Add auth/RBAC.
- Add real persistence.
- Add preview/publish states.
- Add audit logs.
- Add accessibility/security scan checks.
- Add redirect mapping for migrated URLs.

### Phase 3: K-PaaS-Ready Demonstrator

- Containerize services.
- Prepare Kubernetes manifests or Helm chart.
- Show tenant separation.
- Add mock CI/CD pipeline.
- Document K-PaaS deployment architecture.

## 9. Risks and Design Responses

- "Existing education-office integrated homepage services already exist."
  - Response: This platform is not only an education-office homepage package. It is a reusable public website factory, deployment pipeline, governance layer, migration system, and fleet operations dashboard.

- "A site builder is too broad."
  - Response: MVP is structured modules and templates, not full freeform design.

- "Security monitoring overlaps with existing control centers."
  - Response: This handles the web operations/content layer and exports useful signals to existing monitoring structures.

- "Schools cannot migrate old content cleanly."
  - Response: Migration Studio creates reusable parsers for common legacy board systems and turns migration into spam/privacy cleanup.

- "Public institutions need design individuality."
  - Response: Use governed themes and approved modules. Allow identity within policy boundaries.

## 10. Next Decisions

1. Competition track: idea planning or product/service development.
2. First demo scenario: school-only or school plus generic public institution.
3. MVP stack: Next.js full-stack, separate API, or static-first generator.
4. Naming direction: public utility/platform name, not security-only name.
5. Required evidence: which Korean public guidelines and education-office service comparisons to cite in the pitch.

## 11. Useful References

- K-PaaS: https://k-paas.or.kr/eng/
- K-PaaS container platform releases: https://github.com/K-PaaS/container-platform/releases
- KRDS: https://www.krds.go.kr/
- KRDS UI/UX guideline introduction: https://www.krds.go.kr/html/site/utility/utility_07.html
- MOIS public web/app UI/UX innovation: https://www.mois.go.kr/frt/sub/a06/b04/uixInnovation/screen.do
- MOIS Digital Government Service UI/UX Guideline 2025.08 notice: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000045&nttId=120220
- MOIS E-government website quality management guide 2025 notice: https://www.mois.go.kr/frt/bbs/type013/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000006&nttId=118639
- MOIS E-government website quality management instruction 2025 notice: https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000016&nttId=118636
- RRA KWCAG 2.2 reference entry: https://www.rra.go.kr/
- Cloud.gov Pages: https://cloud.gov/pages/
- Cloud.gov Pages docs overview: https://docs.cloud.gov/pages/overview/
- GOV.UK Design System: https://design-system.service.gov.uk/
- U.S. Web Design System accessibility: https://designsystem.digital.gov/documentation/accessibility/
- LocalGov Drupal FAQ: https://localgovdrupal.org/about-us/building-shared-open-source-publishing-platform-local-government-localgov-drupal-faqs
- Wagtail for Education: https://wagtail.org/education/
- Webflow Enterprise: https://webflow.com/enterprise
- WordPress Multisite docs: https://developer.wordpress.org/advanced-administration/multisite/create-network/
- OWASP Top 10: https://owasp.org/Top10/
- KISA software security guidance: https://www.kisa.or.kr/2060204/form?page=1&postSeq=9
