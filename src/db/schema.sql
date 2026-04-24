CREATE TABLE IF NOT EXISTS users (
  user_id       VARCHAR(20) NOT NULL,
  guild_id      VARCHAR(20) NOT NULL,
  balance       INTEGER     NOT NULL DEFAULT 0,
  packs_available INTEGER   NOT NULL DEFAULT 0,
  next_pack_at  TIMESTAMP,
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id           SERIAL PRIMARY KEY,
  owner_id     VARCHAR(20) NOT NULL,
  guild_id     VARCHAR(20) NOT NULL,
  card_user_id VARCHAR(20) NOT NULL,
  rarity       SMALLINT    NOT NULL CHECK (rarity BETWEEN 1 AND 20),
  obtained_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guild_config (
  guild_id         VARCHAR(20) PRIMARY KEY,
  channel_id       VARCHAR(20),
  excluded_role_id VARCHAR(20),
  interval_hours   INTEGER NOT NULL DEFAULT 24,
  free_packs_count INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS market_listings (
  id           SERIAL PRIMARY KEY,
  seller_id    VARCHAR(20) NOT NULL,
  guild_id     VARCHAR(20) NOT NULL,
  inventory_id INTEGER     NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  price        INTEGER     NOT NULL,
  listed_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_owner  ON inventory(owner_id, guild_id);
CREATE INDEX IF NOT EXISTS idx_inventory_rarity ON inventory(guild_id, rarity DESC);
CREATE INDEX IF NOT EXISTS idx_market_guild     ON market_listings(guild_id);
