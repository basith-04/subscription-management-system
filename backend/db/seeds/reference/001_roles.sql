-- Required in every environment. Idempotent.
INSERT INTO roles (name)
VALUES ('admin'), ('staff'), ('customer')
ON CONFLICT (name) DO NOTHING;
