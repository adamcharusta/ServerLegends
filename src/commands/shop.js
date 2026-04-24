const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ensureUser } = require('../services/pack');
const { getT } = require('../services/i18n');
const { PACK_TYPES, getPackConfig, getOwnedPackCounts, buyPack, ensurePackInventoryTable } = require('../services/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and buy card packs')
    .setDescriptionLocalizations({ pl: 'Przegladaj i kupuj paczki kart' })
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View available packs')
        .setDescriptionLocalizations({ pl: 'Zobacz dostepne paczki' })
    )
    .addSubcommand(sub => {
      sub.setName('buy')
        .setDescription('Buy a pack with coins')
        .setDescriptionLocalizations({ pl: 'Kup paczke za monety' })
        .addStringOption(option => {
          option
            .setName('pack')
            .setDescription('Pack to buy')
            .setDescriptionLocalizations({ pl: 'Paczka do kupienia' })
            .setRequired(true);

          for (const pack of PACK_TYPES) {
            option.addChoices({
              name: `${pack.name} (${pack.price})`,
              name_localizations: { pl: `${pack.name} (${pack.price})` },
              value: pack.key,
            });
          }

          return option;
        })
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('How many packs to buy')
            .setDescriptionLocalizations({ pl: 'Ile paczek kupic' })
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(25)
        );

      return sub;
    }),

  async execute(interaction) {
    const t = getT(interaction.locale);
    const subcommand = interaction.options.getSubcommand();

    await ensureUser(interaction.user.id, interaction.guildId);
    await ensurePackInventoryTable();

    if (subcommand === 'view') {
      const ownedPacks = await getOwnedPackCounts(interaction.user.id, interaction.guildId);
      const lines = PACK_TYPES.map(pack =>
        t('shop.pack_line', {
          name: pack.name,
          price: pack.price,
          cards: pack.cards,
          owned: ownedPacks[pack.key] ?? 0,
          description: pack.description,
        })
      );

      const embed = new EmbedBuilder()
        .setTitle(t('shop.title'))
        .setDescription(lines.join('\n\n'))
        .setColor(0xF59E0B);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'buy') {
      const packKey = interaction.options.getString('pack');
      const amount = interaction.options.getInteger('amount');
      const pack = getPackConfig(packKey);
      const result = await buyPack(interaction.user.id, interaction.guildId, packKey, amount);

      if (result.error === 'insufficient_funds') {
        return interaction.reply({
          content: t('shop.no_funds', { totalPrice: result.totalPrice }),
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: t('shop.buy_success', {
          amount,
          packName: pack.name,
          totalPrice: result.totalPrice,
          balance: result.balance,
        }),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
