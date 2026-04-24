const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { openSelectedPack } = require('../services/pack');
const { generateCard } = require('../services/card');
const { getT } = require('../services/i18n');
const { PACK_TYPES } = require('../services/shop');

const MAX_SUMMARY_LINES = 12;
const MAX_SLIDER_PACKS = 5;
const MAX_BULK_HIGHLIGHTS = 10;

function buildNavigationRow(currentIndex, totalCards, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:prev`)
      .setLabel('◀ Poprzednia')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${baseId}:next`)
      .setLabel('Następna ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentIndex === totalCards - 1)
  );
}

function buildSummary(cards) {
  const visibleCards = cards.slice(0, MAX_SUMMARY_LINES);
  const lines = visibleCards.map((card, index) =>
    `${index + 1}. #${card.cardId} - **${card.pickedUser.username}** - ${card.tierInfo.name}`
  );

  if (cards.length > MAX_SUMMARY_LINES) {
    lines.push(`... i jeszcze **${cards.length - MAX_SUMMARY_LINES}** kolejnych kart.`);
  }

  return lines.join('\n');
}

function buildBulkBreakdown(cards) {
  const counts = new Map();

  for (const card of cards) {
    const current = counts.get(card.tierInfo.name) ?? 0;
    counts.set(card.tierInfo.name, current + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([name, count]) => `- ${name}: **${count}**`)
    .join('\n');
}

function buildBulkHighlights(cards) {
  return [...cards]
    .sort((left, right) => {
      if (right.tierInfo.tier !== left.tierInfo.tier) {
        return right.tierInfo.tier - left.tierInfo.tier;
      }
      return left.cardId - right.cardId;
    })
    .slice(0, MAX_BULK_HIGHLIGHTS)
    .map((card, index) => `${index + 1}. #${card.cardId} - **${card.pickedUser.username}** - ${card.tierInfo.name} (T${card.tierInfo.tier})`)
    .join('\n');
}

function buildPackContent(t, cards, currentIndex, pack, packAmount, packsLeft) {
  const currentCard = cards[currentIndex];
  const summary = buildSummary(cards);

  return `${t('open.success', {
    packName: pack.name,
    packAmount,
    count: cards.length,
    packsLeft,
  })}

Aktualna karta: **${currentIndex + 1}/${cards.length}**
#${currentCard.cardId} - **${currentCard.pickedUser.username}** - ${currentCard.tierInfo.name} (T${currentCard.tierInfo.tier})

Podsumowanie pulli:
${summary}`;
}

function buildBulkContent(t, cards, pack, packAmount, packsLeft) {
  const bestCard = [...cards].sort((left, right) => right.tierInfo.tier - left.tierInfo.tier || left.cardId - right.cardId)[0];
  const highlights = buildBulkHighlights(cards);
  const breakdown = buildBulkBreakdown(cards);

  return `${t('open.success', {
    packName: pack.name,
    packAmount,
    count: cards.length,
    packsLeft,
  })}

Tryb zbiorczy: otworzono **${packAmount}** paczek naraz.
Najlepsza karta:
#${bestCard.cardId} - **${bestCard.pickedUser.username}** - ${bestCard.tierInfo.name} (T${bestCard.tierInfo.tier})

Top pulli:
${highlights}

Rozklad tierow:
${breakdown}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open a selected card pack')
    .setDescriptionLocalizations({ pl: 'Otworz wybrana paczke kart' })
    .addStringOption(option => {
      option
        .setName('pack')
        .setDescription('Pack type to open')
        .setDescriptionLocalizations({ pl: 'Typ paczki do otwarcia' });

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
      option
        .setName('amount')
        .setDescription('How many packs to open at once')
        .setDescriptionLocalizations({ pl: 'Ile paczek otworzyc naraz' })
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const t = getT(interaction.locale);
    const packKey = interaction.options.getString('pack') ?? 'basic';
    const amount = interaction.options.getInteger('amount') ?? 1;

    const result = await openSelectedPack(
      interaction.user.id,
      interaction.guildId,
      interaction.guild,
      packKey,
      amount
    );

    if (result.error === 'no_config') {
      return interaction.editReply(t('open.no_config'));
    }
    if (result.error === 'no_packs') {
      const time = result.nextPackAt
        ? `<t:${Math.floor(new Date(result.nextPackAt).getTime() / 1000)}:R>`
        : t('balance.now');
      return interaction.editReply(t('open.no_packs', {
        packName: result.pack.name,
        count: result.requestedAmount,
        time,
      }));
    }
    if (result.error === 'no_owned_pack') {
      return interaction.editReply(t('open.no_owned_pack', {
        packName: result.pack.name,
        count: result.requestedAmount,
      }));
    }
    if (result.error === 'no_members') {
      return interaction.editReply(t('open.no_members'));
    }

    if (result.packAmount > MAX_SLIDER_PACKS) {
      const bestCard = [...result.pulls].sort((left, right) =>
        right.tierInfo.tier - left.tierInfo.tier || left.cardId - right.cardId
      )[0];

      const bestCardBuffer = await generateCard(
        bestCard.pickedUser.id,
        bestCard.avatarURL,
        bestCard.pickedUser.username,
        interaction.guild.name,
        bestCard.tierInfo.tier
      );

      return interaction.editReply({
        content: buildBulkContent(t, result.pulls, result.pack, result.packAmount, result.packsLeft),
        files: [
          new AttachmentBuilder(bestCardBuffer, {
            name: 'best-card.png',
          }),
        ],
        components: [],
      });
    }

    const renderedCards = await Promise.all(
      result.pulls.map(async pull => ({
        ...pull,
        buffer: await generateCard(
          pull.pickedUser.id,
          pull.avatarURL,
          pull.pickedUser.username,
          interaction.guild.name,
          pull.tierInfo.tier
        ),
      }))
    );

    const baseId = `open:${interaction.id}`;
    let currentIndex = 0;

    const buildReplyPayload = () => ({
      content: buildPackContent(
        t,
        renderedCards,
        currentIndex,
        result.pack,
        result.packAmount,
        result.packsLeft
      ),
      files: [
        new AttachmentBuilder(renderedCards[currentIndex].buffer, {
          name: `card-${currentIndex + 1}.png`,
        }),
      ],
      components: [buildNavigationRow(currentIndex, renderedCards.length, baseId)],
    });

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
          content: 'Tylko osoba otwierajaca paczke moze przewijac te karty.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (buttonInteraction.customId.endsWith(':prev') && currentIndex > 0) {
        currentIndex -= 1;
      }

      if (buttonInteraction.customId.endsWith(':next') && currentIndex < renderedCards.length - 1) {
        currentIndex += 1;
      }

      await buttonInteraction.update(buildReplyPayload());
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
