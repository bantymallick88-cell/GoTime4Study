import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Static assets to distribute
const filesToCopy = [
  'index.html',
  'script.js',
  'app.js',
  'styles.css',
  'robots.txt',
  'sitemap.xml',
  '404.html',
  '500.html',
  'privacy.html',
  'package.json',
  'wrangler.jsonc'
];

let copied = 0;
filesToCopy.forEach((file) => {
  const src = path.resolve(file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  }
});

console.log(`[GoTime4Study Build] Successfully synced ${copied} production assets to dist/`);
