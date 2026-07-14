# Atlas UX Constitution

## Native digital-twin continuity

Every authenticated Atlas view, including every future view, must expose the same persistent digital-twin command dock automatically.

The excluded views are Home and Workspace because each contains its own complete, prominent native-AI command surface. A duplicate floating dock must not obscure either primary work area.

The dock must reuse the authenticated workspace, assistant endpoint, conversation identity, canonical sources, action proposals, and human-approval lifecycle. A feature may not introduce a separate chatbot, page-local AI memory, or parallel action path.

New views inherit the dock by default. Excluding another view requires an intentional product decision, an update to `twinDockExcludedViews`, and a corresponding verification change.

## Home and Workspace routing

Home is the universal starting point. A clear navigation request must open the authorized Atlas destination directly, including a uniquely resolved case. A request to perform legal or operational work must move into Workspace and continue there through the same assistant conversation.

Workspace is the unified lawyer work surface. It must filter the firm's authorized canonical cases, tasks, documents, communications, deadlines, contacts (including clients), pending AI proposals, and review items without creating a parallel data store. Prepared work remains subject to the existing human-approval boundary; Workspace may not send, file, or publish it automatically.
