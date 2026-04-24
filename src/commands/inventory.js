const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { getT } = require('../services/i18n');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Browse your cards')
    .setDescriptionLocalizations({ pl: 'Przeglądaj swoje karty' })
    .addIntegerOption(o =>
      o.setName('page')
        .setDescription('Page number')
        .setDescriptionLocalizations({ pl: 'Numer strony' })
        .setMinValue(1)
    ),

  async execute(interaction) {
    const t      = getT(interaction.locale);
    const page   = interaction.options.getInteger('page') ?? 1;
    const offset = (page - 1) * PAGE_SIZE;

    const [cardsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, card_user_id, rarity
         FROM inventory
         WHERE owner_id=$1 AND guild_id=$2
         ORDER BY rarity DESC, obtained_at DESC
         LIMIT $3 OFFSET $4`,
        [interaction.user.id, interaction.guildId, PAGE_SIZE, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM inventory WHERE owner_id=$1 AND guild_id=$2`,
        [interaction.user.id, interaction.guildId]
      ),
    ]);

    const total      = parseInt(countRes.rows[0].count);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (!cardsRes.rows.length) {
      return interaction.reply({ content: t('inventory.empty'), ephemeral: true });
    }

    const lines = await Promise.all(
      cardsRes.rows.map(async row => {
        let username = `<@${row.card_user_id}>`;
        try {
          const u = await interaction.client.users.fetch(row.card_user_id);
          username = u.username;
        } catch {}
        const tier = getTierData(row.rarity);
        return t('inventory.line', { id: row.id, username, tierName: tier.name, tier: row.rarity });
      })
    );

    const embed = new EmbedBuilder()
      .setTitle(t('inventory.title', { username: interaction.user.username }))
      .setDescription(lines.join('\n'))
      .setFooter({ text: t('inventory.footer', { page, totalPages, total }) })
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
