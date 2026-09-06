const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = [
  '/mnt/d/AppData/玉泉食堂菜品图鉴.docx',
  '/mnt/d/AppData/玉泉食堂菜品图鉴_第二册_图片校正版.docx',
];
const OUTPUT = path.join(ROOT, 'data/documentCatalog.js');
const CANTEENS = ['玉泉五食堂', '玉泉靓园', '玉泉二食堂', '怡膳堂', '玉泉民族食堂', '玉泉一食堂', '玉泉四食堂'];
const PRICE_PATTERN = /^(?:\d+(?:\.\d+)?(?:\s*元)?(?:\s*\/\s*[^ ]+)?|未标注)$/;
// The ranking interleaves the two documents, so 25 images from each source cover its top 50.
const IMAGE_LIMIT = 25;
const HOME_IMAGE_LIMIT = 2;

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function readXml(file) {
  const xml = childProcess.execFileSync('unzip', ['-p', file, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return xml;
}

function textFromXml(source) {
  return Array.from(source.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), (text) => decodeXml(text[1]))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTableRows(table) {
  return Array.from(table.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g), (row) => (
    Array.from(row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g), (cell) => textFromXml(cell[0]))
  ));
}

function getImageTarget(row, relationships) {
  const matched = row.match(/r:embed="([^"]+)"/);
  if (!matched) return '';
  const relationship = relationships[matched[1]] || '';
  return relationship ? path.posix.normalize(path.posix.join('word', relationship)) : '';
}

function readRelationships(file) {
  const xml = childProcess.execFileSync('unzip', ['-p', file, 'word/_rels/document.xml.rels'], { encoding: 'utf8' });
  return Object.fromEntries(Array.from(xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g), (match) => {
    const id = match[1].match(/\bId="([^"]+)"/);
    const target = match[1].match(/\bTarget="([^"]+)"/);
    return [id && id[1], target && target[1]];
  }).filter(([id, target]) => id && target));
}

function extractImage(file, sourceIndex, dishIndex, target) {
  if (dishIndex >= IMAGE_LIMIT || !target) return '';
  const mainDirectory = path.join(ROOT, 'static/catalog');
  const rankingDirectory = path.join(ROOT, 'pages/ranking/catalog');
  const directory = dishIndex < 10 ? mainDirectory : rankingDirectory;
  fs.mkdirSync(directory, { recursive: true });
  if (sourceIndex === 0 && dishIndex === 0) {
    [mainDirectory, rankingDirectory].forEach((targetDirectory) => {
      if (!fs.existsSync(targetDirectory)) return;
      fs.readdirSync(targetDirectory)
        .filter((name) => /^dish-\d+(?:-\d+)?\.[a-z]+$/i.test(name))
        .forEach((name) => fs.unlinkSync(path.join(targetDirectory, name)));
    });
  }
  const outputName = `dish-${sourceIndex + 1}-${dishIndex + 1}${path.extname(target) || '.jpg'}`;
  const image = childProcess.execFileSync('unzip', ['-p', file, target]);
  fs.writeFileSync(path.join(rankingDirectory, outputName), image);
  const inMainPackage = (sourceIndex === 0 && dishIndex < 10)
    || (sourceIndex === 1 && dishIndex < HOME_IMAGE_LIMIT);
  if (inMainPackage) fs.writeFileSync(path.join(mainDirectory, outputName), image);
  return inMainPackage
    ? `/static/catalog/${outputName}`
    : `/pages/ranking/catalog/${outputName}`;
}

function parsePrice(value) {
  const prices = String(value).match(/\d+(?:\.\d+)?/g);
  if (!prices) return null;
  return Math.max(...prices.map(Number));
}

