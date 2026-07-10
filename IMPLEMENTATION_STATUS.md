# Atlas Core 0.17.0 — Implementation Status

## Verified as implemented

- Everything verified in Atlas Core `0.1.0` through `0.16.0`
- Provider-neutral `propose_create_task` AI tool
- Tool calls produce pending proposals and never write tasks directly
- Proposal linkage to workspace, AI run, proposing user, structured input, and timestamps
- Pending, approved, and rejected lifecycle with version-checked decisions
- Workspace-read proposal listing with optional status filtering
- Workspace-write permission required for approval or rejection
- Transactional approval that creates an operation/task object and timeline event
- Matter-linked tasks when an authorized matter ID is proposed
- Result-object and deciding-user accountability
- Repeated and stale decisions rejected without duplicate task creation
- In-memory and PostgreSQL persistence plus migration `0009`

## Verification completed here

- 93 canonical tests across the full Atlas Core surface
- Model tool-call to pending proposal flow
- Proof that no task exists before approval
- Approved task content, matter parent, proposal linkage, and timeline creation
- Rejection without object creation
- Duplicate-decision prevention
- Authenticated HTTP list and approve flow
- PostgreSQL workspace, version, and pending-status decision constraints

## Explicitly not verified in this environment

- Action proposal persistence and approval against live PostgreSQL
- Live OpenAI tool selection for task proposals
- Concurrent approvals from separate live processes
- Production authorization review and external penetration testing

## Security and product limitations still remaining

- Only task creation is supported; documents, email, calendar, navigation, and other actions remain unimplemented
- Proposed task fields are operational workspace data and are not covered by the AI-content cipher
- No multi-approver policy, configurable risk tiers, expiration, cancellation, or delegated approval
- No streaming transport, model cost budgets, context compaction, or message pagination
- No ethical walls, provider privacy certification, or independent security audit

## Data-safety boundary

Version `0.17.0` establishes the core safety rule for agentic Atlas behavior: models may propose a platform mutation, but only an authenticated human with write permission can approve it. Live PostgreSQL and concurrency verification, broader policy controls, and independent security review remain required before production use.
