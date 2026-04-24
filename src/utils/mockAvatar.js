const { createCanvas } = require('@napi-rs/canvas');

const COLORS = [
  ['#E53935', '#FFCDD2'],
  ['#8E24AA', '#E1BEE7'],
  ['#1E88E5', '#BBDEFB'],
  ['#00897B', '#B2DFDB'],
  ['#F4511E', '#FFCCBC'],
  ['#6D4C41', '#D7CCC8'],
  ['#3949AB', '#C5CAE9'],
  ['#039BE5', '#B3E5FC'],
];

function generateMockAvatar(name, size = 256) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const [bg, fg] = COLORS[name.charCodeAt(0) % COLORS.length];
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(size * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

module.exports = { generateMockAvatar };
