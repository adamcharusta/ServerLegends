const TIERS = [
  { tier: 1,  name: 'Common I',      color: '#9E9E9E', bgTop: '#424242', bgBottom: '#1A1A1A', baseValue: 10 },
  { tier: 2,  name: 'Common II',     color: '#BDBDBD', bgTop: '#4A4A4A', bgBottom: '#202020', baseValue: 20 },
  { tier: 3,  name: 'Uncommon I',    color: '#66BB6A', bgTop: '#1B5E20', bgBottom: '#0D2E10', baseValue: 35 },
  { tier: 4,  name: 'Uncommon II',   color: '#81C784', bgTop: '#2E7D32', bgBottom: '#163D18', baseValue: 55 },
  { tier: 5,  name: 'Rare I',        color: '#42A5F5', bgTop: '#0D47A1', bgBottom: '#062050', baseValue: 80 },
  { tier: 6,  name: 'Rare II',       color: '#64B5F6', bgTop: '#1565C0', bgBottom: '#0A3060', baseValue: 120 },
  { tier: 7,  name: 'Epic I',        color: '#AB47BC', bgTop: '#4A148C', bgBottom: '#220044', baseValue: 175 },
  { tier: 8,  name: 'Epic II',       color: '#CE93D8', bgTop: '#6A1B9A', bgBottom: '#340060', baseValue: 250 },
  { tier: 9,  name: 'Legendary I',   color: '#FFA726', bgTop: '#E65100', bgBottom: '#6D2400', baseValue: 350 },
  { tier: 10, name: 'Legendary II',  color: '#FFB74D', bgTop: '#F57C00', bgBottom: '#7A3D00', baseValue: 500 },
  { tier: 11, name: 'Mythic I',      color: '#EF5350', bgTop: '#B71C1C', bgBottom: '#580D0D', baseValue: 700 },
  { tier: 12, name: 'Mythic II',     color: '#E57373', bgTop: '#C62828', bgBottom: '#6B1414', baseValue: 950 },
  { tier: 13, name: 'Exotic I',      color: '#EC407A', bgTop: '#880E4F', bgBottom: '#400020', baseValue: 1300 },
  { tier: 14, name: 'Exotic II',     color: '#F48FB1', bgTop: '#AD1457', bgBottom: '#580028', baseValue: 1700 },
  { tier: 15, name: 'Ancient I',     color: '#26C6DA', bgTop: '#006064', bgBottom: '#002D30', baseValue: 2200 },
  { tier: 16, name: 'Ancient II',    color: '#80DEEA', bgTop: '#00838F', bgBottom: '#003D42', baseValue: 2800 },
  { tier: 17, name: 'Divine I',      color: '#FFD54F', bgTop: '#F57F17', bgBottom: '#7A3F00', baseValue: 3600 },
  { tier: 18, name: 'Divine II',     color: '#FFE082', bgTop: '#FF8F00', bgBottom: '#804800', baseValue: 4500 },
  { tier: 19, name: 'Transcendent',  color: '#B2FF59', bgTop: '#33691E', bgBottom: '#1A340F', baseValue: 6000 },
  { tier: 20, name: 'Valentine',     color: '#FF6FAE', bgTop: '#7D1148', bgBottom: '#2F091B', baseValue: 8500, event: true, theme: 'valentine' },
  { tier: 21, name: 'Easter',        color: '#9AF07A', bgTop: '#3A6B1A', bgBottom: '#162B09', baseValue: 8500, event: true, theme: 'easter' },
  { tier: 22, name: 'Halloween',    color: '#FF8C2A', bgTop: '#5A2300', bgBottom: '#1F0D00', baseValue: 8500, event: true, theme: 'halloween' },
  { tier: 23, name: 'Christmas',    color: '#7BE0D0', bgTop: '#0C4B40', bgBottom: '#06211C', baseValue: 8500, event: true, theme: 'christmas' },
  { tier: 24, name: 'Horse Day',    color: '#C69A6B', bgTop: '#5C3922', bgBottom: '#24140B', baseValue: 8500, event: true, theme: 'horse' },
  { tier: 25, name: 'Celestial',     color: '#E040FB', bgTop: '#4A0072', bgBottom: '#200030', baseValue: 10000, theme: 'celestial' },
];

const ROLLABLE_TIERS = TIERS.filter(tier => !tier.event);
const BASE_WEIGHTS = ROLLABLE_TIERS.map((_, i) => 10000 * Math.pow(0.6, i));
const MAX_TIER = TIERS.length;

function rollRarity(options = {}) {
  const weightMultiplier = options.weightMultiplier ?? (() => 1);
  const weights = ROLLABLE_TIERS.map((tier, index) =>
    Math.max(0, BASE_WEIGHTS[index] * weightMultiplier(tier))
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (totalWeight <= 0) {
    return ROLLABLE_TIERS[0];
  }

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ROLLABLE_TIERS[i];
  }
  return ROLLABLE_TIERS[0];
}

function getTierData(tier) {
  return TIERS.find(entry => entry.tier === tier);
}

module.exports = { TIERS, ROLLABLE_TIERS, MAX_TIER, rollRarity, getTierData };
