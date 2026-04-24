const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Propose a card trade')
    .setDescriptionLocalizations({ pl: 'Zaproponuj wymianę kart' })
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Target player')
        .setDescriptionLocalizations({ pl: 'Gracz docelowy' })
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('your_card')
        .setDescription('Your card ID')
        .setDescriptionLocalizations({ pl: 'ID twojej karty' })
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName('their_card')
        .setDescription("The other player's card ID")
        .setDescriptionLocalizations({ pl: 'ID karty drugiego gracza' })
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    const t          = getT(interaction.locale);
    const target     = interaction.options.getUser('user');
    const yourCardId = interaction.options.getInteger('your_card');
    const theirCardId = interaction.options.getInteger('their_card');

    if (target.id === interaction.user.id || target.bot) {
      return interaction.reply({ content: t('trade.self_or_bot'), ephemeral: true });
    }

    const [yourRes, theirRes] = await Promise.all([
      pool.query(
        `SELECT id, card_user_id, rarity FROM inventory WHERE id=$1 AND owner_id=$2 AND guild_id=$3`,
        [yourCardId, interaction.user.id, interaction.guildId]
      ),
      pool.query(
        `SELECT id, card_user_id, rarity FROM inventory WHERE id=$1 AND owner_id=$2 AND guild_id=$3`,
        [theirCardId, target.id, interaction.guildId]
      ),
    ]);

    if (!yourRes.rows.length) {
      return interaction.reply({ content: t('trade.no_your_card', { id: yourCardId }), ephemeral: true });
    }
    if (!theirRes.rows.length) {
      return interaction.reply({ content: t('trade.no_their_card', { username: target.username, id: theirCardId }), ephemeral: true });
    }

    const yourTier  = getTierData(yourRes.rows[0].rarity);
    const theirTier = getTierData(theirRes.rows[0].rarity);

    const tTarget = getT(target.locale ?? interaction.locale);

    const embed = new EmbedBuilder()
      .setTitle(t('trade.embed_title'))
      .setDescription(t('trade.embed_desc', { user1: `${interaction.user}`, user2: `${target}` }))
      .addFields(
        {
          name: t('trade.field_offers', { username: interaction.user.username }),
          value: t('trade.card_line', { id: yourCardId, cardUserId: yourRes.rows[0].card_user_id, tierName: yourTier.name }),
          inline: true,
        },
        {
          name: t('trade.field_wants', { username: target.username }),
          value: t('trade.card_line', { id: theirCardId, cardUserId: theirRes.rows[0].card_user_id, tierName: theirTier.name }),
          inline: true,
        }
      )
      .setColor(0x00BCD4)
      .setFooter({ text: tTarget('trade.footer') });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade_accept').setLabel('✔').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trade_decline').setLabel('✖').setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({
      content: `${target}`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === target.id,
      time: 60_000,
      max: 1,
    });

    collector.on('collect', async i => {
      const tResponder = getT(i.locale);
      if (i.customId === 'trade_decline') {
        return i.update({ content: tResponder('trade.declined', { username: target.username }), embeds: [], components: [] });
      }

      await pool.query('BEGIN');
      try {
        const [checkYour, checkTheir] = await Promise.all([
          pool.query(`SELECT id FROM inventory WHERE id=$1 AND owner_id=$2`, [yourCardId, interaction.user.id]),
          pool.query(`SELECT id FROM inventory WHERE id=$1 AND owner_id=$2`, [theirCardId, target.id]),
        ]);

        if (!checkYour.rows.length || !checkTheir.rows.length) {
          await pool.query('ROLLBACK');
          return i.update({ content: tResponder('trade.unavailable'), embeds: [], components: [] });
        }

        await pool.query(`UPDATE inventory SET owner_id=$1 WHERE id=$2`, [target.id, yourCardId]);
        await pool.query(`UPDATE inventory SET owner_id=$1 WHERE id=$2`, [interaction.user.id, theirCardId]);
        await pool.query('COMMIT');

        await i.update({
          content: tResponder('trade.success', { user1: `${interaction.user}`, user2: `${target}` }),
          embeds: [],
          components: [],
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    });

    collector.on('end', async collected => {
      if (!collected.size) {
        await interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};
