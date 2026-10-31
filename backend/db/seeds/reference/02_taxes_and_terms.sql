-- Idempotent reference seeds for tax rules and payment terms

INSERT INTO tax_rules (name, rate, is_active) VALUES
  ('GST 5%', 5.000, true),
  ('GST 12%', 12.000, true),
  ('GST 18%', 18.000, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO payment_terms (name, due_days, is_active) VALUES
  ('Due on receipt', 0, true),
  ('Net 15', 15, true),
  ('Net 30', 30, true)
ON CONFLICT (name) DO NOTHING;
