import fs from 'fs';

const path = 'd:\\CODE\\tiemdiennuoc\\src\\App.tsx';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

lines[3] = `import "./App.css";\nimport { removeAccents, removeVietnameseTones, formatVND, getFormattedDate, getFormattedTime } from './utils';\nimport { formatReceiptForNetworkPrinter, getLabelPreviewText, formatLabelForNetworkPrinter } from './printerServices';`;

for (let i = 116; i <= 122; i++) lines[i] = `// removed removeAccents`;
for (let i = 299; i <= 310; i++) lines[i] = `// removed date utils`;
for (let i = 617; i <= 819; i++) lines[i] = `// removed printer utils`;

lines[869] = lines[869].replace('formatLabelForNetworkPrinter(productName, price, sku, quantity)', 'formatLabelForNetworkPrinter(productName, price, shopName, sku, quantity)');
lines[1117] = lines[1117].replace('formatLabelForNetworkPrinter("San pham tem thu (Test)", 99000, "TEST1234", 2)', 'formatLabelForNetworkPrinter("San pham tem thu (Test)", 99000, shopName, "TEST1234", 2)');

for (let i = 2189; i <= 2191; i++) lines[i] = `// removed formatVND`;

lines[3984] = lines[3984].replace('getLabelPreviewText(labelPrintProduct.name, labelPrintProduct.price, labelPrintProduct.sku)', 'getLabelPreviewText(labelPrintProduct.name, labelPrintProduct.price, shopName, labelPrintProduct.sku)');

lines = lines.filter(line => !line.startsWith('// removed'));

fs.writeFileSync(path, lines.join('\n'));
console.log('Done refactoring');
