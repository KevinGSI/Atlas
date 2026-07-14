# Licensed Legal Research

Atlas includes a provider-neutral Legal Research workspace directly below Tasks. It can search a firm's contracted Westlaw and LexisNexis APIs, retain normalized citations and treatment metadata, and save the research as a canonical case-owned record. Saved research is immediately available to the same case context used by Workspace, case health, events, and `What do you need?`.

## Atlas research conversation

The primary Legal Research surface is a continuous Atlas AI conversation. The attorney can select a case, jurisdiction, practice area, and one of five source policies: best available, all connected licensed providers, Westlaw, LexisNexis, or cited public web.

Every conversational answer must use at least one live source. Atlas refuses to save an uncited memory-only response. Best-available mode prefers configured licensed research and may use the isolated public-web adapter for current publicly accessible material. Public results are always labeled separately and are never represented as Westlaw or LexisNexis citator results.

Follow-up questions retain the private conversation context. When a case is selected, Atlas also retrieves its canonical context, but its confidentiality guard prevents private case names, client details, strategy, documents, contact information, and case identifiers from entering a public-web query.

Each completed synthesis creates a case-owned `operation/legal_research_analysis` record containing the question, answer, citations, source policy, conversation and run provenance, and mandatory attorney-validation status. Direct licensed searches remain available for attorneys who want provider results without conversational synthesis.

## Vendor access boundary

Ordinary Westlaw or Lexis account passwords are not accepted or stored. Production access requires API credentials and endpoints issued under the firm's applicable vendor agreement.

- [Thomson Reuters Westlaw](https://legal.thomsonreuters.com/en/products/westlaw) provides authoritative Westlaw research products. Available API products, content entitlements, endpoints, and commercial terms must be confirmed with Thomson Reuters for the subscribing firm.
- [Lexis APIs](https://www.lexisnexis.com/en-us/products/lexis-api.page) provide REST and Protégé API options using secure OAuth authentication. Access and pricing depend on the licensed products and data volumes.

The Legal Research page always shows both providers. Until contracted API credentials are installed, it shows `Contracted API required` and disables research. Atlas does not simulate a successful provider search.

## Runtime configuration

Configure all four required values for each enabled provider using the exact endpoints supplied by that vendor:

```text
WESTLAW_CLIENT_ID
WESTLAW_CLIENT_SECRET
WESTLAW_TOKEN_ENDPOINT
WESTLAW_SEARCH_ENDPOINT
WESTLAW_SCOPE                 optional

LEXISNEXIS_CLIENT_ID
LEXISNEXIS_CLIENT_SECRET
LEXISNEXIS_TOKEN_ENDPOINT
LEXISNEXIS_SEARCH_ENDPOINT
LEXISNEXIS_SCOPE              optional
```

Endpoints must use HTTPS. Client secrets remain server-side and are never returned by provider discovery or saved in canonical objects.

## Canonical behavior

Each completed search creates an `operation/legal_research` object containing:

- the question, jurisdiction, practice area, and selected providers;
- provider-attributed answer summaries;
- bounded citation metadata, HTTPS source links, court, date, and treatment signals when supplied;
- the selected case relationship or explicit firm-wide scope;
- the search time, licensed-content marker, and attorney-validation requirement.

Atlas stores citation metadata rather than copying unrestricted licensed source content. Every authority must be opened in the licensed provider and validated by an attorney before reliance, citation, filing, or client advice.

## Interchangeability

Core case, event, UI, and AI code depends only on `LegalResearchService` and `LegalResearchProviderRegistry`. Westlaw and LexisNexis adapters implement the same normalized search contract. Additional licensed providers can be added through that registry without rewriting the digital twin.
