const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getT } = require('../services/i18n');
const { PACK_TYPES, getPackConfig } = require('../services/shop');
const { getRarityOdds } = require('../services/rarity');

function formatProbability(probability) {
  const percent = probability * 100;

  if (percent >= 1) return `${percent.toFixed(2)}%`;
  if (percent >= 0.1) return `${percent.toFixed(3)}%`;
  if (percent >= 0.01) return `${percent.toFixed(4)}%`;
  return `${percent.toFixed(5)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('odds')
    .setDescription('Show drop odds for a selected pack')
    .setDescriptionLocalizations({ pl: 'Pokaz szanse dropu dla wybranej paczki' })
    .addStringOption(option => {
      option
        .setName('pack')
        .setDescription('Pack type to inspect')
        .setDescriptionLocalizations({ pl: 'Typ paczki do sprawdzenia' })
        .setRequired(false);

      for (const pack of PACK_TYPES) {
        option.addChoices({
          name: pack.name,
          name_localizations: { pl: pack.name },
          value: pack.key,
        });
      }

      return option;
    }),

  async execute(interaction) {
    const t = getT(interaction.locale);
    const packKey = interaction.options.getString('pack') ?? 'basic';
    const pack = getPackConfig(packKey);
    const odds = getRarityOdds({ weightMultiplier: pack.rollMultiplier });

    const lines = odds.map(tier =>
      t('odds.line', {
        tierName: tier.name,
        tier: tier.tier,
        chance: formatProbability(tier.probability),
      })
    );

    const embed = new EmbedBuilder()
      .setTitle(t('odds.title', { packName: pack.name }))
      .setDescription(lines.join('\n'))
      .setFooter({
        text: t('odds.footer', { cards: pack.cards }),
      })
      .setColor(0xF59E0B);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
