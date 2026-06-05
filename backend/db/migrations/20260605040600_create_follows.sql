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
