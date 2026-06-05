CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_image_url_not_blank CHECK (char_length(btrim(image_url)) > 0),
  CONSTRAINT posts_caption_max_length CHECK (char_length(caption) <= 1000)
);

CREATE INDEX IF NOT EXISTS posts_author_created_at_id_idx
  ON posts (author_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS posts_created_at_id_idx
  ON posts (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_set_updated_at ON posts;

CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
