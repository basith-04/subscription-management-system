-- F09 – Quotations and subscription creation. Owner: F09.
-- DDL follows docs/database/database-design.md §4.5. A quotation is a subscription whose status is
-- 'draft' or 'quotation'; there is no separate table.
--
-- Dependencies (apply AFTER): F00 customers/users, F05 payment_terms/tax_rules, F06 products/product_variants,
-- F07 plans. F08 owns quotation_templates; the template_id foreign key is attached by
-- 20261231500000_f09_subscription_template_fk.sql once that table exists (informational link only).
-- invoices.subscription_id gets its foreign key from the F11 follow-up migration (20261231000000).

CREATE SEQUENCE subscription_number_seq START 1;

CREATE TABLE subscriptions (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Assigned at creation from the sequence (gaps after rollbacks are acceptable).
  number                   TEXT          NOT NULL
                           DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0')),
  customer_id              BIGINT        NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  plan_id                  BIGINT        NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  template_id              BIGINT        NULL,
  payment_term_id          SMALLINT      NOT NULL REFERENCES payment_terms (id),
  status                   TEXT          NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','quotation','confirmed','active','closed')),
  start_date               DATE          NOT NULL,
  expiry_date              DATE          NOT NULL,
  quotation_valid_until    DATE          NULL,
  auto_renew               BOOLEAN       NOT NULL DEFAULT FALSE,
  billing_anchor_date      DATE          NULL,
  period_index             INT           NOT NULL DEFAULT 0,
  next_billing_date        DATE          NULL,
  paused_at                TIMESTAMPTZ   NULL,
  pause_reason             TEXT          NULL,
  closed_at                TIMESTAMPTZ   NULL,
  closed_reason            TEXT          NULL
                           CHECK (closed_reason IN ('expired','early_closure','cancelled','non_payment','other')),
  confirmed_at             TIMESTAMPTZ   NULL,
  activated_at             TIMESTAMPTZ   NULL,
  last_billing_attempt_at  TIMESTAMPTZ   NULL,
  last_billing_error       TEXT          NULL,
  created_by               BIGINT        NULL REFERENCES users (id),
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscriptions_number UNIQUE (number),
  CONSTRAINT ck_subscriptions_expiry CHECK (expiry_date >= start_date),
  CONSTRAINT ck_subscriptions_closed_at CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CONSTRAINT ck_subscriptions_paused_active CHECK (paused_at IS NULL OR status = 'active'),
  CONSTRAINT ck_subscriptions_next_billing_active CHECK (next_billing_date IS NULL OR status = 'active')
);

-- The billing scheduler's "what is due?" query (F12).
CREATE INDEX ix_subscriptions_next_billing ON subscriptions (next_billing_date)
  WHERE status = 'active' AND paused_at IS NULL;
CREATE INDEX ix_subscriptions_customer_status ON subscriptions (customer_id, status);
CREATE INDEX ix_subscriptions_status_expiry ON subscriptions (status, expiry_date);
CREATE INDEX ix_subscriptions_plan ON subscriptions (plan_id);

CREATE TABLE subscription_items (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id  BIGINT        NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  product_id       BIGINT        NOT NULL REFERENCES products (id),
  variant_id       BIGINT        NULL REFERENCES product_variants (id),
  -- Snapshot of product name + variant label when the line was added.
  description      TEXT          NOT NULL,
  quantity         INT           NOT NULL CHECK (quantity > 0),
  -- Snapshot: agreed contract price; later catalogue changes never rewrite it.
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  -- Live link: the rate is read when invoicing and copied to the invoice line.
  tax_rule_id      BIGINT        NULL REFERENCES tax_rules (id),
  line_amount      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order       INT           NOT NULL DEFAULT 0
);

CREATE INDEX ix_subscription_items_subscription ON subscription_items (subscription_id);
CREATE INDEX ix_subscription_items_product ON subscription_items (product_id);
