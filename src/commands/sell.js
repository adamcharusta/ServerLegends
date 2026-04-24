const { SlashCommandBuilder } = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell a card for its base value')
    .setDescriptionLocalizations({ pl: 'Sprzedaj kartę za wartość bazową' })
    .addIntegerOption(o =>
      o.setName('id')
        .setDescription('Card ID from /inventory')
        .setDescriptionLocalizations({ pl: 'ID karty z /inventory' })
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const t      = getT(interaction.locale);
    const cardId = interaction.options.getInteger('id');

    const [cardRes, listedRes] = await Promise.all([
      pool.query(
        `SELECT id, rarity FROM inventory WHERE id=$1 AND owner_id=$2 AND guild_id=$3`,
        [cardId, interaction.user.id, interaction.guildId]
      ),
      pool.query(`SELECT id FROM market_listings WHERE inventory_id=$1`, [cardId]),
    ]);

    if (!cardRes.rows.length) {
      return interaction.reply({ content: t('sell.not_found', { id: cardId }), ephemeral: true });
    }
    if (listedRes.rows.length) {
      return interaction.reply({ content: t('sell.listed'), ephemeral: true });
    }

    const tier = getTierData(cardRes.rows[0].rarity);

    await pool.query('BEGIN');
    try {
      await pool.query(`DELETE FROM inventory WHERE id=$1`, [cardId]);
      await pool.query(
        `UPDATE users SET balance = balance + $1 WHERE user_id=$2 AND guild_id=$3`,
        [tier.baseValue, interaction.user.id, interaction.guildId]
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    await interaction.reply({
      content: t('sell.success', { id: cardId, tierName: tier.name, value: tier.baseValue }),
      ephemeral: true,
    });
  },
};
