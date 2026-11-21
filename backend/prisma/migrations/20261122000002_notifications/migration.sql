-- In-app notifications: one row per person, so each user has their own read state and history.
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event      VARCHAR(40) NOT NULL,
  title      VARCHAR(300) NOT NULL,
  link       VARCHAR(200),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
