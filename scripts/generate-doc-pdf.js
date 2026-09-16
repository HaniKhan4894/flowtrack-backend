/**
 * Generate PDF from FlowTrack HTML briefs (same pipeline as Cost Plan).
 * Usage: node scripts/generate-doc-pdf.js [html-file] [pdf-file]
 */
const path = require('path');
const fs = require('fs');

async function main() {
  const htmlArg = process.argv[2] || 'docs/FlowTrack-Product-Stakeholder-Brief.html';
  const pdfArg = process.argv[3] || htmlArg.replace(/\.html$/i, '.pdf');

  const root = path.resolve(__dirname, '..');
  const htmlPath = path.resolve(root, htmlArg);
  const pdfPath = path.resolve(root, pdfArg);

  if (!fs.existsSync(htmlPath)) {
    console.error('HTML file not found:', htmlPath);
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.error('Installing puppeteer...');
    const { execSync } = require('child_process');
    execSync('npm install puppeteer@23 --no-save', { cwd: root, stdio: 'inherit' });
    puppeteer = require('puppeteer');
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
  });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
  });

  await browser.close();
  console.log('PDF written:', pdfPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
