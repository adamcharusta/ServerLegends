const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const pool = require('../db/pool');
const { ensureUser } = require('../services/pack');
const { TIERS, MAX_TIER, rollRarity, getTierData } = require('../services/rarity');
const { generateCard } = require('../services/card');
const { requireDev } = require('../utils/devGuard');
const { generateMockAvatar } = require('../utils/mockAvatar');
const { getT } = require('../services/i18n');

const MOCK_USERS = [
  { id: '1', username: 'Alice Dev', displayName: 'Alice' },
  { id: '2', username: 'Bob Tester', displayName: 'Bob' },
  { id: '3', username: 'Carol QA', displayName: 'Carol' },
  { id: '4', username: 'Dave Sandbox', displayName: 'Dave' },
  { id: '5', username: 'Eve Mock', displayName: 'Eve' },
  { id: '6', username: 'Frank Fake', displayName: 'Frank' },
  { id: '7', username: 'Grace Test', displayName: 'Grace' },
  { id: '8', username: 'Hank Debug', displayName: 'Hank' },
];

const PREVIEW_TIER_COUNT = TIERS.length;

function buildPreviewRow(t, currentIndex, totalCards, baseId) {
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

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName('dev')
    .setDescription('[DEV] Testing tools')
    .addSubcommand(s =>
      s.setName('give-packs')
        .setDescription('Add packs to your account')
        .addIntegerOption(o =>
          o.setName('count').setDescription('Number of packs').setRequired(true).setMinValue(1).setMaxValue(100)
        )
    )
    .addSubcommand(s =>
      s.setName('give-coins')
        .setDescription('Add coins to your account')
        .addIntegerOption(o =>
          o.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1).setMaxValue(1_000_000)
        )
    )
    .addSubcommand(s =>
      s.setName('reset-cooldown')
        .setDescription('Reset pack cooldown (next_pack_at -> now)')
    )
    .addSubcommand(s =>
      s.setName('give-card')
        .setDescription('Add a card of a specific tier to your inventory')
        .addUserOption(o =>
          o.setName('user').setDescription('Member whose card to generate').setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('tier').setDescription(`Rarity tier (1-${MAX_TIER}, omit for random)`).setMinValue(1).setMaxValue(MAX_TIER)
        )
    )
    .addSubcommand(s =>
      s.setName('wipe-inventory')
        .setDescription('Delete all cards from your inventory')
    )
    .addSubcommand(s =>
      s.setName('seed-users')
        .setDescription('Add cards from mock test users to your inventory')
        .addIntegerOption(o =>
          o.setName('count').setDescription('Number of cards to generate (default: 8)').setMinValue(1).setMaxValue(40)
        )
        .addIntegerOption(o =>
          o.setName('tier').setDescription(`Force a specific tier (omit for random, max ${MAX_TIER})`).setMinValue(1).setMaxValue(MAX_TIER)
        )
    )
    .addSubcommand(s =>
      s.setName('preview-card')
        .setDescription('Preview a card for a specific mock user')
        .addIntegerOption(o =>
          o.setName('mock_id').setDescription('Mock user index 1-8').setRequired(true).setMinValue(1).setMaxValue(8)
        )
        .addIntegerOption(o =>
          o.setName('tier').setDescription(`Rarity tier (omit for random, max ${MAX_TIER})`).setMinValue(1).setMaxValue(MAX_TIER)
        )
    )
    .addSubcommand(s =>
      s.setName('preview-all')
        .setDescription('Preview all card styles for a selected user')
        .addUserOption(o =>
          o.setName('user').setDescription('Member whose card styles to preview').setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('status')
        .setDescription('Show your current dev account state')
    ),

  async execute(interaction) {
    if (!await requireDev(interaction)) return;

    const t = getT(interaction.locale);
    const sub = interaction.options.getSubcommand();
    await ensureUser(interaction.user.id, interaction.guildId);

    if (sub === 'give-packs') {
      const count = interaction.options.getInteger('count');
      await pool.query(
        `UPDATE users SET packs_available = packs_available + $1 WHERE user_id=$2 AND guild_id=$3`,
        [count, interaction.user.id, interaction.guildId]
      );
      return interaction.reply({ content: t('dev.give_packs_success', { count }), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'give-coins') {
      const amount = interaction.options.getInteger('amount');
      await pool.query(
        `UPDATE users SET balance = balance + $1 WHERE user_id=$2 AND guild_id=$3`,
        [amount, interaction.user.id, interaction.guildId]
      );
      return interaction.reply({ content: t('dev.give_coins_success', { amount }), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'reset-cooldown') {
      await pool.query(
        `UPDATE users SET next_pack_at = NULL WHERE user_id=$1 AND guild_id=$2`,
        [interaction.user.id, interaction.guildId]
      );
      return interaction.reply({ content: t('dev.cooldown_reset'), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'give-card') {
      const target = interaction.options.getUser('user');
      const tierInput = interaction.options.getInteger('tier');
      const tierInfo = tierInput ? getTierData(tierInput) : rollRarity();

      const { rows } = await pool.query(
        `INSERT INTO inventory (owner_id, guild_id, card_user_id, rarity)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [interaction.user.id, interaction.guildId, target.id, tierInfo.tier]
      );

      return interaction.reply({
        content: t('dev.give_card_success', {
          id: rows[0].id,
          username: target.username,
          tierName: tierInfo.name,
          tier: tierInfo.tier,
          value: tierInfo.baseValue,
        }),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'wipe-inventory') {
      const { rowCount } = await pool.query(
        `DELETE FROM inventory WHERE owner_id=$1 AND guild_id=$2`,
        [interaction.user.id, interaction.guildId]
      );
      return interaction.reply({ content: t('dev.wipe_success', { count: rowCount }), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'status') {
      const { rows } = await pool.query(
        `SELECT balance, packs_available, next_pack_at FROM users WHERE user_id=$1 AND guild_id=$2`,
        [interaction.user.id, interaction.guildId]
      );
      const { rows: inv } = await pool.query(
        `SELECT rarity, COUNT(*) AS cnt FROM inventory WHERE owner_id=$1 AND guild_id=$2 GROUP BY rarity ORDER BY rarity DESC`,
        [interaction.user.id, interaction.guildId]
      );

      const row = rows[0];
      const ts = row.next_pack_at ? Math.floor(new Date(row.next_pack_at).getTime() / 1000) : null;

      const breakdown = inv.length
        ? inv.map(r => `T${r.rarity} (${getTierData(r.rarity).name}): ${r.cnt}`).join('\n')
        : t('dev.empty');

      const embed = new EmbedBuilder()
        .setTitle(t('dev.status_title'))
        .addFields(
          { name: t('dev.field_coins'), value: `${row.balance}`, inline: true },
          { name: t('dev.field_packs'), value: `${row.packs_available}`, inline: true },
          { name: t('dev.field_next_pack_at'), value: ts ? `<t:${ts}:R>` : t('balance.now'), inline: true },
          { name: t('dev.field_inventory_breakdown'), value: breakdown }
        )
        .setColor(0x00FF99);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'seed-users') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const count = interaction.options.getInteger('count') ?? MOCK_USERS.length;
      const tierInput = interaction.options.getInteger('tier');
      const added = [];

      for (let i = 0; i < count; i++) {
        const mock = MOCK_USERS[i % MOCK_USERS.length];
        const tierInfo = tierInput ? getTierData(tierInput) : rollRarity();

        const { rows } = await pool.query(
          `INSERT INTO inventory (owner_id, guild_id, card_user_id, rarity)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [interaction.user.id, interaction.guildId, mock.id, tierInfo.tier]
        );

        added.push({ id: rows[0].id, mock, tierInfo });
      }

      const lines = added.map(e => `\`#${e.id}\` **${e.mock.username}** - ${e.tierInfo.name} T${e.tierInfo.tier}`);

      const embed = new EmbedBuilder()
        .setTitle(t('dev.seed_title', { count: added.length }))
        .setDescription(lines.join('\n'))
        .setColor(0x00FF99);

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'preview-card') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const mockIndex = interaction.options.getInteger('mock_id') - 1;
      const tierInput = interaction.options.getInteger('tier');
      const mock = MOCK_USERS[mockIndex];
      const tierInfo = tierInput ? getTierData(tierInput) : rollRarity();

      const avatarBuffer = generateMockAvatar(mock.username);
      const cardBuffer = await generateCard(mock.id, avatarBuffer, mock.username, interaction.guild.name, tierInfo.tier);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'card.png' });

      return interaction.editReply({
        content: t('dev.preview_card', {
          username: mock.username,
          tierName: tierInfo.name,
          tier: tierInfo.tier,
          value: tierInfo.baseValue,
        }),
        files: [attachment],
      });
    }

    if (sub === 'preview-all') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const target = interaction.options.getUser('user');
      const avatarURL = target.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
      const previews = await Promise.all(
        Array.from({ length: PREVIEW_TIER_COUNT }, async (_, index) => {
          const tier = index + 1;
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

      const baseId = `dev-preview-all:${interaction.id}`;
      let currentIndex = 0;

      const buildReplyPayload = () => {
        const current = previews[currentIndex];
        return {
          content: t('dev.preview_all', {
            username: target.username,
            tierName: current.tierInfo.name,
            tier: current.tier,
            value: current.tierInfo.baseValue,
            current: currentIndex + 1,
            total: previews.length,
          }),
          files: [
            new AttachmentBuilder(current.buffer, {
              name: `preview-${target.id}-tier-${current.tier}.png`,
            }),
          ],
          components: [buildPreviewRow(t, currentIndex, previews.length, baseId)],
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
            content: t('dev.preview_only_owner'),
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
    }
  },
};
