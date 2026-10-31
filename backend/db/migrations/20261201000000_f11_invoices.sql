-- F11 – Invoice management.
-- Owner: F11. DDL follows docs/database/database-design.md §4.7 (invoices) and §4.9 (billing_runs).
--
-- Dependencies:
--   * customers (F00) and users (F00) and products (F06) must exist.
--   * subscriptions / subscription_items are owned by F09 and may not be migrated yet.
--     The foreign keys to them are attached by 20261231000000_f11_invoice_subscription_fks.sql,
--     which is idempotent and only acts once the F09 tables exist. No F09 table is created here.

CREATE SEQUENCE invoice_number_seq START 1;

-- billing_runs is a log, not a lock (DB design §4.9). Rows are written by F12.
CREATE TABLE billing_runs (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger                TEXT        NOT NULL
                         CHECK (trigger IN ('scheduler','manual','startup_catchup')),
  run_date               DATE        NOT NULL,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at            TIMESTAMPTZ NULL,
  status                 TEXT        NOT NULL
                         CHECK (status IN ('running','completed','completed_with_errors','failed')),
  subscriptions_scanned  INT         NOT NULL DEFAULT 0,
  invoices_created       INT         NOT NULL DEFAULT 0,
  invoices_skipped       INT         NOT NULL DEFAULT 0,
  errors_count           INT         NOT NULL DEFAULT 0,
  triggered_by           BIGINT      NULL REFERENCES users (id)
);

CREATE INDEX ix_billing_runs_started_at ON billing_runs (started_at DESC);

CREATE TABLE invoices (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number             TEXT          NOT NULL
                     DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  -- FK to subscriptions(id) ON DELETE RESTRICT is attached by the follow-up F11 migration.
  subscription_id    BIGINT        NOT NULL,
  customer_id        BIGINT        NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  billing_run_id     BIGINT        NULL REFERENCES billing_runs (id),
  status             TEXT          NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','confirmed','paid','cancelled')),
  period_start       DATE          NOT NULL,
  period_end         DATE          NOT NULL,
  issue_date         DATE          NOT NULL,
  due_date           DATE          NOT NULL,
  -- Snapshots: an issued invoice never follows later customer / term edits.
  customer_name      TEXT          NOT NULL,
  customer_email     TEXT          NOT NULL,
  customer_tax_id    TEXT          NULL,
  billing_address    JSONB         NULL,
  payment_term_name  TEXT          NOT NULL,
  notes              TEXT          NULL,
  subtotal           NUMERIC(12,2) NOT NULL,
  discount_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total          NUMERIC(12,2) NOT NULL,
  total              NUMERIC(12,2) NOT NULL,
  amount_paid        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_due         NUMERIC(12,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  confirmed_at       TIMESTAMPTZ   NULL,
  paid_at            TIMESTAMPTZ   NULL,
  cancelled_at       TIMESTAMPTZ   NULL,
  sent_at            TIMESTAMPTZ   NULL,
  cancel_reason      TEXT          NULL,
  created_by         BIGINT        NULL REFERENCES users (id),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoices_number UNIQUE (number),
  CONSTRAINT ck_invoices_period CHECK (period_end >= period_start),
  CONSTRAINT ck_invoices_due_date CHECK (due_date >= issue_date),
  CONSTRAINT ck_invoices_amounts_nonneg CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0),
  CONSTRAINT ck_invoices_total CHECK (total = subtotal - discount_total + tax_total),
  CONSTRAINT ck_invoices_amount_paid CHECK (amount_paid >= 0 AND amount_paid <= total),
  CONSTRAINT ck_invoices_paid_has_no_due CHECK (status <> 'paid' OR amount_due = 0),
  CONSTRAINT ck_invoices_cancel_reason CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);

-- One live invoice per subscription per billing period. A cancelled invoice frees its period.
CREATE UNIQUE INDEX uq_invoices_subscription_period_start
  ON invoices (subscription_id, period_start)
  WHERE status <> 'cancelled';

CREATE INDEX ix_invoices_customer_status ON invoices (customer_id, status);
-- Overdue / outstanding lists and the dashboard.
CREATE INDEX ix_invoices_due_outstanding ON invoices (due_date)
  WHERE status = 'confirmed' AND amount_due > 0;
CREATE INDEX ix_invoices_status_issue_date ON invoices (status, issue_date DESC);
CREATE INDEX ix_invoices_subscription_period ON invoices (subscription_id, period_start DESC);
CREATE INDEX ix_invoices_billing_run ON invoices (billing_run_id);

CREATE TABLE invoice_items (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id            BIGINT        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  -- FK to subscription_items(id) ON DELETE SET NULL is attached by the follow-up F11 migration.
  subscription_item_id  BIGINT        NULL,
  product_id            BIGINT        NULL REFERENCES products (id) ON DELETE SET NULL,
  description           TEXT          NOT NULL,
  quantity              INT           NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_subtotal         NUMERIC(12,2) NOT NULL,
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount        NUMERIC(12,2) NOT NULL,
  tax_name              TEXT          NULL,
  tax_rate              NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount            NUMERIC(12,2) NOT NULL,
  line_total            NUMERIC(12,2) NOT NULL,
  CONSTRAINT ck_invoice_items_subtotal CHECK (line_subtotal = quantity * unit_price),
  CONSTRAINT ck_invoice_items_discount CHECK (discount_amount >= 0 AND discount_amount <= line_subtotal),
  CONSTRAINT ck_invoice_items_taxable CHECK (taxable_amount = line_subtotal - discount_amount),
  CONSTRAINT ck_invoice_items_tax CHECK (tax_amount = ROUND(taxable_amount * tax_rate / 100, 2)),
  CONSTRAINT ck_invoice_items_total CHECK (line_total = taxable_amount + tax_amount)
);

CREATE INDEX ix_invoice_items_invoice ON invoice_items (invoice_id);

CREATE TABLE invoice_tax_details (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id      BIGINT        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  tax_name        TEXT          NOT NULL,
  tax_rate        NUMERIC(6,3)  NOT NULL,
  taxable_amount  NUMERIC(12,2) NOT NULL,
  tax_amount      NUMERIC(12,2) NOT NULL,
  CONSTRAINT uq_invoice_tax_details UNIQUE (invoice_id, tax_name, tax_rate)
);

CREATE INDEX ix_invoice_tax_details_invoice ON invoice_tax_details (invoice_id);
