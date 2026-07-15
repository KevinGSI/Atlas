# Native Website Optimization

Atlas treats the public website as another surface of the firm-scoped canonical digital twin. It does not operate as an unrelated SEO plugin.

## Three coordinated layers

Atlas implements the website as an adaptive legal growth system while retaining one stable, accessible site and one canonical firm twin:

1. **Search capture:** people-first practice-area, issue, guide, attorney, and verified location pages remain crawlable through stable paths, canonicals, structured data, internal links, and sitemaps. AI works from a controlled page and query-theme taxonomy rather than spinning doorway pages.
2. **Conversion:** an approved-module decision engine may select presentation modes using controlled, non-identifying categories such as device class, referral source, local/informational/comparison intent, office-hours status, and return-visit status. It may change the emphasis and order of approved calls to action and proof modules, but not the public facts, paths, contact endpoints, forms, navigation, tracking contract, or content shown to crawlers.
3. **Intake qualification:** urgency, geography, matter fit, readiness, and conflict status produce a review route. Potential conflicts always route to conflict review. A qualified result may offer scheduling, but never creates representation, completes a conflict check, changes a calendar, or contacts someone without the existing Atlas approval controls.

## Continuous learning loop

1. The deployed website adapter sends aggregate, non-identifying performance signals to Atlas: search impressions, search arrivals, page views, engaged visits, consultation actions, qualified leads, scheduled consultations, attorney connections, retained matters, and telephone clicks.
2. Atlas stores daily performance windows as canonical `website_performance_window` objects. Raw names, email addresses, telephone numbers, IP addresses, search queries, visitor IDs, and session IDs are rejected by this analytics path.
3. Atlas measures the full growth funnel: impressions to search arrivals, visits to engaged visits, engagement to qualified leads, qualified leads to scheduled consultations, and scheduled consultations to retained matters. After the minimum evidence threshold is reached, the interchangeable AI provider may prepare a `website_optimization_proposal` using the site's public content and aggregate funnel data.
4. The proposal may alter only page-level SEO and educational content fields. Atlas blocks changes to routes, navigation, forms, telephone and email routing, scripts, tracking, attorney identity, and the consultation interaction contract.
5. An attorney or authorized reviewer must confirm advertising-rule review. Approval creates an immutable release candidate; it does not silently publish.
6. Production hosting activates an approved immutable version with an atomic pointer switch. The prior version remains available for instant rollback, so a content release does not require taking the website down.

## Provider neutrality

`StructuredModelWebsiteOptimizationProvider` uses the same provider-neutral completion contract as the rest of Atlas. OpenAI can power it now, but the optimization service is not coupled to OpenAI and accepts another provider implementing the same contract.

## Deliberate launch boundary

The repository now contains privacy-minimized performance ingestion, full-funnel computation, controlled adaptive presentation decisions, intake routing, AI proposal generation, interaction-contract protection, canonical auditability, and approval-gated release preparation. A production hosting adapter, verified domain, consent configuration, analytics/Search Console delivery service, intake transport, scheduling provider, and atomic deployment target are still required before Atlas can make live public-site releases.
