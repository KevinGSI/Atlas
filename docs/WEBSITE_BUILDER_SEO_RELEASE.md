# Atlas Website Builder: SEO and release contract

## Purpose

Atlas Website Builder turns a firm-approved site configuration into a fast, crawlable public website. The first template is an original criminal-defense authority site informed by the architecture described in `musca_law_seo_reverse_engineering.docx`: substantive practice pages, fewer but deeper location pages, educational guides, attorney identity, internal links, and clear consultation paths.

The template does not copy another firm's text, visual design, testimonials, results, awards, or factual claims. All bundled identities and contact details are fictional and the preview is explicitly marked as a demonstration.

## Search architecture from inception

Every public page is rendered as complete HTML on the server. Its primary content, title, description, canonical URL, headings, links, author, review date, and structured data are present without requiring a crawler to execute application JavaScript.

The coded page model supports:

- one canonical HTTPS URL per page;
- unique titles, descriptions, headings, target queries, authors, and review dates;
- a home hub connected to practice-area, location, guide, attorney, and contact pages;
- visible breadcrumbs plus `BreadcrumbList` structured data;
- organization and `LegalService` identity data that matches visible content;
- sitemap and robots generation;
- responsive, accessible navigation and semantic page structure;
- no third-party font, tracker, or image dependency in the base template;
- attorney-reviewed, people-first content instead of automatically generated keyword variants.

Google explains that server-side or pre-rendered HTML helps users and crawlers, recommends unique titles and descriptions, favors helpful people-first content, and recommends canonical URLs and sitemaps. Relevant current primary guidance:

- <https://developers.google.com/search/docs/fundamentals/seo-starter-guide>
- <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- <https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics>
- <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>
- <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>
- <https://developers.google.com/search/docs/appearance/structured-data/breadcrumb>
- <https://developers.google.com/search/docs/appearance/structured-data/organization>
- <https://developers.google.com/search/docs/appearance/structured-data/local-business>

Following these practices does not guarantee ranking or indexing.

## Canonical Atlas integration

A saved site is one firm-scoped canonical `website_site` object. Saving or updating it uses the standard Atlas object, event, audit, search, intelligence-job, and workspace isolation contracts. A proposed launch becomes a child `website_release_candidate` object with an immutable snapshot hash and remains `pending_review`.

Website Builder does not maintain a second AI memory or publish through a private page-only channel. Later website leads, calls, forms, and campaign events must enter the same canonical event and conflicts pipeline as the rest of Atlas.

## Mandatory release gate

Preview and release-candidate output remains `noindex, nofollow, noarchive`. The preview `robots.txt` also disallows crawling. Atlas blocks release-candidate preparation until all coded checks pass:

1. Replace the fictional firm name, example domain, demonstration email, and 555 telephone number.
2. Verify the attorney identity, credentials, licensing jurisdictions, authorship, and review ownership.
3. Verify the office address, telephone number, service area, and any statement that implies a physical location.
4. Give every page a unique search title between 30 and 65 characters.
5. Give every page a useful, unique meta description between 90 and 170 characters.
6. Provide a clear primary heading, substantive original content, at least three genuine questions and answers, an author, and a review date.
7. For every location page, provide and verify at least three useful local details from authoritative sources or actual attorney experience.
8. Complete attorney-advertising, privacy, intake, accessibility, security, and professional-responsibility review.

Passing the automated gate permits preparation of a release candidate. It does not publish the website. Publication remains a consequential action requiring an authorized human decision and a configured deployment target.

## When to release

Release only when the firm can answer **yes** to all of the following:

- All public claims and credentials are accurate, current, and supported.
- Every location page represents a place the firm actually serves and contains original local value.
- No page promises results, misstates availability, or uses a result/testimonial without required context and approval.
- Forms, calls, analytics, cookies, privacy notices, retention, conflicts review, and lead routing have been tested in staging.
- The production domain, TLS, redirects, canonical URLs, sitemap, robots rules, error pages, backups, monitoring, and security headers have been tested.
- Mobile usability, keyboard access, contrast, page speed, and structured data validation have been reviewed.
- A lawyer responsible for the content has approved the release snapshot.

After deployment, verify representative pages in Google Search Console URL Inspection, submit the sitemap, monitor crawl and indexing reports, review conversion quality, and update content when laws, procedures, personnel, locations, or firm services change. Do not mass-publish thin location or practice pages merely to target more queries.
