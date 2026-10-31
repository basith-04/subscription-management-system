-- F07 – Subscription plans and policies.
-- Owner: F07. DDL follows docs/database/database-design.md §4.3.
-- Depends on F06 (products, product_variants): apply AFTER the F06 migration.
-- Requires PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT); project target is 16.

CREATE TABLE plans (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               TEXT          NOT NULL,
  price              NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  billing_frequency  TEXT          NOT NULL
                     CHECK (billing_frequency IN ('daily','weekly','monthly','yearly')),
  min_quantity       INT           NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from     DATE          NOT NULL,
  available_to       DATE          NULL,
  auto_close_on_end  BOOLEAN       NOT NULL DEFAULT TRUE,
  allow_early_close  BOOLEAN       NOT NULL DEFAULT FALSE,
  allow_pause        BOOLEAN       NOT NULL DEFAULT FALSE,
  allow_renewal      BOOLEAN       NOT NULL DEFAULT TRUE,
  notes              TEXT          NULL,
  is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT plans_name_key UNIQUE (name),
  CONSTRAINT plans_availability_range_chk
    CHECK (available_to IS NULL OR available_to >= available_from)
);

CREATE INDEX plans_availability_idx ON plans (is_active, available_from, available_to);

CREATE TABLE plan_products (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id             BIGINT        NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  product_id          BIGINT        NOT NULL REFERENCES products (id),
  variant_id          BIGINT        NULL REFERENCES product_variants (id),
  default_quantity    INT           NOT NULL DEFAULT 1 CHECK (default_quantity >= 1),
  unit_price_override NUMERIC(12,2) NULL CHECK (unit_price_override IS NULL OR unit_price_override >= 0),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- NULL variants must collide too, hence NULLS NOT DISTINCT.
  CONSTRAINT plan_products_unique_row UNIQUE NULLS NOT DISTINCT (plan_id, product_id, variant_id)
);

CREATE INDEX plan_products_plan_idx ON plan_products (plan_id);
CREATE INDEX plan_products_product_idx ON plan_products (product_id);
