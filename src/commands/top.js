const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pool = require('../db/pool');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Player leaderboard')
    .setDescriptionLocalizations({ pl: 'Ranking graczy' })
    .addStringOption(o =>
      o.setName('by')
        .setDescription('Ranking criterion')
        .setDescriptionLocalizations({ pl: 'Kryterium rankingu' })
        .addChoices(
          { name: 'Coins',        name_localizations: { pl: 'Monety' },       value: 'balance' },
          { name: 'Card count',   name_localizations: { pl: 'Liczba kart' },  value: 'cards'   },
          { name: 'Highest tier', name_localizations: { pl: 'Najwyższy tier' }, value: 'rarity' }
        )
    ),

  async execute(interaction) {
    const t  = getT(interaction.locale);
    const by = interaction.options.getString('by') ?? 'balance';

    if (by === 'balance') {
      const { rows } = await pool.query(
        `SELECT user_id, balance FROM users WHERE guild_id=$1 ORDER BY balance DESC LIMIT 10`,
        [interaction.guildId]
      );
      const lines = rows.map((r, i) => `**${i + 1}.** ${t('top.balance_line', { userId: r.user_id, balance: r.balance })}`);
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle(t('top.balance_title')).setDescription(lines.join('\n') || t('top.no_data')).setColor(0xFFD700)],
      });
    }

    if (by === 'cards') {
      const { rows } = await pool.query(
        `SELECT owner_id, COUNT(*) AS cnt FROM inventory WHERE guild_id=$1 GROUP BY owner_id ORDER BY cnt DESC LIMIT 10`,
        [interaction.guildId]
      );
      const lines = rows.map((r, i) => `**${i + 1}.** ${t('top.cards_line', { ownerId: r.owner_id, count: r.cnt })}`);
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle(t('top.cards_title')).setDescription(lines.join('\n') || t('top.no_data')).setColor(0x5865F2)],
      });
    }

    if (by === 'rarity') {
      const { rows } = await pool.query(
        `SELECT owner_id, MAX(rarity) AS max_rarity FROM inventory WHERE guild_id=$1 GROUP BY owner_id ORDER BY max_rarity DESC LIMIT 10`,
        [interaction.guildId]
      );
      const lines = rows.map((r, i) => `**${i + 1}.** ${t('top.rarity_line', { ownerId: r.owner_id, tier: r.max_rarity })}`);
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle(t('top.rarity_title')).setDescription(lines.join('\n') || t('top.no_data')).setColor(0xE040FB)],
      });
    }
  },
};
