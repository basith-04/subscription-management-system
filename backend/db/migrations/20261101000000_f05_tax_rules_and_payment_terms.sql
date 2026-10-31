-- Migration for F05: Tax Rules and Payment Terms

CREATE TABLE IF NOT EXISTS tax_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  rate NUMERIC(6,3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_tax_rules_rate CHECK (rate >= 0 AND rate <= 100),
  CONSTRAINT uq_tax_rules_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS payment_terms (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  due_days INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_payment_terms_due_days CHECK (due_days >= 0),
  CONSTRAINT uq_payment_terms_name UNIQUE (name)
);
