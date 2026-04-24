const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const { generateCard } = require('../services/card');
const { getT } = require('../services/i18n');

const LIST_PAGE_SIZE = 10;

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

function buildListNavigationRow(listPageIndex, totalListPages, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:list-prev`)
      .setLabel('◀ Spis')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(listPageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${baseId}:list-next`)
      .setLabel('Spis ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(listPageIndex === totalListPages - 1)
  );
}

function buildInventoryContent(t, card, username, currentIndex, total, cards, listPageIndex, totalListPages) {
  const tier = getTierData(card.rarity);
  const listStart = listPageIndex * LIST_PAGE_SIZE;
  const listCards = cards.slice(listStart, listStart + LIST_PAGE_SIZE);
  const listLines = listCards.map((listCard, index) => {
    const listTier = getTierData(listCard.rarity);
    const marker = listStart + index === currentIndex ? '>' : ' ';
    return `${marker} #${listCard.id} - **${listCard.cardUsername}** - ${listTier.name} (T${listCard.rarity}) - ${listTier.baseValue}`;
  }).join('\n');

  return `${t('inventory.title', { username })}

Karta: **${currentIndex + 1}/${total}**
#${card.id} - **${card.cardUsername}** - ${tier.name} (T${card.rarity})
Cena bazowa: **${tier.baseValue}**

Wlasciciel karty: <@${card.card_user_id}>
Uzyj \`/sell id:${card.id}\` aby sprzedac albo \`/market list card_id:${card.id} price:<cena>\` aby wystawic ja na gielde.

Spis kart: **${listPageIndex + 1}/${totalListPages}**
${listLines}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Browse your cards')
    .setDescriptionLocalizations({ pl: 'Przeglądaj swoje karty' })
    .addIntegerOption(o =>
      o.setName('page')
        .setDescription('Page number')
        .setDescriptionLocalizations({ pl: 'Numer strony' })
        .setMinValue(1)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = getT(interaction.locale);
    const requestedPage = interaction.options.getInteger('page') ?? 1;

    const { rows } = await pool.query(
      `SELECT id, card_user_id, rarity
       FROM inventory
       WHERE owner_id=$1 AND guild_id=$2
       ORDER BY rarity DESC, obtained_at DESC`,
      [interaction.user.id, interaction.guildId]
    );

    if (!rows.length) {
      return interaction.editReply({ content: t('inventory.empty') });
    }

    const cards = await Promise.all(rows.map(async row => {
      let user;
      try {
        user = await interaction.client.users.fetch(row.card_user_id);
      } catch {
        user = null;
      }

      return {
        ...row,
        cardUsername: user?.username ?? `User ${row.card_user_id}`,
        avatarURL: user
          ? user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 })
          : null,
      };
    }));

    let currentIndex = Math.min(Math.max(requestedPage - 1, 0), cards.length - 1);
    let listPageIndex = Math.floor(currentIndex / LIST_PAGE_SIZE);
    const totalListPages = Math.max(1, Math.ceil(cards.length / LIST_PAGE_SIZE));
    const baseId = `inventory:${interaction.id}`;

    const buildReplyPayload = async () => {
      const currentCard = cards[currentIndex];
      const buffer = await generateCard(
        currentCard.card_user_id,
        currentCard.avatarURL ?? `https://cdn.discordapp.com/embed/avatars/${currentIndex % 5}.png`,
        currentCard.cardUsername,
        interaction.guild.name,
        currentCard.rarity
      );

      return {
        content: buildInventoryContent(
          t,
          currentCard,
          interaction.user.username,
          currentIndex,
          cards.length,
          cards,
          listPageIndex,
          totalListPages
        ),
        files: [
          new AttachmentBuilder(buffer, {
            name: `inventory-card-${currentCard.id}.png`,
          }),
        ],
        components: [
          buildNavigationRow(currentIndex, cards.length, baseId),
          buildListNavigationRow(listPageIndex, totalListPages, baseId),
        ],
      };
    };

    const message = await interaction.editReply({
      ...await buildReplyPayload(),
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async buttonInteraction => {
      if (!buttonInteraction.customId.startsWith(baseId)) return;

      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: t('inventory.only_owner'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (buttonInteraction.customId.endsWith(':prev') && currentIndex > 0) {
        currentIndex -= 1;
        listPageIndex = Math.floor(currentIndex / LIST_PAGE_SIZE);
      }

      if (buttonInteraction.customId.endsWith(':next') && currentIndex < cards.length - 1) {
        currentIndex += 1;
        listPageIndex = Math.floor(currentIndex / LIST_PAGE_SIZE);
      }

      if (buttonInteraction.customId.endsWith(':list-prev') && listPageIndex > 0) {
        listPageIndex -= 1;
      }

      if (buttonInteraction.customId.endsWith(':list-next') && listPageIndex < totalListPages - 1) {
        listPageIndex += 1;
      }

      await buttonInteraction.update(await buildReplyPayload());
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
