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

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_content_not_blank CHECK (char_length(btrim(content)) > 0),
  CONSTRAINT comments_content_max_length CHECK (char_length(content) <= 1000)
);

CREATE INDEX IF NOT EXISTS comments_post_created_at_id_idx
  ON comments (post_id, created_at, id);

CREATE INDEX IF NOT EXISTS comments_author_id_idx
  ON comments (author_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT likes_user_post_unique UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS likes_post_id_idx
  ON likes (post_id);

CREATE INDEX IF NOT EXISTS likes_user_id_idx
  ON likes (user_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_follower_followee_unique UNIQUE (follower_id, followee_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS follows_followee_id_idx
  ON follows (followee_id);

CREATE INDEX IF NOT EXISTS follows_follower_id_idx
  ON follows (follower_id);

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

DROP TRIGGER IF EXISTS posts_set_updated_at ON posts;
CREATE TRIGGER posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS comments_set_updated_at ON comments;
CREATE TRIGGER comments_set_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
