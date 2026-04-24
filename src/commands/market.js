const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { getT } = require('../services/i18n');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('market')
    .setDescription('Card market')
    .setDescriptionLocalizations({ pl: 'Giełda kart' })
    .addSubcommand(s =>
      s.setName('list')
        .setDescription('List a card for sale')
        .setDescriptionLocalizations({ pl: 'Wystaw kartę na sprzedaż' })
        .addIntegerOption(o =>
          o.setName('card_id').setDescription('Card ID').setDescriptionLocalizations({ pl: 'ID karty' }).setRequired(true).setMinValue(1)
        )
        .addIntegerOption(o =>
          o.setName('price').setDescription('Price in coins').setDescriptionLocalizations({ pl: 'Cena w monetach' }).setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(s =>
      s.setName('buy')
        .setDescription('Buy a card from the market')
        .setDescriptionLocalizations({ pl: 'Kup kartę z giełdy' })
        .addIntegerOption(o =>
          o.setName('listing_id').setDescription('Listing ID').setDescriptionLocalizations({ pl: 'ID oferty' }).setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('Browse market listings')
        .setDescriptionLocalizations({ pl: 'Przeglądaj oferty' })
        .addIntegerOption(o =>
          o.setName('page').setDescription('Page number').setDescriptionLocalizations({ pl: 'Numer strony' }).setMinValue(1)
        )
    )
    .addSubcommand(s =>
      s.setName('cancel')
        .setDescription('Remove your listing')
        .setDescriptionLocalizations({ pl: 'Wycofaj swoją ofertę' })
        .addIntegerOption(o =>
          o.setName('listing_id').setDescription('Listing ID').setDescriptionLocalizations({ pl: 'ID oferty' }).setRequired(true).setMinValue(1)
        )
    ),

  async execute(interaction) {
    const t   = getT(interaction.locale);
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const cardId = interaction.options.getInteger('card_id');
      const price  = interaction.options.getInteger('price');

      const [cardRes, listedRes] = await Promise.all([
        pool.query(
          `SELECT id FROM inventory WHERE id=$1 AND owner_id=$2 AND guild_id=$3`,
          [cardId, interaction.user.id, interaction.guildId]
        ),
        pool.query(`SELECT id FROM market_listings WHERE inventory_id=$1`, [cardId]),
      ]);

      if (!cardRes.rows.length) {
        return interaction.reply({ content: t('market.list_not_found'), ephemeral: true });
      }
      if (listedRes.rows.length) {
        return interaction.reply({ content: t('market.list_already'), ephemeral: true });
      }

      const { rows } = await pool.query(
        `INSERT INTO market_listings (seller_id, guild_id, inventory_id, price) VALUES ($1,$2,$3,$4) RETURNING id`,
        [interaction.user.id, interaction.guildId, cardId, price]
      );

      return interaction.reply({
        content: t('market.list_success', { cardId, price, listingId: rows[0].id }),
        ephemeral: true,
      });
    }

    if (sub === 'buy') {
      const listingId = interaction.options.getInteger('listing_id');

      await pool.query('BEGIN');
      try {
        const listingRes = await pool.query(
          `SELECT ml.*, inv.rarity, inv.card_user_id
           FROM market_listings ml
           JOIN inventory inv ON inv.id = ml.inventory_id
           WHERE ml.id=$1 AND ml.guild_id=$2 FOR UPDATE`,
          [listingId, interaction.guildId]
        );

        if (!listingRes.rows.length) {
          await pool.query('ROLLBACK');
          return interaction.reply({ content: t('market.buy_not_found'), ephemeral: true });
        }

        const item = listingRes.rows[0];

        if (item.seller_id === interaction.user.id) {
          await pool.query('ROLLBACK');
          return interaction.reply({ content: t('market.buy_own'), ephemeral: true });
        }

        const buyerRes = await pool.query(
          `SELECT balance FROM users WHERE user_id=$1 AND guild_id=$2`,
          [interaction.user.id, interaction.guildId]
        );

        if (!buyerRes.rows.length || buyerRes.rows[0].balance < item.price) {
          await pool.query('ROLLBACK');
          return interaction.reply({ content: t('market.buy_no_funds', { price: item.price }), ephemeral: true });
        }

        await pool.query(`UPDATE users SET balance = balance - $1 WHERE user_id=$2 AND guild_id=$3`, [item.price, interaction.user.id, interaction.guildId]);
        await pool.query(`UPDATE users SET balance = balance + $1 WHERE user_id=$2 AND guild_id=$3`, [item.price, item.seller_id, interaction.guildId]);
        await pool.query(`UPDATE inventory SET owner_id=$1 WHERE id=$2`, [interaction.user.id, item.inventory_id]);
        await pool.query(`DELETE FROM market_listings WHERE id=$1`, [listingId]);
        await pool.query('COMMIT');

        const tier = getTierData(item.rarity);
        return interaction.reply({
          content: t('market.buy_success', { cardUserId: item.card_user_id, tierName: tier.name, price: item.price }),
          ephemeral: true,
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    if (sub === 'view') {
      const page   = interaction.options.getInteger('page') ?? 1;
      const offset = (page - 1) * PAGE_SIZE;

      const [listRes, countRes] = await Promise.all([
        pool.query(
          `SELECT ml.id, ml.price, ml.seller_id, inv.rarity, inv.card_user_id
           FROM market_listings ml
           JOIN inventory inv ON inv.id = ml.inventory_id
           WHERE ml.guild_id=$1
           ORDER BY ml.listed_at DESC
           LIMIT $2 OFFSET $3`,
          [interaction.guildId, PAGE_SIZE, offset]
        ),
        pool.query(`SELECT COUNT(*) FROM market_listings WHERE guild_id=$1`, [interaction.guildId]),
      ]);

      const total      = parseInt(countRes.rows[0].count);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!listRes.rows.length) {
        return interaction.reply({ content: t('market.view_empty'), ephemeral: true });
      }

      const lines = listRes.rows.map(r => {
        const tier = getTierData(r.rarity);
        return t('market.view_line', { id: r.id, cardUserId: r.card_user_id, tierName: tier.name, price: r.price, sellerId: r.seller_id });
      });

      const embed = new EmbedBuilder()
        .setTitle(t('market.view_title'))
        .setDescription(lines.join('\n'))
        .setFooter({ text: t('market.view_footer', { page, totalPages, total }) })
        .setColor(0x4CAF50);

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'cancel') {
      const listingId = interaction.options.getInteger('listing_id');

      const res = await pool.query(
        `DELETE FROM market_listings WHERE id=$1 AND seller_id=$2 AND guild_id=$3`,
        [listingId, interaction.user.id, interaction.guildId]
      );

      if (!res.rowCount) {
        return interaction.reply({ content: t('market.cancel_not_found'), ephemeral: true });
      }
      return interaction.reply({ content: t('market.cancel_success', { id: listingId }), ephemeral: true });
    }
  },
};
