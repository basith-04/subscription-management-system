-- F09 – attach subscriptions.template_id → quotation_templates(id) once F08's table exists.
-- Idempotent and a no-op until then. Informational link only (editing a template never changes quotations).
DO $$
BEGIN
  IF to_regclass('quotation_templates') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_subscriptions_template_id' AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT fk_subscriptions_template_id
      FOREIGN KEY (template_id) REFERENCES quotation_templates (id);
  END IF;
END $$;
