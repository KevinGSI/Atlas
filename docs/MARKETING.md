# Atlas Marketing

Atlas Marketing is a firm-isolated canonical workspace for broad educational advertising, aggregate public market signals, and attorney-controlled provider handoff.

## Campaign workflow

1. The attorney creates a campaign for Facebook, Instagram, LinkedIn, or Google Ads.
2. Atlas accepts city, county, state, or a radius of at least 10 miles. Address, ZIP-code, named-person, custom-audience, public-record ID, and case-number targeting is rejected.
3. Campaign text, budget, schedule, landing page, aggregate-signal references, and review state are stored as one canonical `operation/marketing_campaign` object.
4. Before an external provider is contacted, the attorney must confirm review of applicable attorney-advertising rules, the platforms' current policies, and the landing page.
5. A connected provider can create a **paused** external campaign. Atlas records the provider ID as `operation/marketing_campaign_launch`; it does not silently activate the campaign.

Advertising providers remain interchangeable through the provider registry. A live provider adapter must use the provider's approved authorization flow and must never expose access credentials to the browser or canonical case data.

## Public market signals

The initial source catalog covers:

- aggregate arrest activity;
- aggregate petitions for dissolution;
- aggregate car-accident activity.

There is no single national, person-level public database that Atlas can lawfully or reliably treat as a marketing list. Sources are configured per jurisdiction through `MARKETING_PUBLIC_DATA_SOURCES`. Each HTTPS source must return no more than 500 aggregate rows in this shape:

```json
[
  {
    "date": "2026-07-01",
    "jurisdiction": "Example County, DE",
    "count": 12,
    "sourceUrl": "https://official.example/data"
  }
]
```

Atlas rejects keys that indicate names, addresses, email addresses, phone numbers, dates of birth, licenses, defendants, petitioners, respondents, drivers, victims, case numbers, or docket numbers. Accepted totals become canonical `operation/public_market_signal` records and retain source URLs and provenance. Raw person-level rows are not retained.

Recommended starting source classes are the FBI Uniform Crime Reporting program for aggregate crime and arrest statistics, NHTSA FARS for non-identifying fatal-crash data, and approved state or local court aggregate filing feeds for dissolution petitions. FARS is limited to qualifying fatal crashes and does not contain personal identifying information, so a state crash-data connection is still required for broader local accident totals.

## Professional and platform safeguards

- Public records never become named leads, contact lists, remarketing audiences, lookalike seeds, or person-level ad targets.
- Atlas never automatically calls, texts, emails, or messages a person because of an arrest, dissolution filing, or accident.
- Google treats commission of a crime and relationship hardship as sensitive categories for personalized advertising. The campaign engine therefore permits only broad geographic context and provider-approved audience controls.
- ABA Model Rule 7.3 defines solicitation as a communication directed to a specific person known to need legal services in a particular matter. Each firm must also review the binding rules in every jurisdiction where its ads will appear.
- Every external campaign begins paused and remains subject to provider review and attorney approval.

These controls are product safeguards, not a legal conclusion that a campaign is permissible. The responsible attorney must review current state-bar rules, privacy law, court-record terms, platform policies, required disclaimers, retention rules, and any cooling-off or accident-victim solicitation restrictions before use.
