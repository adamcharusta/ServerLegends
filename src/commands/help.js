const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show bot usage instructions')
    .setDescriptionLocalizations({ pl: 'Pokaż instrukcję obsługi bota' }),

  async execute(interaction) {
    const t = getT(interaction.locale);
    const isDev = process.env.NODE_ENV === 'development';

    const gameplayLines = [
      t('help.commands.open'),
      t('help.commands.shop'),
      t('help.commands.inventory'),
      t('help.commands.cards'),
      t('help.commands.balance'),
      t('help.commands.sell'),
      t('help.commands.market'),
      t('help.commands.trade'),
      t('help.commands.top'),
    ];

    const adminLines = [
      t('help.commands.setup'),
      t('help.commands.help'),
    ];

    const embed = new EmbedBuilder()
      .setTitle(t('help.title'))
      .setDescription(t('help.description'))
      .addFields(
        {
          name: t('help.fields.quick_start'),
          value: [
            t('help.quick_start.setup'),
            t('help.quick_start.open'),
            t('help.quick_start.inventory'),
            t('help.quick_start.market'),
          ].join('\n'),
        },
        {
          name: t('help.fields.gameplay'),
          value: gameplayLines.join('\n'),
        },
        {
          name: t('help.fields.admin'),
          value: adminLines.join('\n'),
        }
      )
      .setColor(0x3498DB);

    if (isDev) {
      embed.addFields({
        name: t('help.fields.dev'),
        value: t('help.commands.dev'),
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
