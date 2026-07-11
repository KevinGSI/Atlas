# Atlas UX Constitution

## Native digital-twin continuity

Every authenticated Atlas view, including every future view, must expose the same persistent digital-twin command dock automatically.

The only excluded view is Home because Home contains the complete, prominent `What do you need?` command center.

The dock must reuse the authenticated workspace, assistant endpoint, conversation identity, canonical sources, action proposals, and human-approval lifecycle. A feature may not introduce a separate chatbot, page-local AI memory, or parallel action path.

New views inherit the dock by default. Excluding another view requires an intentional product decision, an update to `twinDockExcludedViews`, and a corresponding verification change.
