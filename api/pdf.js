const fetch = require('node-fetch');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand, logoUrl, fbUrl, liUrl } = req.body;
  if (!brand) return res.status(400).json({ error: 'Missing brand data' });

  function hexToRgb(hex) {
    const c = hex.replace('#', '');
    return {
      r: parseInt(c.slice(0,2),16)/255,
      g: parseInt(c.slice(2,4),16)/255,
      b: parseInt(c.slice(4,6),16)/255
    };
  }

  function toCmykStr(r, g, b) {
    const k = 1 - Math.max(r,g,b);
    if (k === 1) return '0% 0% 0% 100%';
    const c = Math.round(((1-r-k)/(1-k))*100);
    const m = Math.round(((1-g-k)/(1-k))*100);
    const y = Math.round(((1-b-k)/(1-k))*100);
    return `${c}% ${m}% ${y}% ${Math.round(k*100)}%`;
  }

  async function fetchImage(url) {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.buffer();
    } catch (e) { return null; }
  }

  async function embedImg(doc, url) {
    const buf = await fetchImage(url);
    if (!buf) return null;
    try {
      try { return await doc.embedPng(buf); }
      catch(e) { return await doc.embedJpg(buf); }
    } catch(e) { return null; }
  }

  try {
    const c1 = brand.c1 || '#D92526';
    const c2 = brand.c2 || '#4A4C4D';
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const col1 = rgb(rgb1.r, rgb1.g, rgb1.b);
    const col2 = rgb(rgb2.r, rgb2.g, rgb2.b);
    const white = rgb(1,1,1);
    const black = rgb(0,0,0);
    const lightGray = rgb(0.94,0.94,0.94);
    const midGray = rgb(0.6,0.6,0.6);
    const darkGray = rgb(0.2,0.2,0.2);

    const doc = await PDFDocument.create();
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const regFont = await doc.embedFont(StandardFonts.Helvetica);

    // A4 landscape: 841.89 x 595.28 pts
    const W = 841.89, H = 595.28;
    const M = 28; // margin

    // Fetch all images server-side (no CORS)
    const [logoImg, fbImg, liImg] = await Promise.all([
      embedImg(doc, logoUrl),
      embedImg(doc, fbUrl),
      embedImg(doc, liUrl)
    ]);

    // ── PAGE 1: Cover ─────────────────────────────────────────────────────
    const p1 = doc.addPage([W, H]);

    // Left panel
    p1.drawRectangle({ x:0, y:0, width:W*0.42, height:H, color:col1 });
    // Right panel
    p1.drawRectangle({ x:W*0.42, y:0, width:W*0.58, height:H, color:col2 });

    // Logo on left panel
    if (logoImg) {
      const lDim = logoImg.scaleToFit(160, 160);
      p1.drawImage(logoImg, { x:M, y:H/2-lDim.height/2, width:lDim.width, height:lDim.height });
    }

    // Brand name
    const bnSize = brand.brandName.length > 20 ? 36 : 44;
    p1.drawText(brand.brandName || 'Brand', {
      x: W*0.45, y: H*0.55, font: boldFont, size: bnSize, color: white
    });

    // Tagline
    if (brand.tagline) {
      p1.drawText(brand.tagline, {
        x: W*0.45, y: H*0.55 - bnSize - 8, font: regFont, size: 16, color: rgb(0.9,0.9,0.9)
      });
    }

    // Accent line
    p1.drawRectangle({ x:W*0.45, y:H*0.55-bnSize-4, width:100, height:2, color:white });

    // Footer
    p1.drawText('Brand Kit', { x:M, y:14, font:regFont, size:9, color:rgb(0.8,0.8,0.8) });
    p1.drawText(new Date().toLocaleDateString('en-GB'), { x:W-100, y:14, font:regFont, size:9, color:rgb(0.8,0.8,0.8) });

    // ── PAGE 2: Color Palette ─────────────────────────────────────────────
    const p2 = doc.addPage([W, H]);

    // Header
    p2.drawRectangle({ x:0, y:H-40, width:W, height:40, color:col1 });
    p2.drawText('Color Palette', { x:M, y:H-28, font:boldFont, size:16, color:white });
    p2.drawText(brand.brandName||'', { x:M, y:6, font:regFont, size:8, color:midGray });
    p2.drawText('02', { x:W-M-20, y:6, font:regFont, size:8, color:midGray });

    // Section label
    p2.drawText('PRIMARY COLORS', { x:M, y:H-64, font:boldFont, size:9, color:midGray });

    const sw=200, sh=140, sy=H-230;
    // Swatch 1
    p2.drawRectangle({ x:M, y:sy, width:sw, height:sh, color:col1, borderRadius:6 });
    p2.drawText(c1.toUpperCase(), { x:M+sw/2-30, y:sy+sh/2+6, font:boldFont, size:18, color:white });
    p2.drawText('Primary', { x:M+sw/2-22, y:sy+sh/2-18, font:regFont, size:11, color:rgb(0.9,0.9,0.9) });

    // Swatch 1 specs
    const s1y = sy - 70;
    p2.drawText('HEX', { x:M, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText('RGB', { x:M+70, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText('CMYK', { x:M+160, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText(c1.toUpperCase(), { x:M, y:s1y+26, font:regFont, size:9, color:darkGray });
    p2.drawText(`${Math.round(rgb1.r*255)}, ${Math.round(rgb1.g*255)}, ${Math.round(rgb1.b*255)}`, { x:M+70, y:s1y+26, font:regFont, size:9, color:darkGray });
    p2.drawText(toCmykStr(rgb1.r, rgb1.g, rgb1.b), { x:M+160, y:s1y+26, font:regFont, size:9, color:darkGray });

    // Swatch 2
    const sx2 = M+sw+30;
    p2.drawRectangle({ x:sx2, y:sy, width:sw, height:sh, color:col2, borderRadius:6 });
    p2.drawText(c2.toUpperCase(), { x:sx2+sw/2-30, y:sy+sh/2+6, font:boldFont, size:18, color:white });
    p2.drawText('Secondary', { x:sx2+sw/2-32, y:sy+sh/2-18, font:regFont, size:11, color:rgb(0.9,0.9,0.9) });

    // Swatch 2 specs
    p2.drawText('HEX', { x:sx2, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText('RGB', { x:sx2+70, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText('CMYK', { x:sx2+160, y:s1y+42, font:boldFont, size:8, color:darkGray });
    p2.drawText(c2.toUpperCase(), { x:sx2, y:s1y+26, font:regFont, size:9, color:darkGray });
    p2.drawText(`${Math.round(rgb2.r*255)}, ${Math.round(rgb2.g*255)}, ${Math.round(rgb2.b*255)}`, { x:sx2+70, y:s1y+26, font:regFont, size:9, color:darkGray });
    p2.drawText(toCmykStr(rgb2.r, rgb2.g, rgb2.b), { x:sx2+160, y:s1y+26, font:regFont, size:9, color:darkGray });

    // Usage notes
    const ux = sx2+sw+30;
    p2.drawText('COLOR USAGE GUIDELINES', { x:ux, y:H-64, font:boldFont, size:9, color:midGray });
    p2.drawLine({ start:{x:ux,y:H-68}, end:{x:W-M,y:H-68}, thickness:1.5, color:col1 });
    const usageLines = [
      `${c1} — Primary. Use for CTAs, headings, key brand accents.`,
      `${c2} — Secondary. Use for body text and backgrounds.`,
      '',
      'Maintain contrast ratios of at least 4.5:1 for accessibility.'
    ];
    usageLines.forEach((line, i) => {
      p2.drawText(line, { x:ux, y:H-86-(i*16), font:regFont, size:9, color:darkGray });
    });

    // Utility swatches
    p2.drawText('UTILITY', { x:M, y:s1y-10, font:boldFont, size:8, color:midGray });
    p2.drawRectangle({ x:M, y:s1y-50, width:70, height:32, color:white, borderColor:lightGray, borderWidth:1 });
    p2.drawText('#FFFFFF', { x:M+10, y:s1y-38, font:regFont, size:8, color:darkGray });
    p2.drawRectangle({ x:M+82, y:s1y-50, width:70, height:32, color:rgb(0.08,0.08,0.08) });
    p2.drawText('#1A1A1A', { x:M+92, y:s1y-38, font:regFont, size:8, color:white });

    // ── PAGE 3: Logo Mark ─────────────────────────────────────────────────
    const p3 = doc.addPage([W, H]);
    p3.drawRectangle({ x:0, y:H-40, width:W, height:40, color:col1 });
    p3.drawText('Logo Mark', { x:M, y:H-28, font:boldFont, size:16, color:white });
    p3.drawText(brand.brandName||'', { x:M, y:6, font:regFont, size:8, color:midGray });
    p3.drawText('03', { x:W-M-20, y:6, font:regFont, size:8, color:midGray });

    p3.drawText('ON LIGHT BACKGROUND', { x:M, y:H-62, font:boldFont, size:9, color:midGray });
    p3.drawText('ON DARK BACKGROUND', { x:W/2+M, y:H-62, font:boldFont, size:9, color:midGray });

    const logoBoxW = W/2-M-20, logoBoxH = H-120;
    const logoY = 50;

    // Light bg box
    p3.drawRectangle({ x:M, y:logoY, width:logoBoxW, height:logoBoxH, color:white, borderColor:lightGray, borderWidth:0.5 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(logoBoxW-40, logoBoxH-40);
      p3.drawImage(logoImg, { x:M+(logoBoxW-ld.width)/2, y:logoY+(logoBoxH-ld.height)/2, width:ld.width, height:ld.height });
    }
    p3.drawText('On White', { x:M+logoBoxW/2-24, y:logoY-16, font:regFont, size:9, color:midGray });

    // Dark bg box
    const dx = W/2+M;
    p3.drawRectangle({ x:dx, y:logoY, width:logoBoxW, height:logoBoxH, color:col2 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(logoBoxW-40, logoBoxH-40);
      p3.drawImage(logoImg, { x:dx+(logoBoxW-ld.width)/2, y:logoY+(logoBoxH-ld.height)/2, width:ld.width, height:ld.height });
    }
    p3.drawText('On Dark', { x:dx+logoBoxW/2-22, y:logoY-16, font:regFont, size:9, color:midGray });

    // Clear space note
    p3.drawText('Always maintain clear space equal to the cap-height of the wordmark around the logo.', { x:M, y:logoY-32, font:regFont, size:8, color:midGray });

    // ── PAGE 4: Social Assets ─────────────────────────────────────────────
    const p4 = doc.addPage([W, H]);
    p4.drawRectangle({ x:0, y:H-40, width:W, height:40, color:col1 });
    p4.drawText('Social Media Assets', { x:M, y:H-28, font:boldFont, size:16, color:white });
    p4.drawText(brand.brandName||'', { x:M, y:6, font:regFont, size:8, color:midGray });
    p4.drawText('04', { x:W-M-20, y:6, font:regFont, size:8, color:midGray });

    const availW = W - M*2;

    // Facebook cover
    p4.drawText('FACEBOOK COVER — 820 × 312 px', { x:M, y:H-62, font:boldFont, size:9, color:midGray });
    const fbH = availW * (312/820);
    if (fbImg) {
      const fd = fbImg.scaleToFit(availW, fbH);
      p4.drawImage(fbImg, { x:M, y:H-70-fd.height, width:fd.width, height:fd.height });
    } else {
      p4.drawRectangle({ x:M, y:H-70-fbH, width:availW, height:fbH, color:lightGray });
      p4.drawText('Facebook Cover', { x:W/2-50, y:H-70-fbH/2, font:regFont, size:12, color:midGray });
    }

    const liTopY = H-70-fbH-30;
    p4.drawText('LINKEDIN COVER — 1584 × 396 px', { x:M, y:liTopY+14, font:boldFont, size:9, color:midGray });
    const liH = availW * (396/1584);
    if (liImg) {
      const ld = liImg.scaleToFit(availW, liH);
      p4.drawImage(liImg, { x:M, y:liTopY-ld.height, width:ld.width, height:ld.height });
    } else {
      p4.drawRectangle({ x:M, y:liTopY-liH, width:availW, height:liH, color:lightGray });
      p4.drawText('LinkedIn Cover', { x:W/2-50, y:liTopY-liH/2, font:regFont, size:12, color:midGray });
    }

    // ── PAGE 5: Typography & Brand Voice ──────────────────────────────────
    const p5 = doc.addPage([W, H]);
    p5.drawRectangle({ x:0, y:H-40, width:W, height:40, color:col1 });
    p5.drawText('Typography & Brand Voice', { x:M, y:H-28, font:boldFont, size:16, color:white });
    p5.drawText(brand.brandName||'', { x:M, y:6, font:regFont, size:8, color:midGray });
    p5.drawText('05', { x:W-M-20, y:6, font:regFont, size:8, color:midGray });

    p5.drawText('PRIMARY TYPEFACE', { x:M, y:H-62, font:boldFont, size:9, color:midGray });
    p5.drawLine({ start:{x:M,y:H-66}, end:{x:220,y:H-66}, thickness:1.5, color:col1 });

    p5.drawText('Helvetica Bold', { x:M, y:H-98, font:boldFont, size:28, color:black });
    p5.drawText('Helvetica Regular', { x:M, y:H-132, font:regFont, size:20, color:darkGray });
    p5.drawText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x:M, y:H-160, font:regFont, size:9, color:midGray });
    p5.drawText('abcdefghijklmnopqrstuvwxyz  0123456789', { x:M, y:H-174, font:regFont, size:9, color:midGray });

    p5.drawText('USAGE SCALE', { x:M, y:H-200, font:boldFont, size:9, color:midGray });
    const rows = [
      ['Display / Hero', 'Bold', '48–72pt', true],
      ['Headings', 'Bold', '24–36pt', false],
      ['Subheadings', 'Bold', '16–20pt', false],
      ['Body', 'Regular', '10–14pt', false],
      ['Captions', 'Regular', '8–10pt', false]
    ];
    rows.forEach(([use, wt, sz, accent], i) => {
      const ry = H-218-(i*20);
      p5.drawRectangle({ x:M, y:ry-4, width:340, height:18, color: accent ? col1 : lightGray });
      p5.drawText(use, { x:M+6, y:ry+2, font: accent ? boldFont : regFont, size:9, color: accent ? white : darkGray });
      p5.drawText(wt, { x:M+180, y:ry+2, font:regFont, size:9, color: accent ? rgb(0.9,0.9,0.9) : midGray });
      p5.drawText(sz, { x:M+260, y:ry+2, font:regFont, size:9, color: accent ? rgb(0.9,0.9,0.9) : midGray });
    });

    // Brand voice panel
    const bx = W/2+M;
    p5.drawText('BRAND VOICE', { x:bx, y:H-62, font:boldFont, size:9, color:midGray });
    p5.drawLine({ start:{x:bx,y:H-66}, end:{x:W-M,y:H-66}, thickness:1.5, color:col1 });

    if (brand.personality) {
      p5.drawText(brand.personality.slice(0,60), { x:bx, y:H-90, font:boldFont, size:11, color:darkGray });
    }

    if (brand.description) {
      const words = brand.description.split(' ');
      let line = '', lineY = H-112;
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (test.length > 55) {
          p5.drawText(line, { x:bx, y:lineY, font:regFont, size:9, color:darkGray });
          line = word; lineY -= 16;
        } else { line = test; }
      });
      if (line) p5.drawText(line, { x:bx, y:lineY, font:regFont, size:9, color:darkGray });
    }

    if (brand.tagline) {
      p5.drawRectangle({ x:bx, y:H-320, width:W-bx-M, height:54, color:col1, borderRadius:4 });
      p5.drawText(`"${brand.tagline}"`, { x:bx+14, y:H-296, font:boldFont, size:13, color:white });
      p5.drawText('Brand Tagline', { x:bx+14, y:H-314, font:regFont, size:8, color:rgb(0.85,0.85,0.85) });
    }

    const pdfBytes = await doc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(brand.brandName||'brand').replace(/\s+/g,'-').toLowerCase()}-brand-kit.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));

  } catch (e) {
    console.error('PDF error:', e);
    return res.status(500).json({ error: e.message });
  }
};