function createTags(name, price, canteen, section, meal) {
  const text = `${name} ${section}`;
  const tags = [];
  const add = (tag, condition) => { if (condition && !tags.includes(tag)) tags.push(tag); };
  add('预算 10 元内', price !== null && price <= 10);
  add('预算 15 元内', price !== null && price <= 15);
  // Keep taste labels conservative: a preparation or ingredient alone is not proof of taste.
  add('想吃热乎的', !/凉面|凉皮|凉菜|拍黄瓜|酸奶|果汁|奶昔|沙拉|冷面/.test(text)
    && /面|粉|米线|粥|汤|砂锅|煲仔饭|火锅|热干面|炒饭|拌饭|盖饭/.test(text));
  add('清爽不腻', /清炒|清蒸|白灼|清汤|蔬菜|青菜|冬瓜|黄瓜|西兰花|豆芽|轻食|果汁|酸奶/.test(text));
  add('酸', /酸汤|酸辣|酸梅|醋溜|酸味/.test(text));
  add('甜', /甜味|甜豆浆|蜜汁|糖醋|桂花糖/.test(text));
  add('酸甜', /糖醋|酸甜/.test(text));
  add('辣', /辣|麻辣|香辣|剁椒|泡椒/.test(text));
  add('咸香', /咸香|腊味/.test(text));
  add('鲜香', /鲜汤|鲜香|三鲜/.test(text));
  add('清淡', /清炒|清蒸|白灼|清汤|素|豆腐|粥|蔬菜|轻食/.test(text));
  add('素食', /素|蔬菜|豆腐|豆芽|包菜|生菜|西兰花|冬瓜|南瓜|土豆|莲藕|海带|菌菇/.test(text)
    && !/肉|鸡|牛|猪|鱼|虾|蛋|排骨|鸭|羊/.test(text));
  add('高蛋白', /牛|鸡|猪|鱼|虾|羊|排骨|蛋|肉|肥牛|牛蛙|豆腐/.test(text));
  add('早餐', meal.includes('早餐'));
  add('面食', /面|粉|米线|米粉|馄饨|饺|包|饼|烧麦|凉皮/.test(text));
  add('米饭', /饭|炒饭|拌饭|盖饭|煲仔/.test(text));
  add('汤粥', /汤|粥|豆浆|豆腐脑/.test(text));
  add('小吃', /包|糕|饼|饺|馄饨|烧麦|油条|串|小点/.test(text));
  return tags;
}

function parseSource(file, sourceIndex) {
  const xml = readXml(file);
  const relationships = readRelationships(file);
  const dishes = [];
  let canteen = sourceIndex === 0 ? '玉泉五食堂' : '';
  let section = '';
  let meal = '';
  const blocks = xml.match(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  blocks.forEach((block) => {
    if (block.startsWith('<w:p')) {
      const current = textFromXml(block);
      if (!current) return;
      const matchedCanteen = CANTEENS.find((item) => current.includes(item));
      if (matchedCanteen) canteen = matchedCanteen;
      if (/早餐|午餐|晚餐|夜宵/.test(current)) meal = current;
      if (/（\d+ 道|（\d+个|｜早餐|｜午餐|｜晚餐/.test(current)) section = current;
      return;
    }
    const rows = Array.from(block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g), (row) => row[0]);
    rows.forEach((row) => {
      const cells = Array.from(row.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g), (cell) => textFromXml(cell[0]));
      const [number, , name, price] = cells;
      if (!/^\d+$/.test(number) || !name || !price || !canteen || !PRICE_PATTERN.test(price)) return;
      const numericPrice = parsePrice(price);
      const id = `${sourceIndex + 1}-${dishes.length + 1}-${name}`;
      dishes.push({
        id,
        name,
        english: '',
        place: `${canteen}${section ? ` · ${section.replace(/（.*$/, '')}` : ''}`,
        canteen,
        campus: '玉泉',
        price,
        priceValue: numericPrice,
        score: 0,
        popularity: Math.max(1, 1000 - dishes.length),
        waitMinutes: 0,
        flavor: createTags(name, numericPrice, canteen, section, meal).filter((tag) => ['酸', '甜', '酸甜', '辣', '咸香', '鲜香', '清淡'].includes(tag)),
        tags: createTags(name, numericPrice, canteen, section, meal),
        meal: meal || '午餐、晚餐',
        desc: `${canteen} · ${name}`,
        image: extractImage(file, sourceIndex, dishes.length, getImageTarget(row, relationships)),
      });
    });
  });
  return dishes;
}

const dishes = SOURCES.flatMap(parseSource);
const output = `// Generated from the two menu guide documents. Run scripts/import-dish-catalog.js to refresh.\nexport const DOCUMENT_DISHES = ${JSON.stringify(dishes, null, 2)};\n`;
fs.writeFileSync(OUTPUT, output);
process.stdout.write(`Imported ${dishes.length} dishes into ${path.relative(ROOT, OUTPUT)}\n`);
