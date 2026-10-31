-- F06 — products and product_variants.
-- DDL copied verbatim from docs/database/database-design.md §4.2.

CREATE TABLE products (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('service','software','addon','physical')),
  sales_price  NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_products_name ON products (name);
CREATE INDEX ix_products_is_active ON products (is_active);

CREATE TABLE product_variants (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_name   TEXT NOT NULL,
  attribute_value  TEXT NOT NULL,
  price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_product_variants_product_attribute
  ON product_variants (product_id, attribute_name, attribute_value);
CREATE INDEX ix_product_variants_product ON product_variants (product_id);
CREATE INDEX ix_product_variants_is_active ON product_variants (is_active);
