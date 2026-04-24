const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pool = require('../db/pool');
const { ensureUser } = require('../services/pack');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance and packs')
    .setDescriptionLocalizations({ pl: 'Sprawdź swoje saldo monet i paczki' }),

  async execute(interaction) {
    const t = getT(interaction.locale);
    await ensureUser(interaction.user.id, interaction.guildId);

    const { rows } = await pool.query(
      `SELECT balance, packs_available, next_pack_at
       FROM users WHERE user_id=$1 AND guild_id=$2`,
      [interaction.user.id, interaction.guildId]
    );

    const row = rows[0];
    const ts  = row.next_pack_at
      ? Math.floor(new Date(row.next_pack_at).getTime() / 1000)
      : null;

    const embed = new EmbedBuilder()
      .setTitle(t('balance.title', { username: interaction.user.username }))
      .addFields(
        { name: t('balance.field_coins'), value: `🪙 ${row.balance}`,         inline: true },
        { name: t('balance.field_packs'), value: `📦 ${row.packs_available}`, inline: true },
        { name: t('balance.field_next'),  value: ts ? `<t:${ts}:R>` : t('balance.now'), inline: true }
      )
      .setColor(0xFFD700)
      .setThumbnail(interaction.user.displayAvatarURL());

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
