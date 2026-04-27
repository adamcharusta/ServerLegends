const pool = require('../db/pool');
const { isDevUser } = require('../utils/devGuard');
const {
  ensurePackInventoryTable,
  getPackConfig,
  rollPackCard,
  rollGuaranteedCard,
} = require('./shop');

const MEMBER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const guildCandidateCache = new Map();

async function ensureUser(userId, guildId) {
  await pool.query(
    `INSERT INTO users (user_id, guild_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, guildId]
  );
}

function buildCandidateList(members, excludedRoleId) {
  return members.filter(member =>
    !member.user.bot &&
    (!excludedRoleId || !member.roles.cache.has(excludedRoleId))
  );
}

async function getCandidateMembers(guild, excludedRoleId) {
  const cacheKey = `${guild.id}:${excludedRoleId ?? 'none'}`;
  const cached = guildCandidateCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() && cached.members.length) {
    return cached.members;
  }

  const members = await guild.members.fetch();
  const candidates = [...buildCandidateList(members, excludedRoleId).values()];

  guildCandidateCache.set(cacheKey, {
    expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
    members: candidates,
  });

  return candidates;
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
  return openSelectedPack(userId, guildId, guild, 'basic', 1);
}

async function openSelectedPack(userId, guildId, guild, packKey, amount = 1) {
  const configRes = await pool.query(
    `SELECT * FROM guild_config WHERE guild_id=$1`,
    [guildId]
  );
  if (!configRes.rows.length) return { error: 'no_config' };

  const config = configRes.rows[0];
  const pack = getPackConfig(packKey);
  const packAmount = Math.max(1, amount);

  await ensureUser(userId, guildId);
  await ensurePackInventoryTable();
  await replenishIfDue(userId, guildId, config);

  const candidates = await getCandidateMembers(guild, config.excluded_role_id);
  if (!candidates.length) return { error: 'no_members' };

  const unlimitedPacks = isDevUser(userId);
  let packsLeft = 'INF';
  const pulls = [];

  await pool.query('BEGIN');
  try {
    if (!unlimitedPacks) {
      if (pack.isFreeCyclePack) {
        const { rows: userRows } = await pool.query(
          `SELECT packs_available, next_pack_at
           FROM users
           WHERE user_id=$1 AND guild_id=$2
           FOR UPDATE`,
          [userId, guildId]
        );
        const userRow = userRows[0];

        const { rows: ownedRows } = await pool.query(
          `SELECT amount
           FROM user_pack_inventory
           WHERE user_id=$1 AND guild_id=$2 AND pack_type=$3
           FOR UPDATE`,
          [userId, guildId, pack.key]
        );

        const freeAvailable = userRow?.packs_available ?? 0;
        const ownedAvailable = ownedRows[0]?.amount ?? 0;
        const totalAvailable = freeAvailable + ownedAvailable;

        if (totalAvailable < packAmount) {
          await pool.query('ROLLBACK');
          return {
            error: 'no_packs',
            nextPackAt: userRow?.next_pack_at,
            pack,
            requestedAmount: packAmount,
          };
        }

        const freeToConsume = Math.min(freeAvailable, packAmount);
        const ownedToConsume = packAmount - freeToConsume;

        if (freeToConsume > 0) {
          await pool.query(
            `UPDATE users
             SET packs_available = packs_available - $1
             WHERE user_id=$2 AND guild_id=$3`,
            [freeToConsume, userId, guildId]
          );
        }

        if (ownedToConsume > 0) {
          await pool.query(
            `UPDATE user_pack_inventory
             SET amount = amount - $1
             WHERE user_id=$2 AND guild_id=$3 AND pack_type=$4`,
            [ownedToConsume, userId, guildId, pack.key]
          );
        }

        packsLeft = totalAvailable - packAmount;
      } else {
        const { rows: ownedRows } = await pool.query(
          `SELECT amount
           FROM user_pack_inventory
           WHERE user_id=$1 AND guild_id=$2 AND pack_type=$3
           FOR UPDATE`,
          [userId, guildId, pack.key]
        );
        const ownedAvailable = ownedRows[0]?.amount ?? 0;

        if (ownedAvailable < packAmount) {
          await pool.query('ROLLBACK');
          return { error: 'no_owned_pack', pack, requestedAmount: packAmount };
        }

        await pool.query(
          `UPDATE user_pack_inventory
           SET amount = amount - $1
           WHERE user_id=$2 AND guild_id=$3 AND pack_type=$4`,
          [packAmount, userId, guildId, pack.key]
        );

        packsLeft = ownedAvailable - packAmount;
      }
    }

    const guaranteeCount = pack.guarantee?.count ?? 0;
    const guaranteeMinTier = pack.guarantee?.minTier ?? 0;

    for (let p = 0; p < packAmount; p++) {
      const tierRolls = [];
      for (let i = 0; i < pack.cards; i++) {
        tierRolls.push(
          i < guaranteeCount
            ? rollGuaranteedCard(pack, guaranteeMinTier)
            : rollPackCard(pack)
        );
      }
      for (let i = tierRolls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tierRolls[i], tierRolls[j]] = [tierRolls[j], tierRolls[i]];
      }

      for (const tierInfo of tierRolls) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];

        const { rows: inserted } = await pool.query(
          `INSERT INTO inventory (owner_id, guild_id, card_user_id, rarity)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, guildId, picked.user.id, tierInfo.tier]
        );

        pulls.push({
          cardId: inserted[0].id,
          pickedUser: picked.user,
          avatarURL: picked.user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
          tierInfo,
        });
      }
    }

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }

  return {
    pulls,
    pack,
    packAmount,
    packsLeft,
  };
}

module.exports = { openPack, openSelectedPack, ensureUser, getCandidateMembers };
