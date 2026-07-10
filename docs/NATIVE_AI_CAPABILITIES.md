# Native AI Capability Contract

Atlas Core owns event delivery, authorization, provider routing, human review, persistence, and safety enforcement. A native AI capability owns only one bounded behavior.

Each capability declares:

- a stable `id`;
- a semantic `version`;
- one or more event `triggers`;
- an optional human-readable description;
- an `apply(job, output)` function.

Capabilities consume the canonical event job and normalized AI observations. They may add only reviewable `create_task`, `create_document`, or `draft_email` proposals. Atlas Core rejects unknown or consequential actions such as sending, filing, publishing, or deletion.

```js
registry.register({
  id: 'deposition-summary',
  version: '1.0.0',
  triggers: ['document.deposition'],
  description: 'Prepare deposition review work.',
  apply(job, output) {
    output.actionProposals.push({
      actionType: 'create_task',
      input: { title: `Review deposition: ${job.payload.title}` }
    });
    return output;
  }
});
```

Capability registries are injected into the application runtime through `nativeCapabilities`. Adding or updating a capability therefore does not require changes to the event engine, model adapter, HTTP layer, repository, or unrelated capabilities.
