const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { openPack } = require('../services/pack');
const { generateCard } = require('../services/card');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open a card pack')
    .setDescriptionLocalizations({ pl: 'Otwórz paczkę kart' }),

  async execute(interaction) {
    await interaction.deferReply();
    const t = getT(interaction.locale);

    const result = await openPack(interaction.user.id, interaction.guildId, interaction.guild);

    if (result.error === 'no_config') {
      return interaction.editReply(t('open.no_config'));
    }
    if (result.error === 'no_packs') {
      const ts = Math.floor(new Date(result.nextPackAt).getTime() / 1000);
      return interaction.editReply(t('open.no_packs', { time: `<t:${ts}:R>` }));
    }
    if (result.error === 'no_members') {
      return interaction.editReply(t('open.no_members'));
    }

    const buffer = await generateCard(
      result.pickedUser.id,
      result.avatarURL,
      result.pickedUser.username,
      interaction.guild.name,
      result.tierInfo.tier
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'card.png' });

    await interaction.editReply({
      content: t('open.success', {
        username: result.pickedUser.username,
        tierName: result.tierInfo.name,
        packsLeft: result.packsLeft,
      }),
      files: [attachment],
    });
  },
};
