# Native Website Optimization

Atlas treats the public website as another surface of the firm-scoped canonical digital twin. It does not operate as an unrelated SEO plugin.

## Continuous learning loop

1. The deployed website adapter sends aggregate, non-identifying performance signals to Atlas: page views, search arrivals, consultation actions, scheduled consultations, attorney connections, and telephone clicks.
2. Atlas stores daily performance windows as canonical `website_performance_window` objects. Raw names, email addresses, telephone numbers, IP addresses, search queries, visitor IDs, and session IDs are rejected by this analytics path.
3. After the minimum evidence threshold is reached, the interchangeable AI provider may prepare a `website_optimization_proposal` using the site's public content and aggregate funnel data.
4. The proposal may alter only page-level SEO and educational content fields. Atlas blocks changes to routes, navigation, forms, telephone and email routing, scripts, tracking, attorney identity, and the consultation interaction contract.
5. An attorney or authorized reviewer must confirm advertising-rule review. Approval creates an immutable release candidate; it does not silently publish.
6. Production hosting activates an approved immutable version with an atomic pointer switch. The prior version remains available for instant rollback, so a content release does not require taking the website down.

## Provider neutrality

`StructuredModelWebsiteOptimizationProvider` uses the same provider-neutral completion contract as the rest of Atlas. OpenAI can power it now, but the optimization service is not coupled to OpenAI and accepts another provider implementing the same contract.

## Deliberate launch boundary

The repository now contains performance ingestion, funnel computation, AI proposal generation, interaction-contract protection, canonical auditability, and approval-gated release preparation. A production hosting adapter, verified domain, consent configuration, analytics delivery service, and atomic deployment target are still required before Atlas can make live public-site releases.
