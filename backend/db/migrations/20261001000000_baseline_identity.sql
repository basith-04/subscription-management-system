CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE roles (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK (name IN ('admin', 'staff', 'customer'))
);

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id SMALLINT NOT NULL REFERENCES roles(id),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (name) VALUES ('admin'), ('staff'), ('customer');

-- Seed an initial Admin (password is 'Password123!')
-- NOTE: Hash is a temporary mock until F01 installs argon2
INSERT INTO users (role_id, email, password_hash, full_name)
VALUES (
  (SELECT id FROM roles WHERE name = 'admin'),
  'admin@brightloop.local',
  'mock_hash_Password123!',
  'System Admin'
);
