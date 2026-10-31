-- F08 owns templates and their items. F05, F06 and F07 must be applied first.
CREATE TABLE quotation_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  validity_days INT NOT NULL CHECK (validity_days > 0),
  payment_term_id SMALLINT REFERENCES payment_terms(id) ON DELETE RESTRICT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price_override NUMERIC(12,2) CHECK (unit_price_override >= 0),
  tax_rule_id BIGINT REFERENCES tax_rules(id) ON DELETE RESTRICT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX ix_quotation_template_items_template_id ON quotation_template_items(template_id, sort_order, id);
CREATE INDEX ix_quotation_templates_is_active ON quotation_templates(is_active);
