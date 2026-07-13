ALTER TABLE atlas_workspace_membership
  DROP CONSTRAINT IF EXISTS atlas_workspace_membership_role_check;

ALTER TABLE atlas_workspace_membership
  ADD CONSTRAINT atlas_workspace_membership_role_check
  CHECK (role IN ('owner','admin','attorney','paralegal','billing','member','viewer'));
