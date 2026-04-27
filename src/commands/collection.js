const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { TIERS, getTierData } = require('../services/rarity');
const { generateCard } = require('../services/card');
const { getT } = require('../services/i18n');

function buildNavigationRow(t, currentIndex, total, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:prev`)
      .setLabel(t('common.previous'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${baseId}:next`)
      .setLabel(t('common.next'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentIndex === total - 1)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('Browse the card showcase for a player across all tiers')
    .setDescriptionLocalizations({ pl: 'Przegladaj wystawe kart gracza we wszystkich tierach' })
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Whose card showcase to view')
        .setDescriptionLocalizations({ pl: 'Czyja wystawe kart wyswietlic' })
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = getT(interaction.locale);
    const target = interaction.options.getUser('user');

    if (target.bot) {
      return interaction.editReply({ content: t('collection.bot_target') });
    }

    const avatarURL = target.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
    const previews = await Promise.all(
      TIERS.map(async ({ tier }) => {
        const tierInfo = getTierData(tier);
        const buffer = await generateCard(
          target.id,
          avatarURL,
          target.username,
          interaction.guild.name,
          tier
        );
        return { tier, tierInfo, buffer };
      })
    );

    const baseId = `collection:${interaction.id}`;
    let currentIndex = 0;

    const buildReplyPayload = () => {
      const current = previews[currentIndex];
      return {
        content: t('collection.entry', {
          username: target.username,
          tierName: current.tierInfo.name,
          tier: current.tier,
          value: current.tierInfo.baseValue,
          current: currentIndex + 1,
          total: previews.length,
        }),
        files: [
          new AttachmentBuilder(current.buffer, {
            name: `showcase-${target.id}-tier-${current.tier}.png`,
          }),
        ],
        components: [buildNavigationRow(t, currentIndex, previews.length, baseId)],
      };
    };

    const message = await interaction.editReply({
      ...buildReplyPayload(),
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async buttonInteraction => {
      if (!buttonInteraction.customId.startsWith(baseId)) return;

      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: t('collection.only_viewer'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (buttonInteraction.customId.endsWith(':prev') && currentIndex > 0) {
        currentIndex -= 1;
      }

      if (buttonInteraction.customId.endsWith(':next') && currentIndex < previews.length - 1) {
        currentIndex += 1;
      }

      await buttonInteraction.update(buildReplyPayload());
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
