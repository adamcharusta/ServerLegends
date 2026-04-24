const pool = require('../db/pool');
const { rollRarity } = require('./rarity');

async function ensureUser(userId, guildId) {
  await pool.query(
    `INSERT INTO users (user_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );
}

async function replenishIfDue(userId, guildId, config) {
  const now = new Date();
  const { rows } = await pool.query(
    `SELECT next_pack_at FROM users WHERE user_id=$1 AND guild_id=$2`,
    [userId, guildId]
  );
  const row = rows[0];
  if (!row.next_pack_at || now >= new Date(row.next_pack_at)) {
    const nextPackAt = new Date(now.getTime() + config.interval_hours * 3_600_000);
    await pool.query(
      `UPDATE users
       SET packs_available = packs_available + $1, next_pack_at = $2
       WHERE user_id=$3 AND guild_id=$4`,
      [config.free_packs_count, nextPackAt, userId, guildId]
    );
  }
}

async function openPack(userId, guildId, guild) {
  const configRes = await pool.query(
    `SELECT * FROM guild_config WHERE guild_id=$1`,
    [guildId]
  );
  if (!configRes.rows.length) return { error: 'no_config' };

  const config = configRes.rows[0];

  await ensureUser(userId, guildId);
  await replenishIfDue(userId, guildId, config);

  const consumeRes = await pool.query(
    `UPDATE users
     SET packs_available = packs_available - 1
     WHERE user_id=$1 AND guild_id=$2 AND packs_available > 0
     RETURNING packs_available`,
    [userId, guildId]
  );

  if (!consumeRes.rows.length) {
    const { rows } = await pool.query(
      `SELECT next_pack_at FROM users WHERE user_id=$1 AND guild_id=$2`,
      [userId, guildId]
    );
    return { error: 'no_packs', nextPackAt: rows[0]?.next_pack_at };
  }

  const members = await guild.members.fetch();
  const candidates = members.filter(m =>
    !m.user.bot &&
    (!config.excluded_role_id || !m.roles.cache.has(config.excluded_role_id))
  );

  if (!candidates.size) return { error: 'no_members' };

  const arr = [...candidates.values()];
  const picked = arr[Math.floor(Math.random() * arr.length)];
  const tierInfo = rollRarity();

  const { rows: inserted } = await pool.query(
    `INSERT INTO inventory (owner_id, guild_id, card_user_id, rarity)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, guildId, picked.user.id, tierInfo.tier]
  );

  return {
    cardId: inserted[0].id,
    pickedUser: picked.user,
    avatarURL: picked.user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
    tierInfo,
    packsLeft: consumeRes.rows[0].packs_available,
  };
}

module.exports = { openPack, ensureUser };
