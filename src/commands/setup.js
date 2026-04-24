const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const pool = require('../db/pool');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server (admin only)')
    .setDescriptionLocalizations({ pl: 'Skonfiguruj bota na tym serwerze (tylko administrator)' })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Bot channel')
        .setDescriptionLocalizations({ pl: 'Kanał dla bota' })
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('interval')
        .setDescription('Pack interval in hours')
        .setDescriptionLocalizations({ pl: 'Co ile godzin gracz dostaje paczki' })
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(o =>
      o.setName('packs')
        .setDescription('Number of free packs per cycle')
        .setDescriptionLocalizations({ pl: 'Ile paczek dostaje gracz za jednym razem' })
        .setRequired(true)
        .setMinValue(1)
    )
    .addRoleOption(o =>
      o.setName('excluded_role')
        .setDescription('Role excluded from card draws')
        .setDescriptionLocalizations({ pl: 'Rola wykluczona z losowania kart' })
    ),

  async execute(interaction) {
    const t            = getT(interaction.locale);
    const channel      = interaction.options.getChannel('channel');
    const interval     = interaction.options.getInteger('interval');
    const packs        = interaction.options.getInteger('packs');
    const excludedRole = interaction.options.getRole('excluded_role');

    await pool.query(
      `INSERT INTO guild_config (guild_id, channel_id, interval_hours, free_packs_count, excluded_role_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         channel_id       = EXCLUDED.channel_id,
         interval_hours   = EXCLUDED.interval_hours,
         free_packs_count = EXCLUDED.free_packs_count,
         excluded_role_id = EXCLUDED.excluded_role_id`,
      [interaction.guildId, channel.id, interval, packs, excludedRole?.id ?? null]
    );

    let content = t('setup.success', { channel, interval, packs });
    if (excludedRole) content += t('setup.excluded_role', { role: excludedRole });

    await interaction.reply({ content, ephemeral: true });
  },
};
