const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const errors = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function walk(directory, predicate = () => true) {
  const target = path.join(root, directory);
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative, predicate);
    return predicate(relative) ? [relative] : [];
  });
}

function validateJson() {
  walk('.', (file) => file.endsWith('.json') && !file.includes('miniprogram_npm') && !file.includes('node_modules'))
    .forEach((file) => {
      try { JSON.parse(read(file)); } catch (error) { errors.push(`${file}: JSON 无效 - ${error.message}`); }
    });
}

function validateRoutes() {
  const app = JSON.parse(read('app.json'));
  const routes = [...(app.pages || [])];
  (app.subpackages || []).forEach((pack) => {
    (pack.pages || []).forEach((page) => routes.push(`${pack.root}/${page}`));
  });
  routes.forEach((route) => {
    ['js', 'json', 'wxml'].forEach((extension) => {
      assert(fs.existsSync(path.join(root, `${route}.${extension}`)), `${route}.${extension}: 注册页面文件缺失`);
    });
  });

  const routeSet = new Set(routes.map((route) => `/${route}`));
  const source = ['pages', 'components', 'services']
    .flatMap((directory) => walk(directory, (file) => /\.(js|wxml)$/.test(file)))
    .map(read)
    .join('\n');
  const references = new Set(Array.from(source.matchAll(/\/pages\/[A-Za-z0-9_/-]+/g), (match) => match[0].replace(/\/$/, '')));
  references.forEach((reference) => {
    assert(routeSet.has(reference), `${reference}: 代码引用的页面未在 app.json 注册`);
  });
}

function validateHandlers() {
  ['pages', 'components'].flatMap((directory) => walk(directory, (file) => file.endsWith('.wxml'))).forEach((wxmlFile) => {
    const jsFile = wxmlFile.replace(/\.wxml$/, '.js');
    if (!fs.existsSync(path.join(root, jsFile))) return;
    const template = read(wxmlFile);
    const script = read(jsFile);
    const matcher = /(?:bind|catch):?[\w-]+="([A-Za-z_$][\w$]*)"/g;
    let match = matcher.exec(template);
    while (match) {
      const name = match[1];
      const methodPattern = new RegExp(`(?:^|[,\\s])${name}\\s*\\(`, 'm');
      const propertyPattern = new RegExp(`${name}\\s*:`);
      assert(methodPattern.test(script) || propertyPattern.test(script), `${wxmlFile}: 事件处理器 ${name} 未在 ${jsFile} 中定义`);
      match = matcher.exec(template);
    }
  });
}

function validateWxmlStructure() {
  ['pages', 'components'].flatMap((directory) => walk(directory, (file) => file.endsWith('.wxml'))).forEach((file) => {
    const source = read(file)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{[\s\S]*?\}\}/g, 'EXPRESSION');
    const stack = [];
    const tagPattern = /<\s*(\/?)\s*([\w-]+)([^>]*)>/g;
    let match = tagPattern.exec(source);
    while (match) {
      const closing = Boolean(match[1]);
      const tagName = match[2];
      const selfClosing = /\/\s*$/.test(match[3]);
      if (closing) {
        const expected = stack.pop();
        if (expected !== tagName) {
          errors.push(`${file}: WXML 标签不匹配，期望关闭 ${expected || '无'}，实际关闭 ${tagName}`);
          break;
        }
      } else if (!selfClosing) stack.push(tagName);
      match = tagPattern.exec(source);
    }
    if (stack.length) errors.push(`${file}: WXML 标签未关闭 - ${stack.join(', ')}`);
  });
}

function validateStaticAssets() {
  const text = ['pages', 'components', 'services', 'data']
    .flatMap((directory) => walk(directory, (file) => /\.(js|json|wxml|less|wxss)$/.test(file)))
    .map(read)
    .join('\n');
  const references = new Set(Array.from(text.matchAll(/["'](\/static\/[^"']+)["']/g), (match) => match[1]));
  references.forEach((reference) => {
    assert(fs.existsSync(path.join(root, reference.replace(/^\//, ''))), `${reference}: 静态资源不存在`);
  });
}

function validateCloudFunctions() {
  const required = ['ensureUser', 'mealCheckins', 'recognizeDish', 'communityComments', 'communityPosts', 'likePost', 'companionInvite', 'messageHelper', 'userSocial', 'weeklyInsights', 'adminCommunity'];
  required.forEach((name) => {
    assert(fs.existsSync(path.join(root, 'cloudfunctions', name, 'index.js')), `cloudfunctions/${name}: 云函数缺失`);
    assert(fs.existsSync(path.join(root, 'cloudfunctions', name, 'package.json')), `cloudfunctions/${name}: package.json 缺失`);
  });
}

function validateJavaScriptSyntax() {
  const moduleRoots = ['pages', 'components', 'services', 'behaviors', 'data', 'utils'];
  const moduleFiles = moduleRoots.flatMap((directory) => walk(directory, (file) => file.endsWith('.js')));
  ['app.js', 'config.js'].forEach((file) => {
    if (fs.existsSync(path.join(root, file))) moduleFiles.push(file);
  });
  moduleFiles.forEach((file) => {
    try {
      // SourceTextModule is constructed only to validate module syntax.
      // eslint-disable-next-line no-new
      new vm.SourceTextModule(read(file), { identifier: file });
    } catch (error) { errors.push(`${file}: JavaScript 语法错误 - ${error.message}`); }
  });
  walk('cloudfunctions', (file) => file.endsWith('.js') && !file.includes('node_modules')).forEach((file) => {
    try {
      // Script is constructed only to validate CommonJS syntax.
      // eslint-disable-next-line no-new
      new vm.Script(read(file), { filename: file });
    } catch (error) { errors.push(`${file}: JavaScript 语法错误 - ${error.message}`); }
  });
}

validateJson();
validateRoutes();
validateHandlers();
validateWxmlStructure();
validateStaticAssets();
validateCloudFunctions();
validateJavaScriptSyntax();

if (errors.length) {
  console.error(`项目检查失败（${errors.length} 项）：`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

process.stdout.write('项目静态检查通过：路由、JSON、WXML 结构与事件、静态资源、JavaScript 语法和云函数结构均有效。\n');
