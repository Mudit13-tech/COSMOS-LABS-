import { readFileSync } from 'fs';
const file = readFileSync('js/dashboard.js', 'utf8');
try {
  new Function(file);
} catch (e) {
  if (e instanceof SyntaxError) {
    console.log('Syntax Error:', e.message);
  }
}
console.log('Done check');
