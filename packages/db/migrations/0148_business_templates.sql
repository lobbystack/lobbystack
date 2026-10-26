-- A partner's templates: a business's setup saved in the lobbystack onboard
-- file format, which the partner starts new businesses from. A template keeps
-- its own copy of each document it lists, so it outlives the business it was
-- saved from. Anyone on the partner's team reads the partner's templates, and
-- owners and admins save and delete them. Every statement needs the person on
-- the team, as an operator or as the system actor deleting a template, which
-- queues the deletion of its stored copies.

CREATE TABLE IF NOT EXISTS public.business_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- The setup, as businessTemplateSchema in packages/shared reads it.
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_templates_partner_idx ON public.business_templates (partner_id, created_at);
-- A template's documents name its partner too, and this key keeps them the same.
CREATE UNIQUE INDEX IF NOT EXISTS business_templates_id_partner_unique ON public.business_templates (id, partner_id);

-- The stored copy of each document a template lists.
CREATE TABLE IF NOT EXISTS public.business_template_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  -- The document as the template's knowledge.files names it.
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 255),
  object_key text NOT NULL,
  content_type varchar(255) NOT NULL,
  content_length integer NOT NULL CHECK (content_length > 0),
  -- The SHA-256 of the bytes, base64, which an upload of the copy is checked against.
  checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, partner_id) REFERENCES public.business_templates (id, partner_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS business_template_files_path_unique ON public.business_template_files (template_id, path);
CREATE UNIQUE INDEX IF NOT EXISTS business_template_files_object_key_unique ON public.business_template_files (object_key);

ALTER TABLE public.business_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_template_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_template_files FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_templates_member_read ON public.business_templates;
CREATE POLICY business_templates_member_read ON public.business_templates FOR SELECT
  USING (app.current_actor_type() IN ('operator', 'system') AND app.partner_role(partner_id) IS NOT NULL);
DROP POLICY IF EXISTS business_templates_admin_insert ON public.business_templates;
CREATE POLICY business_templates_admin_insert ON public.business_templates FOR INSERT
  WITH CHECK (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS business_templates_admin_delete ON public.business_templates;
CREATE POLICY business_templates_admin_delete ON public.business_templates FOR DELETE
  USING (app.current_actor_type() IN ('operator', 'system') AND app.partner_role(partner_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS business_template_files_member_read ON public.business_template_files;
CREATE POLICY business_template_files_member_read ON public.business_template_files FOR SELECT
  USING (app.current_actor_type() IN ('operator', 'system') AND app.partner_role(partner_id) IS NOT NULL);
DROP POLICY IF EXISTS business_template_files_admin_insert ON public.business_template_files;
CREATE POLICY business_template_files_admin_insert ON public.business_template_files FOR INSERT
  WITH CHECK (app.current_actor_type() = 'operator' AND app.partner_role(partner_id) IN ('owner', 'admin'));
DROP POLICY IF EXISTS business_template_files_admin_delete ON public.business_template_files;
CREATE POLICY business_template_files_admin_delete ON public.business_template_files FOR DELETE
  USING (app.current_actor_type() IN ('operator', 'system') AND app.partner_role(partner_id) IN ('owner', 'admin'));

-- A template doesn't change once saved: a new setup is a new template.
GRANT SELECT, INSERT, DELETE ON public.business_templates, public.business_template_files TO lobbystack_app;
GRANT SELECT ON public.business_templates, public.business_template_files TO lobbystack_readonly;
