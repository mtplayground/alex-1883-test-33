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
