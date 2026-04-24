const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const pool = require('../db/pool');
const { ensureUser } = require('../services/pack');
const { getT } = require('../services/i18n');
const { ensurePackInventoryTable, getOwnedPackCounts, PACK_TYPES } = require('../services/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance and packs')
    .setDescriptionLocalizations({ pl: 'Sprawdz swoje saldo monet i paczki' }),

  async execute(interaction) {
    const t = getT(interaction.locale);
    await ensureUser(interaction.user.id, interaction.guildId);
    await ensurePackInventoryTable();

    const { rows } = await pool.query(
      `SELECT balance, packs_available, next_pack_at
       FROM users WHERE user_id=$1 AND guild_id=$2`,
      [interaction.user.id, interaction.guildId]
    );
    const ownedPacks = await getOwnedPackCounts(interaction.user.id, interaction.guildId);

    const row = rows[0];
    const ts = row.next_pack_at
      ? Math.floor(new Date(row.next_pack_at).getTime() / 1000)
      : null;
    const purchasedSummary = PACK_TYPES
      .map(pack => `${pack.name}: ${ownedPacks[pack.key] ?? 0}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle(t('balance.title', { username: interaction.user.username }))
      .addFields(
        { name: t('balance.field_coins'), value: `💰 ${row.balance}`, inline: true },
        { name: t('balance.field_packs'), value: `📦 ${row.packs_available}`, inline: true },
        { name: t('balance.field_next'), value: ts ? `<t:${ts}:R>` : t('balance.now'), inline: true },
        { name: t('balance.field_shop_packs'), value: purchasedSummary }
      )
      .setColor(0xFFD700)
      .setThumbnail(interaction.user.displayAvatarURL());

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
