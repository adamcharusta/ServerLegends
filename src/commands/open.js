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
const pool = require('../db/pool');
const { getTierData } = require('../services/rarity');
const en = require('../../locales/en-US/translation.json');
const pl = require('../../locales/pl/translation.json');

const MAX_SUMMARY_LINES = 12;
const MAX_SLIDER_PACKS = 5;
const MAX_BULK_HIGHLIGHTS = 10;

function getPackName(t, pack) {
  return t(`packs.${pack.key}.name`, { defaultValue: pack.key });
}

function buildNavigationRow(t, currentIndex, totalCards, baseId) {
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
      .setDisabled(currentIndex === totalCards - 1)
  );
}

function buildSellRow(t, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:sell`)
      .setLabel(t('open.sell_pack_button'))
      .setStyle(ButtonStyle.Danger)
  );
}

function buildSellConfirmRow(t, baseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${baseId}:sell:confirm`)
      .setLabel(t('open.sell_pack_confirm_yes'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${baseId}:sell:cancel`)
      .setLabel(t('open.sell_pack_confirm_no'))
      .setStyle(ButtonStyle.Secondary)
  );
}

async function sellPackCards(userId, guildId, cardIds) {
  if (!cardIds.length) return { soldCount: 0, earned: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleteRes = await client.query(
      `DELETE FROM inventory
        WHERE owner_id = $1 AND guild_id = $2
          AND id = ANY($3::int[])
          AND NOT EXISTS (SELECT 1 FROM market_listings m WHERE m.inventory_id = inventory.id)
        RETURNING rarity`,
      [userId, guildId, cardIds]
    );
    const soldCount = deleteRes.rows.length;
    const earned = deleteRes.rows.reduce((sum, r) => sum + getTierData(r.rarity).baseValue, 0);
    if (soldCount > 0) {
      await client.query(
        `UPDATE users SET balance = balance + $1 WHERE user_id = $2 AND guild_id = $3`,
        [earned, userId, guildId]
      );
    }
    await client.query('COMMIT');
    return { soldCount, earned };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function buildSummary(t, cards) {
  const visibleCards = cards.slice(0, MAX_SUMMARY_LINES);
  const lines = visibleCards.map((card, index) =>
    `${index + 1}. #${card.cardId} - **${card.pickedUser.username}** - ${card.tierInfo.name}`
  );

  if (cards.length > MAX_SUMMARY_LINES) {
    lines.push(t('open.more_cards', { count: cards.length - MAX_SUMMARY_LINES }));
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
  const summary = buildSummary(t, cards);

  return `${t('open.success', {
    packName: getPackName(t, pack),
    packAmount,
    count: cards.length,
    packsLeft,
  })}

${t('open.current_card', { current: currentIndex + 1, total: cards.length })}
#${currentCard.cardId} - **${currentCard.pickedUser.username}** - ${currentCard.tierInfo.name} (T${currentCard.tierInfo.tier})

${t('open.pull_summary')}
${summary}`;
}

function buildBulkContent(t, cards, pack, packAmount, packsLeft) {
  const bestCard = [...cards].sort((left, right) => right.tierInfo.tier - left.tierInfo.tier || left.cardId - right.cardId)[0];
  const highlights = buildBulkHighlights(cards);
  const breakdown = buildBulkBreakdown(cards);

  return `${t('open.success', {
    packName: getPackName(t, pack),
    packAmount,
    count: cards.length,
    packsLeft,
  })}

${t('open.bulk_mode', { packAmount })}
${t('open.best_card')}
#${bestCard.cardId} - **${bestCard.pickedUser.username}** - ${bestCard.tierInfo.name} (T${bestCard.tierInfo.tier})

${t('open.top_pulls')}
${highlights}

${t('open.tier_breakdown')}
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
          name: `${en.packs[pack.key].name} (${pack.price})`,
          name_localizations: { pl: `${pl.packs[pack.key].name} (${pack.price})` },
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
        packName: getPackName(t, result.pack),
        count: result.requestedAmount,
        time,
      }));
    }
    if (result.error === 'no_owned_pack') {
      return interaction.editReply(t('open.no_owned_pack', {
        packName: getPackName(t, result.pack),
        count: result.requestedAmount,
      }));
    }
    if (result.error === 'no_members') {
      return interaction.editReply(t('open.no_members'));
    }

    const baseId = `open:${interaction.id}`;
    const cardIds = result.pulls.map(pull => pull.cardId);
    const totalSellValue = result.pulls.reduce((sum, pull) => sum + pull.tierInfo.baseValue, 0);

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

      const baseContent = buildBulkContent(t, result.pulls, result.pack, result.packAmount, result.packsLeft);

      const message = await interaction.editReply({
        content: baseContent,
        files: [
          new AttachmentBuilder(bestCardBuffer, {
            name: 'best-card.png',
          }),
        ],
        components: [buildSellRow(t, baseId)],
        fetchReply: true,
      });

      const collector = message.createMessageComponentCollector({
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async buttonInteraction => {
        if (!buttonInteraction.customId.startsWith(baseId)) return;
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: t('open.only_owner'),
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (buttonInteraction.customId === `${baseId}:sell`) {
          await buttonInteraction.update({
            content: `${baseContent}\n\n${t('open.sell_pack_confirm', { count: cardIds.length, value: totalSellValue })}`,
            components: [buildSellConfirmRow(t, baseId)],
          });
          return;
        }

        if (buttonInteraction.customId === `${baseId}:sell:cancel`) {
          await buttonInteraction.update({
            content: baseContent,
            components: [buildSellRow(t, baseId)],
          });
          return;
        }

        if (buttonInteraction.customId === `${baseId}:sell:confirm`) {
          const { soldCount, earned } = await sellPackCards(interaction.user.id, interaction.guildId, cardIds);
          const successText = soldCount === 0
            ? t('open.sell_pack_none')
            : t('open.sell_pack_success', { count: soldCount, value: earned });
          await buttonInteraction.update({
            content: `${baseContent}\n\n${successText}`,
            components: [],
          });
          collector.stop();
        }
      });

      collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
      });

      return;
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

    let currentIndex = 0;
    let confirmMode = false;

    const buildReplyPayload = () => {
      const baseContent = buildPackContent(
        t,
        renderedCards,
        currentIndex,
        result.pack,
        result.packAmount,
        result.packsLeft
      );
      const file = new AttachmentBuilder(renderedCards[currentIndex].buffer, {
        name: `card-${currentIndex + 1}.png`,
      });
      if (confirmMode) {
        return {
          content: `${baseContent}\n\n${t('open.sell_pack_confirm', { count: cardIds.length, value: totalSellValue })}`,
          files: [file],
          components: [buildSellConfirmRow(t, baseId)],
        };
      }
      return {
        content: baseContent,
        files: [file],
        components: [
          buildNavigationRow(t, currentIndex, renderedCards.length, baseId),
          buildSellRow(t, baseId),
        ],
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
          content: t('open.only_owner'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (buttonInteraction.customId === `${baseId}:prev` && currentIndex > 0) {
        currentIndex -= 1;
        await buttonInteraction.update(buildReplyPayload());
        return;
      }

      if (buttonInteraction.customId === `${baseId}:next` && currentIndex < renderedCards.length - 1) {
        currentIndex += 1;
        await buttonInteraction.update(buildReplyPayload());
        return;
      }

      if (buttonInteraction.customId === `${baseId}:sell`) {
        confirmMode = true;
        await buttonInteraction.update(buildReplyPayload());
        return;
      }

      if (buttonInteraction.customId === `${baseId}:sell:cancel`) {
        confirmMode = false;
        await buttonInteraction.update(buildReplyPayload());
        return;
      }

      if (buttonInteraction.customId === `${baseId}:sell:confirm`) {
        const { soldCount, earned } = await sellPackCards(interaction.user.id, interaction.guildId, cardIds);
        const baseContent = buildPackContent(
          t,
          renderedCards,
          currentIndex,
          result.pack,
          result.packAmount,
          result.packsLeft
        );
        const successText = soldCount === 0
          ? t('open.sell_pack_none')
          : t('open.sell_pack_success', { count: soldCount, value: earned });
        await buttonInteraction.update({
          content: `${baseContent}\n\n${successText}`,
          files: [
            new AttachmentBuilder(renderedCards[currentIndex].buffer, {
              name: `card-${currentIndex + 1}.png`,
            }),
          ],
          components: [],
        });
        collector.stop();
      }
    });

    collector.on('end', async () => {
      await interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
