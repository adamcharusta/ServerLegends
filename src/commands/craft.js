const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const pool = require('../db/pool');
const { getCraftRecipe, getAllCraftRecipes, MIN_TARGET_TIER, MAX_TARGET_TIER } = require('../services/craft');
const { generateCard } = require('../services/card');
const { ensureUser } = require('../services/pack');
const { getT } = require('../services/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Upgrade a chosen player\'s card to a higher tier')
    .setDescriptionLocalizations({ pl: 'Ulepsz karte wybranego gracza do wyzszego tieru' })
    .addSubcommand(sub =>
      sub.setName('recipes')
        .setDescription('List all crafting recipes')
        .setDescriptionLocalizations({ pl: 'Pokaz wszystkie receptury' })
    )
    .addSubcommand(sub =>
      sub.setName('do')
        .setDescription('Craft a higher-tier card of a chosen player')
        .setDescriptionLocalizations({ pl: 'Skraftuj karte wybranego gracza wyzszego tieru' })
        .addUserOption(o =>
          o.setName('user')
            .setDescription('Player whose card to upgrade')
            .setDescriptionLocalizations({ pl: 'Gracz, ktorego karte ulepszysz' })
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('tier')
            .setDescription('Target tier to craft')
            .setDescriptionLocalizations({ pl: 'Docelowy tier do skraftowania' })
            .setRequired(true)
            .setMinValue(MIN_TARGET_TIER)
            .setMaxValue(MAX_TARGET_TIER)
        )
    ),

  async execute(interaction) {
    const t = getT(interaction.locale);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'recipes') {
      const recipes = getAllCraftRecipes();
      const targetWidth = Math.max(...recipes.map(r => r.targetTierName.length));
      const sourceWidth = Math.max(...recipes.map(r => r.sourceTierName.length));
      const costWidth = Math.max(...recipes.map(r => String(r.coinCost).length));

      const headerTarget = t('craft.col_target');
      const headerSource = t('craft.col_source');
      const headerCost = t('craft.col_cost');
      const headerValue = t('craft.col_value');
      const targetCol = Math.max(targetWidth + 4, headerTarget.length);
      const sourceCol = Math.max(sourceWidth + 6, headerSource.length);
      const costCol = Math.max(costWidth + 1, headerCost.length);

      const header = `${headerTarget.padEnd(targetCol)}  ${headerSource.padEnd(sourceCol)}  ${headerCost.padStart(costCol)}  ${headerValue}`;
      const divider = '-'.repeat(header.length);
      const rows = recipes.map(r => {
        const target = `T${String(r.targetTier).padStart(2)} ${r.targetTierName}`.padEnd(targetCol);
        const source = `${r.sourceCount}x T${String(r.sourceTier).padStart(2)} ${r.sourceTierName}`.padEnd(sourceCol);
        const cost = String(r.coinCost).padStart(costCol);
        return `${target}  ${source}  ${cost}  ${r.targetBaseValue}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(t('craft.recipes_title'))
        .setDescription([
          t('craft.recipes_intro'),
          '```',
          header,
          divider,
          ...rows,
          '```',
        ].join('\n'))
        .setFooter({ text: t('craft.recipes_footer') })
        .setColor(0x9C27B0);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cardUser = interaction.options.getUser('user');
    const targetTier = interaction.options.getInteger('tier');
    const recipe = getCraftRecipe(targetTier);

    if (!recipe) {
      return interaction.editReply({ content: t('craft.invalid_tier') });
    }
    if (cardUser.bot) {
      return interaction.editReply({ content: t('craft.bot_target') });
    }

    await ensureUser(interaction.user.id, interaction.guildId);

    const [cardsRes, balanceRes] = await Promise.all([
      pool.query(
        `SELECT i.id
           FROM inventory i
           LEFT JOIN market_listings m ON m.inventory_id = i.id
          WHERE i.owner_id = $1
            AND i.guild_id = $2
            AND i.rarity = $3
            AND i.card_user_id = $4
            AND m.id IS NULL
          ORDER BY i.obtained_at ASC
          LIMIT $5`,
        [interaction.user.id, interaction.guildId, recipe.sourceTier, cardUser.id, recipe.sourceCount]
      ),
      pool.query(
        `SELECT balance FROM users WHERE user_id=$1 AND guild_id=$2`,
        [interaction.user.id, interaction.guildId]
      ),
    ]);

    const balance = balanceRes.rows[0]?.balance ?? 0;
    const ownedSourceCount = cardsRes.rows.length;

    if (ownedSourceCount < recipe.sourceCount) {
      return interaction.editReply({
        content: t('craft.not_enough_cards', {
          have: ownedSourceCount,
          need: recipe.sourceCount,
          sourceTierName: recipe.sourceTierName,
          sourceTier: recipe.sourceTier,
          username: cardUser.username,
        }),
      });
    }

    if (balance < recipe.coinCost) {
      return interaction.editReply({
        content: t('craft.not_enough_coins', {
          have: balance,
          need: recipe.coinCost,
        }),
      });
    }

    const baseId = `craft:${interaction.id}`;
    const previewIds = cardsRes.rows.map(r => `#${r.id}`).join(', ');

    const message = await interaction.editReply({
      content: t('craft.preview', {
        sourceCount: recipe.sourceCount,
        sourceTierName: recipe.sourceTierName,
        sourceTier: recipe.sourceTier,
        coinCost: recipe.coinCost,
        targetTierName: recipe.targetTierName,
        targetTier: recipe.targetTier,
        username: cardUser.username,
        ids: previewIds,
      }),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${baseId}:confirm`)
            .setLabel(t('craft.confirm_button'))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${baseId}:cancel`)
            .setLabel(t('craft.cancel_button'))
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({
      time: 60 * 1000,
      max: 1,
    });

    collector.on('collect', async buttonInteraction => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: t('craft.only_owner'),
          flags: MessageFlags.Ephemeral,
        });
        collector.resetTimer();
        return;
      }

      if (buttonInteraction.customId.endsWith(':cancel')) {
        await buttonInteraction.update({ content: t('craft.cancelled'), components: [] });
        return;
      }

      const ids = cardsRes.rows.map(r => r.id);
      let newCardId;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const deleteRes = await client.query(
          `DELETE FROM inventory
            WHERE owner_id=$1
              AND guild_id=$2
              AND id = ANY($3::int[])
              AND rarity = $4
              AND card_user_id = $5
              AND NOT EXISTS (SELECT 1 FROM market_listings m WHERE m.inventory_id = inventory.id)
            RETURNING id`,
          [interaction.user.id, interaction.guildId, ids, recipe.sourceTier, cardUser.id]
        );

        if (deleteRes.rows.length < recipe.sourceCount) {
          await client.query('ROLLBACK');
          await buttonInteraction.update({ content: t('craft.materials_changed'), components: [] });
          return;
        }

        const updateRes = await client.query(
          `UPDATE users
              SET balance = balance - $1
            WHERE user_id=$2 AND guild_id=$3 AND balance >= $1
            RETURNING balance`,
          [recipe.coinCost, interaction.user.id, interaction.guildId]
        );

        if (!updateRes.rows.length) {
          await client.query('ROLLBACK');
          await buttonInteraction.update({
            content: t('craft.not_enough_coins', { have: balance, need: recipe.coinCost }),
            components: [],
          });
          return;
        }

        const insertRes = await client.query(
          `INSERT INTO inventory (owner_id, guild_id, card_user_id, rarity)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [interaction.user.id, interaction.guildId, cardUser.id, recipe.targetTier]
        );
        newCardId = insertRes.rows[0].id;

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const avatarURL = cardUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
      const buffer = await generateCard(
        cardUser.id,
        avatarURL,
        cardUser.username,
        interaction.guild.name,
        recipe.targetTier
      );

      await buttonInteraction.update({
        content: t('craft.success', {
          cardId: newCardId,
          targetTierName: recipe.targetTierName,
          targetTier: recipe.targetTier,
          username: cardUser.username,
          coinCost: recipe.coinCost,
          sourceCount: recipe.sourceCount,
          sourceTierName: recipe.sourceTierName,
        }),
        files: [new AttachmentBuilder(buffer, { name: `craft-${newCardId}.png` })],
        components: [],
      });
    });

    collector.on('end', async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({ content: t('craft.timeout'), components: [] }).catch(() => {});
      }
    });
  },
};
