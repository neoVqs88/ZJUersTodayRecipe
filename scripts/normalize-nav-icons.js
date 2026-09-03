const fs = require('fs');
const path = require('path');

const iconNames = ['home', 'discover', 'calendar', 'community', 'health', 'profile'];
const iconDir = path.resolve(__dirname, '../static/figma');

function readPaths(source) {
  const seen = new Set();
  const paths = [];
  const pathPattern = /<path\b([^>]*)\/?\s*>/g;
  let match;
  while ((match = pathPattern.exec(source))) {
    const attributes = match[1];
    const data = attributes.match(/\bd="([^"]+)"/);
    if (!data || seen.has(data[1])) continue;
    seen.add(data[1]);
    paths.push({
      data: data[1],
      fillRule: (attributes.match(/\bfill-rule="([^"]+)"/) || [])[1],
      clipRule: (attributes.match(/\bclip-rule="([^"]+)"/) || [])[1],
    });
  }
  return paths;
}

function renderIcon(name, viewBox, paths, color, background) {
  const usesFineOutline = name === 'home' || name === 'discover';
  const body = paths.map((item) => {
    const fillRule = item.fillRule ? ` fill-rule="${item.fillRule}"` : '';
    const clipRule = item.clipRule ? ` clip-rule="${item.clipRule}"` : '';
    const stroke = usesFineOutline
      ? ` stroke="${color}" stroke-width="0.75"`
      : ` stroke="${background}" stroke-width="0.8"`;
    return `<path${fillRule}${clipRule} d="${item.data}" fill="${color}"${stroke} stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('\n');
  return `<svg width="18" height="18" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">\n${body}\n</svg>\n`;
}

iconNames.forEach((name) => {
  const normalPath = path.join(iconDir, `nav-${name}.svg`);
  const source = fs.readFileSync(normalPath, 'utf8');
  const viewBox = (source.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 18 18';
  const paths = readPaths(source);
  if (!paths.length) throw new Error(`No vector path found in ${normalPath}`);
  fs.writeFileSync(normalPath, renderIcon(name, viewBox, paths, '#1D2118', '#E7EEE4'));
  fs.writeFileSync(path.join(iconDir, `nav-${name}-active.svg`), renderIcon(name, viewBox, paths, '#FF6B4A', '#FFFCF6'));
});
