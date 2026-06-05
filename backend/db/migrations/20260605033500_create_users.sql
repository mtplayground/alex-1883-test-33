CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_google_id_unique UNIQUE (google_id),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_google_id_not_blank CHECK (char_length(btrim(google_id)) > 0),
  CONSTRAINT users_email_not_blank CHECK (char_length(btrim(email)) > 0),
  CONSTRAINT users_name_max_length CHECK (char_length(name) <= 200),
  CONSTRAINT users_avatar_url_max_length CHECK (char_length(avatar_url) <= 2048)
);

CREATE INDEX IF NOT EXISTS users_email_idx
  ON users (email);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
