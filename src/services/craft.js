const { getTierData, MAX_TIER } = require('./rarity');

const MIN_TARGET_TIER = 2;
const MAX_TARGET_TIER = MAX_TIER;

function getSourceCount(targetTier) {
  if (targetTier <= 8) return 5;
  if (targetTier <= 14) return 4;
  return 3;
}

function getCraftRecipe(targetTier) {
  if (targetTier < MIN_TARGET_TIER || targetTier > MAX_TARGET_TIER) return null;

  const target = getTierData(targetTier);
  if (!target) return null;

  const source = getTierData(targetTier - 1);
  if (!source) return null;

  return {
    sourceTier: source.tier,
    sourceTierName: source.name,
    sourceCount: getSourceCount(targetTier),
    coinCost: Math.round(target.baseValue * 0.5),
    targetTier: target.tier,
    targetTierName: target.name,
    targetBaseValue: target.baseValue,
  };
}

function getAllCraftRecipes() {
  const recipes = [];
  for (let tier = MIN_TARGET_TIER; tier <= MAX_TARGET_TIER; tier++) {
    const recipe = getCraftRecipe(tier);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

module.exports = { getCraftRecipe, getAllCraftRecipes, MIN_TARGET_TIER, MAX_TARGET_TIER };
