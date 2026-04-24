const { PermissionFlagsBits, MessageFlags } = require('discord.js');

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

async function requireAdmin(interaction) {
  if (isAdmin(interaction)) return true;
  const { getT } = require('../services/i18n');
  const t = getT(interaction.locale);
  await interaction.reply({ content: t('errors.no_permission'), flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { requireAdmin };
