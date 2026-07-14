ALTER TABLE atlas_ai_action_proposal DROP CONSTRAINT atlas_ai_action_proposal_action_type_check;
ALTER TABLE atlas_ai_action_proposal ADD CONSTRAINT atlas_ai_action_proposal_action_type_check
  CHECK (action_type IN ('create_task','create_document','draft_email','create_social_post','create_calendar_event'));
