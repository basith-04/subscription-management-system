-- F13 – Payments. Owner: F13. DDL follows docs/database/database-design.md §4.8.
-- Depends on F00 (customers, users) and F11 (invoices); apply AFTER 20261201000000_f11_invoices.sql.
-- Deviation from the doc: `created_at` is added to `payments` because the documented 60-second
-- duplicate-submission heuristic (feature-breakdown F13 §D) needs a creation timestamp.

CREATE TABLE payments (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id       BIGINT        NOT NULL REFERENCES customers (id),
  method            TEXT          NOT NULL
                    CHECK (method IN ('cash','bank_transfer','card','upi','cheque','other')),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- payment_date <= today is enforced in the service layer (CURRENT_DATE is not immutable).
  payment_date      DATE          NOT NULL,
  note              TEXT          NULL,
  reference_number  TEXT          NULL,
  source            TEXT          NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','gateway')),
  voided_at         TIMESTAMPTZ   NULL,
  void_reason       TEXT          NULL,
  recorded_by       BIGINT        NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_payments_void_reason CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);

-- Blocks the same bank / cheque reference being entered twice (voided payments free their reference).
CREATE UNIQUE INDEX uq_payments_method_reference
  ON payments (method, reference_number)
  WHERE reference_number IS NOT NULL AND voided_at IS NULL;
CREATE INDEX ix_payments_customer_date ON payments (customer_id, payment_date DESC);
CREATE INDEX ix_payments_payment_date ON payments (payment_date);

-- Allocations are never deleted: a voided payment keeps its rows as history, and "active" means
-- the parent payment has voided_at IS NULL.
CREATE TABLE payment_allocations (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id  BIGINT        NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  invoice_id  BIGINT        NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  CONSTRAINT uq_payment_allocations_payment_invoice UNIQUE (payment_id, invoice_id)
);

CREATE INDEX ix_payment_allocations_invoice ON payment_allocations (invoice_id);
CREATE INDEX ix_payment_allocations_payment ON payment_allocations (payment_id);
