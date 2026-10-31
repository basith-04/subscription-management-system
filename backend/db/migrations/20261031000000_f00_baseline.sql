-- F00 baseline: identity, roles, customers and audit trail.
-- Forward-only. Never edit this file after it reaches main.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE roles (
    id      SMALLINT GENERATED ALWAYS AS IDENTITY,
    name    TEXT NOT NULL,
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uq_roles_name UNIQUE (name),
    CONSTRAINT ck_roles_name CHECK (name IN ('admin', 'staff', 'customer'))
);

CREATE TABLE users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    role_id         SMALLINT NOT NULL,
    email           CITEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_by      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT ck_users_full_name CHECK (length(btrim(full_name)) BETWEEN 1 AND 120)
);

CREATE INDEX ix_users_role_id ON users (role_id);

CREATE TABLE customers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id         BIGINT,
    name            TEXT NOT NULL,
    company_name    TEXT,
    email           CITEXT NOT NULL,
    phone           TEXT,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal_code     TEXT,
    country         TEXT,
    tax_id          TEXT,
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT pk_customers PRIMARY KEY (id),
    CONSTRAINT uq_customers_user_id UNIQUE (user_id),
    CONSTRAINT fk_customers_user_id FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_customers_email ON customers (email);
CREATE INDEX ix_customers_name ON customers (name);

CREATE TABLE audit_logs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    actor_user_id   BIGINT,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       BIGINT NOT NULL,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_logs PRIMARY KEY (id),
    CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id)
        REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_audit_logs_entity
    ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX ix_audit_logs_actor
    ON audit_logs (actor_user_id, created_at DESC);
