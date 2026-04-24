const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { generateCard } = require('../services/card');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cards')
    .setDescription('Display a generated card')
    .setDescriptionLocalizations({ pl: 'Wyświetl wygenerowaną kartę' })
    .addIntegerOption(o =>
      o.setName('id')
        .setDescription('Card ID from /inventory')
        .setDescriptionLocalizations({ pl: 'ID karty z /inventory' })
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const t      = getT(interaction.locale);
    const cardId = interaction.options.getInteger('id');

    const { rows } = await pool.query(
      `SELECT id, card_user_id, rarity, owner_id FROM inventory WHERE id=$1 AND guild_id=$2`,
      [cardId, interaction.guildId]
    );

    if (!rows.length) {
      return interaction.editReply(t('cards.not_found'));
    }

    const card = rows[0];
    const tier = getTierData(card.rarity);

    let user;
    try {
      user = await interaction.client.users.fetch(card.card_user_id);
    } catch {
      return interaction.editReply(t('cards.user_error'));
    }

    const avatarURL  = user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
    const buffer     = await generateCard(user.id, avatarURL, user.username, interaction.guild.name, card.rarity);
    const attachment = new AttachmentBuilder(buffer, { name: 'card.png' });

    await interaction.editReply({
      content: t('cards.info', { id: card.id, tierName: tier.name, ownerId: card.owner_id }),
      files: [attachment],
    });
  },
};
