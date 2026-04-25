const pool = require('../db/pool');
const { rollRarity } = require('./rarity');

const PACK_TYPES = [
  {
    key: 'basic',
    name: 'Basic Pack',
    description: 'Najtansza paczka i darmowy hourly drop. Glownie commony, z rzadszymi uncommonami.',
    price: 90,
    cards: 10,
    isFreeCyclePack: true,
    rollMultiplier(tier) {
      if (tier.event) return 0.2;
      if (tier.tier <= 2) return 2.4;
      if (tier.tier <= 4) return 1.45;
      if (tier.tier <= 6) return 0.3;
      if (tier.tier <= 8) return 0.08;
      if (tier.tier <= 12) return 0.015;
      if (tier.tier <= 18) return 0.003;
      if (tier.tier === 19) return 0.001;
      if (tier.tier === 25) return 0.0003;
      return 1;
    },
  },
  {
    key: 'adventurer',
    name: 'Adventurer Pack',
    description: 'Solidny booster z wyraznie lepsza szansa na uncommony, rare i mid-tier.',
    price: 260,
    cards: 10,
    rollMultiplier(tier) {
      if (tier.event) return 0.8;
      if (tier.tier <= 2) return 0.7;
      if (tier.tier <= 6) return 1.1;
      if (tier.tier <= 10) return 1.45;
      if (tier.tier <= 14) return 0.9;
      if (tier.tier <= 18) return 0.35;
      if (tier.tier === 19) return 0.15;
      if (tier.tier === 25) return 0.06;
      return 1;
    },
  },
  {
    key: 'royal',
    name: 'Royal Pack',
    description: 'Droga paczka z mocnym boostem na high-tier i realna szansa na grubszy pull.',
    price: 700,
    cards: 10,
    rollMultiplier(tier) {
      if (tier.event) return 1.35;
      if (tier.tier <= 4) return 0.35;
      if (tier.tier <= 8) return 0.8;
      if (tier.tier <= 12) return 1.4;
      if (tier.tier <= 16) return 1.8;
      if (tier.tier <= 18) return 1.25;
      if (tier.tier === 19) return 0.55;
      if (tier.tier === 25) return 0.18;
      return 1;
    },
  },
  {
    key: 'celestial',
    name: 'Celestial Pack',
    description: 'Najdrozszy booster. Najmocniej cisnie w najwyzsze tiery.',
    price: 1800,
    cards: 10,
    rollMultiplier(tier) {
      if (tier.event) return 2.1;
      if (tier.tier <= 6) return 0.2;
      if (tier.tier <= 10) return 0.55;
      if (tier.tier <= 14) return 1.2;
      if (tier.tier <= 18) return 2.4;
      if (tier.tier === 19) return 1.8;
      if (tier.tier === 25) return 0.65;
      return 1;
    },
  },
];

const PACKS_BY_KEY = new Map(PACK_TYPES.map(pack => [pack.key, pack]));

async function ensurePackInventoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_pack_inventory (
      user_id   VARCHAR(20) NOT NULL,
      guild_id  VARCHAR(20) NOT NULL,
      pack_type VARCHAR(32) NOT NULL,
      amount    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, guild_id, pack_type)
    )
  `);
}

function getPackConfig(packKey) {
  return PACKS_BY_KEY.get(packKey) ?? PACKS_BY_KEY.get('basic');
}

async function getOwnedPackCounts(userId, guildId) {
  await ensurePackInventoryTable();
  const { rows } = await pool.query(
    `SELECT pack_type, amount FROM user_pack_inventory WHERE user_id=$1 AND guild_id=$2`,
    [userId, guildId]
  );

  const counts = Object.fromEntries(PACK_TYPES.map(pack => [pack.key, 0]));
  for (const row of rows) {
    counts[row.pack_type] = row.amount;
  }
  return counts;
}

async function buyPack(userId, guildId, packKey, amount) {
  await ensurePackInventoryTable();
  const pack = getPackConfig(packKey);
  const totalPrice = pack.price * amount;

  await pool.query('BEGIN');
  try {
    const debit = await pool.query(
      `UPDATE users
       SET balance = balance - $1
       WHERE user_id=$2 AND guild_id=$3 AND balance >= $1
       RETURNING balance`,
      [totalPrice, userId, guildId]
    );

    if (!debit.rows.length) {
      await pool.query('ROLLBACK');
      return { error: 'insufficient_funds', totalPrice };
    }

    await pool.query(
      `INSERT INTO user_pack_inventory (user_id, guild_id, pack_type, amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, guild_id, pack_type)
       DO UPDATE SET amount = user_pack_inventory.amount + EXCLUDED.amount`,
      [userId, guildId, pack.key, amount]
    );

    await pool.query('COMMIT');
    return { pack, amount, totalPrice, balance: debit.rows[0].balance };
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

async function consumeOwnedPack(userId, guildId, packKey) {
  const res = await pool.query(
    `UPDATE user_pack_inventory
     SET amount = amount - 1
     WHERE user_id=$1 AND guild_id=$2 AND pack_type=$3 AND amount > 0
     RETURNING amount`,
    [userId, guildId, packKey]
  );
  return res.rows[0] ?? null;
}

function rollPackCard(pack) {
  return rollRarity({ weightMultiplier: pack.rollMultiplier });
}

module.exports = {
  PACK_TYPES,
  ensurePackInventoryTable,
  getPackConfig,
  getOwnedPackCounts,
  buyPack,
  consumeOwnedPack,
  rollPackCard,
};
