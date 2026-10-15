import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
const sourceFile = (file) => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

// Read static resource objects without executing application code or starting a browser.
function readObject(node, file, prefix = '') {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return readObject(node.expression, file, prefix);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (!node.text) errors.push(`${file}: empty translation at ${prefix}`);
    return node.text;
  }
  if (!ts.isObjectLiteralExpression(node)) throw new Error(`${file}: expected a static resource object at ${prefix}`);
  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || !property.name || ts.isComputedPropertyName(property.name)) {
      throw new Error(`${file}: expected a named resource at ${prefix}`);
    }
    const key = property.name.text;
    if (Object.hasOwn(result, key)) errors.push(`${file}: duplicate resource ${prefix}.${key}`);
    result[key] = readObject(property.initializer, file, prefix ? `${prefix}.${key}` : key);
  }
  return result;
}

function flatten(object, prefix = '', result = {}) {
  for (const [name, value] of Object.entries(object)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') result[key] = value;
    else flatten(value, key, result);
  }
  return result;
}

function readCatalog(language) {
  const file = path.join(root, 'src/i18n', `${language}.ts`);
  const expression = sourceFile(file).statements.find(ts.isExportAssignment)?.expression;
  if (!expression) throw new Error(`${file}: missing default resource export`);
  return flatten(readObject(expression, file));
}

const catalogs = { de: readCatalog('de'), en: readCatalog('en') };
const placeholders = (text) => [...new Set([...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((match) => match[1]))].sort();
const keys = new Set([...Object.keys(catalogs.de), ...Object.keys(catalogs.en)]);
for (const key of keys) {
  for (const language of ['de', 'en']) {
    if (!Object.hasOwn(catalogs[language], key)) errors.push(`${language}: missing ${key}`);
  }
  if (catalogs.de[key] && catalogs.en[key] && placeholders(catalogs.de[key]).join() !== placeholders(catalogs.en[key]).join()) {
    errors.push(`${key}: DE/EN interpolation parameters differ`);
  }
  if (/_one$|_other$/.test(key)) {
    const base = key.replace(/_(one|other)$/, '');
    if (!keys.has(`${base}_one`) || !keys.has(`${base}_other`)) errors.push(`${base}: incomplete plural forms`);
  }
}

let calls = 0;
const src = path.join(root, 'src');
for (const relative of fs.readdirSync(src, { recursive: true }).filter((file) => /\.tsx?$/.test(file) && !file.startsWith('i18n/'))) {
  const file = path.join(src, relative);
  const source = sourceFile(file);
  if (/\buseLocalizedText\b/.test(source.text)) errors.push(`${relative}: inline bilingual helper is forbidden`);
  const translators = new Set(['translate']);
  function collect(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useT') {
      translators.add(node.name.getText(source));
    }
    // Callback parameters and destructured export/import options share this contract.
    if (ts.isIdentifier(node) && node.text === 't' && node.parent.type?.getText(source) === 'Translator') translators.add('t');
    ts.forEachChild(node, collect);
  }
  collect(source);
  function visit(node) {
    if (ts.isCallExpression(node) && (translators.has(node.expression.getText(source)) || node.expression.getText(source) === 'plan.t')) {
      calls++;
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      const location = `${relative}:${position.line + 1}`;
      const [key, options] = node.arguments;
      if (node.arguments.length > 2 || (options && !ts.isObjectLiteralExpression(options))) {
        errors.push(`${location}: translations take a key and an options object`);
      }
      if (key && ts.isStringLiteral(key)) {
        const text = catalogs.en[key.text] ?? catalogs.en[`${key.text}_other`];
        if (!text) errors.push(`${location}: unknown translation key ${key.text}`);
        else {
          const required = placeholders(text);
          if (keys.has(`${key.text}_other`) && !required.includes('count')) required.push('count');
          const supplied = options && ts.isObjectLiteralExpression(options) ? options.properties.map((property) => property.name?.getText(source).replace(/^['"]|['"]$/g, '')) : [];
          for (const parameter of required) {
            if (!supplied.includes(parameter)) errors.push(`${location}: ${key.text} requires ${parameter}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${keys.size} matching DE/EN keys; interpolation and plural forms valid; ${calls} key-based calls checked.\n`);
}
