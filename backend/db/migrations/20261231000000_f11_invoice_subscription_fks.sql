-- F11 – attach the foreign keys from invoice tables to F09-owned tables.
-- Idempotent: each constraint is added only when the F09 table exists and the constraint is missing.
-- F09 owns `subscriptions` / `subscription_items`; nothing is created here. If F09's migration sorts
-- after this file, re-apply the DO blocks below (or move this file's timestamp) once F09 has merged.

DO $$
BEGIN
  IF to_regclass('subscriptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_invoices_subscription_id' AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT fk_invoices_subscription_id
      FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('subscription_items') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_invoice_items_subscription_item_id' AND conrelid = 'invoice_items'::regclass
  ) THEN
    ALTER TABLE invoice_items
      ADD CONSTRAINT fk_invoice_items_subscription_item_id
      FOREIGN KEY (subscription_item_id) REFERENCES subscription_items (id) ON DELETE SET NULL;
  END IF;
END $$;
