const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const pool = require('../db/pool');
const { getTierData, MAX_TIER } = require('../services/rarity');
const { getT } = require('../services/i18n');

const PREVIEW_LIMIT = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sellbulk')
    .setDescription('Sell many cards at once')
    .setDescriptionLocalizations({ pl: 'Sprzedaj wiele kart naraz' })
    .addIntegerOption(o =>
      o.setName('tier')
        .setDescription('Sell only cards of this tier')
        .setDescriptionLocalizations({ pl: 'Sprzedaj tylko karty tego tieru' })
        .setMinValue(1)
        .setMaxValue(MAX_TIER)
    )
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Sell only cards depicting this user')
        .setDescriptionLocalizations({ pl: 'Sprzedaj tylko karty z tym uzytkownikiem' })
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = getT(interaction.locale);
    const tier = interaction.options.getInteger('tier');
    const targetUser = interaction.options.getUser('user');

    if (tier === null && !targetUser) {
      return interaction.editReply({ content: t('sellbulk.no_filter') });
    }
    if (targetUser?.bot) {
      return interaction.editReply({ content: t('sellbulk.bot_target') });
    }

    const tierData = tier !== null ? getTierData(tier) : null;

    const { rows } = await pool.query(
      `SELECT i.id, i.rarity, i.card_user_id
         FROM inventory i
         LEFT JOIN market_listings m ON m.inventory_id = i.id
        WHERE i.owner_id = $1
          AND i.guild_id = $2
          AND m.id IS NULL
          AND ($3::int IS NULL OR i.rarity = $3)
          AND ($4::text IS NULL OR i.card_user_id = $4)
        ORDER BY i.rarity DESC, i.id ASC`,
      [interaction.user.id, interaction.guildId, tier, targetUser?.id ?? null]
    );

    if (!rows.length) {
      return interaction.editReply({ content: t('sellbulk.no_matches') });
    }

    const totalValue = rows.reduce((sum, row) => sum + getTierData(row.rarity).baseValue, 0);
    const filterParts = [];
    if (tierData) filterParts.push(t('sellbulk.filter_tier', { tierName: tierData.name, tier: tierData.tier }));
    if (targetUser) filterParts.push(t('sellbulk.filter_user', { username: targetUser.username }));
    const filterText = filterParts.join(' • ');

    const previewLines = rows.slice(0, PREVIEW_LIMIT).map(row => {
      const rowTier = getTierData(row.rarity);
      return `#${row.id} - ${rowTier.name} (T${row.rarity}) - ${rowTier.baseValue}`;
    });
    if (rows.length > PREVIEW_LIMIT) {
      previewLines.push(t('sellbulk.preview_more', { count: rows.length - PREVIEW_LIMIT }));
    }

    const baseId = `sellbulk:${interaction.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${baseId}:confirm`)
        .setLabel(t('sellbulk.confirm_button'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${baseId}:cancel`)
        .setLabel(t('sellbulk.cancel_button'))
        .setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({
      content: `${t('sellbulk.preview', {
        count: rows.length,
        value: totalValue,
        filter: filterText,
      })}\n${previewLines.join('\n')}`,
      components: [row],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 60 * 1000,
      max: 1,
    });

    collector.on('collect', async buttonInteraction => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: t('sellbulk.only_owner'),
          flags: MessageFlags.Ephemeral,
        });
        collector.resetTimer();
        return;
      }

      if (buttonInteraction.customId.endsWith(':cancel')) {
        await buttonInteraction.update({
          content: t('sellbulk.cancelled'),
          components: [],
        });
        return;
      }

      const ids = rows.map(r => r.id);
      const client = await pool.connect();
      let soldCount = 0;
      let earned = 0;
      try {
        await client.query('BEGIN');
        const deleteRes = await client.query(
          `DELETE FROM inventory
            WHERE owner_id = $1
              AND guild_id = $2
              AND id = ANY($3::int[])
              AND NOT EXISTS (SELECT 1 FROM market_listings m WHERE m.inventory_id = inventory.id)
            RETURNING rarity`,
          [interaction.user.id, interaction.guildId, ids]
        );
        soldCount = deleteRes.rows.length;
        earned = deleteRes.rows.reduce((sum, r) => sum + getTierData(r.rarity).baseValue, 0);

        if (soldCount > 0) {
          await client.query(
            `UPDATE users SET balance = balance + $1 WHERE user_id = $2 AND guild_id = $3`,
            [earned, interaction.user.id, interaction.guildId]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      if (soldCount === 0) {
        await buttonInteraction.update({
          content: t('sellbulk.no_matches'),
          components: [],
        });
        return;
      }

      await buttonInteraction.update({
        content: t('sellbulk.success', { count: soldCount, value: earned }),
        components: [],
      });
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: t('sellbulk.timeout'),
          components: [],
        }).catch(() => {});
      }
    });
  },
};
