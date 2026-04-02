const fetch = require('node-fetch');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand, logoUrl, fbUrl, liUrl } = req.body;
  if (!brand) return res.status(400).json({ error: 'Missing brand data' });

  function hexToRgb(hex) {
    const c = (hex || '#000000').replace('#', '');
    return {
      r: parseInt(c.slice(0,2),16)/255,
      g: parseInt(c.slice(2,4),16)/255,
      b: parseInt(c.slice(4,6),16)/255
    };
  }

  function toCmyk(r, g, b) {
    const k = 1 - Math.max(r,g,b);
    if (k >= 1) return { c:0, m:0, y:0, k:100 };
    return {
      c: Math.round(((1-r-k)/(1-k))*100),
      m: Math.round(((1-g-k)/(1-k))*100),
      y: Math.round(((1-b-k)/(1-k))*100),
      k: Math.round(k*100)
    };
  }

  function safeText(str, maxLen) {
    if (!str) return '';
    // Remove any non-latin1 chars that confuse pdf-lib standard fonts
    return str.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen || 200);
  }

  async function fetchImageBuffer(url) {
    if (!url) return null;
    try {
      const r = await fetch(url, { timeout: 15000 });
      if (!r.ok) return null;
      return await r.buffer();
    } catch (e) { return null; }
  }

  async function embedImg(doc, url) {
    const buf = await fetchImageBuffer(url);
    if (!buf) return null;
    try { return await doc.embedPng(buf); } catch(e) {}
    try { return await doc.embedJpg(buf); } catch(e) {}
    return null;
  }

  // Draw a rounded rectangle using lines and arcs (pdf-lib doesn't have native rounded rects with fill+stroke)
  function drawRoundedRect(page, x, y, w, h, r, fillColor, strokeColor, strokeWidth) {
    if (fillColor) {
      page.drawRectangle({ x, y, width: w, height: h, color: fillColor, borderRadius: r });
    }
  }

  try {
    const c1str = brand.c1 || '#1A56DB';
    const c2str = brand.c2 || '#374151';
    const rgb1 = hexToRgb(c1str);
    const rgb2 = hexToRgb(c2str);
    const col1 = rgb(rgb1.r, rgb1.g, rgb1.b);
    const col2 = rgb(rgb2.r, rgb2.g, rgb2.b);
    const white = rgb(1,1,1);
    const offWhite = rgb(0.97,0.97,0.97);
    const veryLightGray = rgb(0.93,0.93,0.93);
    const lightGray = rgb(0.85,0.85,0.85);
    const midGray = rgb(0.55,0.55,0.55);
    const darkGray = rgb(0.18,0.18,0.18);
    const nearBlack = rgb(0.08,0.08,0.08);

    const cmyk1 = toCmyk(rgb1.r, rgb1.g, rgb1.b);
    const cmyk2 = toCmyk(rgb2.r, rgb2.g, rgb2.b);

    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

    const W = 841.89, H = 595.28;
    const M = 36;

    const [logoImg, fbImg, liImg] = await Promise.all([
      embedImg(doc, logoUrl),
      embedImg(doc, fbUrl),
      embedImg(doc, liUrl)
    ]);

    const brandName = safeText(brand.brandName, 60);
    const tagline = safeText(brand.tagline, 80);
    const niche = safeText(brand.niche, 100);
    const personality = safeText(brand.personality, 120);
    const description = safeText(brand.description, 300);

    // ── Shared footer ──────────────────────────────────────────────────────
    function addFooter(page, pageNum) {
      // Bottom bar
      page.drawRectangle({ x:0, y:0, width:W, height:22, color:nearBlack });
      // Left accent line
      page.drawRectangle({ x:0, y:0, width:4, height:22, color:col1 });
      page.drawText(brandName, { x:14, y:7, font:reg, size:8, color:midGray });
      page.drawText(`${String(pageNum).padStart(2,'0')} / 05`, { x:W-M-20, y:7, font:reg, size:8, color:midGray });
    }

    // ── Shared section label ───────────────────────────────────────────────
    function sectionLabel(page, text, x, y) {
      page.drawText(text, { x, y, font:bold, size:7.5, color:col1 });
      page.drawRectangle({ x, y:y-4, width:bold.widthOfTextAtSize(text, 7.5), height:1, color:col1 });
    }

    // ── PAGE 1: Cover ─────────────────────────────────────────────────────
    const p1 = doc.addPage([W, H]);

    // Full bleed dark background
    p1.drawRectangle({ x:0, y:0, width:W, height:H, color:nearBlack });

    // Left color panel
    p1.drawRectangle({ x:0, y:0, width:W*0.38, height:H, color:col1 });

    // Diagonal slice — overlay triangle to create diagonal edge
    // Draw a series of vertical lines to create a smooth diagonal fade
    for (let i = 0; i <= 60; i++) {
      const sliceX = W*0.38 + (i/60)*80;
      const sliceH = H - (i/60)*H;
      p1.drawRectangle({ x:sliceX, y:H-sliceH, width:1.5, height:sliceH, color:col1,
        opacity: 1 - (i/60) });
    }

    // Subtle grid pattern on dark side
    for (let gx = W*0.44; gx < W; gx += 40) {
      p1.drawLine({ start:{x:gx,y:0}, end:{x:gx,y:H}, thickness:0.3, color:rgb(1,1,1), opacity:0.04 });
    }
    for (let gy = 0; gy < H; gy += 40) {
      p1.drawLine({ start:{x:W*0.44,y:gy}, end:{x:W,y:gy}, thickness:0.3, color:rgb(1,1,1), opacity:0.04 });
    }

    // Logo on left panel
    if (logoImg) {
      const ld = logoImg.scaleToFit(W*0.28, H*0.38);
      p1.drawImage(logoImg, {
        x: (W*0.38 - ld.width)/2,
        y: H/2 - ld.height/2,
        width: ld.width, height: ld.height
      });
    }

    // Horizontal rule on left panel
    p1.drawRectangle({ x:M, y:H/2-ld_h(logoImg, W*0.28, H*0.38)/2-24, width:W*0.38-M*2, height:0.5, color:white, opacity:0.3 });

    // Brand name — right side
    const bnFontSize = brandName.length > 18 ? 42 : 52;
    p1.drawText(brandName, {
      x: W*0.44, y: H*0.56,
      font: bold, size: bnFontSize, color: white
    });

    // Accent bar under brand name
    p1.drawRectangle({ x:W*0.44, y:H*0.56-8, width:64, height:3, color:col1 });

    // Tagline
    if (tagline) {
      p1.drawText(tagline, {
        x: W*0.44, y: H*0.56 - 28,
        font: reg, size: 15, color: rgb(0.75,0.75,0.75)
      });
    }

    // Brand Kit label bottom right
    p1.drawText('BRAND KIT', {
      x: W*0.44, y: H*0.18,
      font: bold, size: 9, color: rgb(0.4,0.4,0.4)
    });
    p1.drawText(new Date().toLocaleDateString('en-GB',{year:'numeric',month:'long'}), {
      x: W*0.44, y: H*0.18-16,
      font: reg, size: 9, color: rgb(0.35,0.35,0.35)
    });

    // ── PAGE 2: Color Palette ─────────────────────────────────────────────
    const p2 = doc.addPage([W, H]);
    p2.drawRectangle({ x:0, y:0, width:W, height:H, color:offWhite });

    // Top header bar
    p2.drawRectangle({ x:0, y:H-52, width:W, height:52, color:nearBlack });
    p2.drawRectangle({ x:0, y:H-52, width:4, height:52, color:col1 });
    p2.drawText('COLOR PALETTE', { x:M, y:H-34, font:bold, size:18, color:white });
    addFooter(p2, 2);

    const swY = H - 52 - 20;
    const swW = 210, swH = 160;

    // Color 1 swatch
    p2.drawRectangle({ x:M, y:swY-swH, width:swW, height:swH, color:col1, borderRadius:4 });
    // White label area at bottom of swatch
    p2.drawRectangle({ x:M, y:swY-swH, width:swW, height:44, color:rgb(0,0,0,0.25), borderRadius:0 });
    p2.drawText(c1str.toUpperCase(), { x:M+12, y:swY-swH+26, font:bold, size:14, color:white });
    p2.drawText('Primary', { x:M+12, y:swY-swH+10, font:reg, size:9, color:rgb(0.8,0.8,0.8) });

    // Color 1 specs
    const spec1Y = swY - swH - 16;
    p2.drawRectangle({ x:M, y:spec1Y-54, width:swW, height:58, color:white, borderRadius:3 });
    p2.drawLine({ start:{x:M,y:spec1Y-2}, end:{x:M+swW,y:spec1Y-2}, thickness:0.5, color:veryLightGray });

    const specRows1 = [
      ['HEX', c1str.toUpperCase()],
      ['RGB', `${Math.round(rgb1.r*255)}, ${Math.round(rgb1.g*255)}, ${Math.round(rgb1.b*255)}`],
      ['CMYK', `${cmyk1.c}  ${cmyk1.m}  ${cmyk1.y}  ${cmyk1.k}`],
    ];
    specRows1.forEach(([label, val], i) => {
      const ry = spec1Y - 16 - (i*14);
      p2.drawText(label, { x:M+10, y:ry, font:bold, size:7.5, color:midGray });
      p2.drawText(val, { x:M+52, y:ry, font:reg, size:7.5, color:darkGray });
    });

    // Color 2 swatch
    const sx2 = M + swW + 24;
    p2.drawRectangle({ x:sx2, y:swY-swH, width:swW, height:swH, color:col2, borderRadius:4 });
    p2.drawRectangle({ x:sx2, y:swY-swH, width:swW, height:44, color:rgb(0,0,0,0.3), borderRadius:0 });
    p2.drawText(c2str.toUpperCase(), { x:sx2+12, y:swY-swH+26, font:bold, size:14, color:white });
    p2.drawText('Secondary', { x:sx2+12, y:swY-swH+10, font:reg, size:9, color:rgb(0.8,0.8,0.8) });

    p2.drawRectangle({ x:sx2, y:spec1Y-54, width:swW, height:58, color:white, borderRadius:3 });
    const specRows2 = [
      ['HEX', c2str.toUpperCase()],
      ['RGB', `${Math.round(rgb2.r*255)}, ${Math.round(rgb2.g*255)}, ${Math.round(rgb2.b*255)}`],
      ['CMYK', `${cmyk2.c}  ${cmyk2.m}  ${cmyk2.y}  ${cmyk2.k}`],
    ];
    specRows2.forEach(([label, val], i) => {
      const ry = spec1Y - 16 - (i*14);
      p2.drawText(label, { x:sx2+10, y:ry, font:bold, size:7.5, color:midGray });
      p2.drawText(val, { x:sx2+52, y:ry, font:reg, size:7.5, color:darkGray });
    });

    // Utility swatches
    const ux = sx2 + swW + 32;
    sectionLabel(p2, 'UTILITY COLORS', ux, swY - 14);
    const utilColors = [
      { label:'White', hex:'#FFFFFF', r:1,g:1,b:1, dark:true },
      { label:'Black', hex:'#000000', r:0,g:0,b:0, dark:false },
      { label:'Light Gray', hex:'#F3F4F6', r:0.95,g:0.96,b:0.96, dark:true },
    ];
    utilColors.forEach((uc, i) => {
      const uy = swY - 36 - (i*56);
      p2.drawRectangle({ x:ux, y:uy-32, width:130, height:36, color:rgb(uc.r,uc.g,uc.b), borderRadius:3,
        borderColor:veryLightGray, borderWidth:0.5 });
      p2.drawText(uc.label, { x:ux+10, y:uy-14, font:bold, size:8, color:uc.dark?darkGray:white });
      p2.drawText(uc.hex, { x:ux+10, y:uy-26, font:reg, size:7.5, color:uc.dark?midGray:rgb(0.7,0.7,0.7) });
    });

    // Usage notes panel
    const notesX = ux;
    const notesY = swY - 36 - 3*56 - 20;
    sectionLabel(p2, 'USAGE NOTES', notesX, notesY);
    const notes = [
      `Primary ${c1str} for CTAs, headings, and key accents.`,
      `Secondary ${c2str} for body text and backgrounds.`,
      'Maintain 4.5:1 contrast ratio for accessibility.',
    ];
    notes.forEach((note, i) => {
      p2.drawText('—', { x:notesX, y:notesY-18-(i*16), font:reg, size:8, color:col1 });
      p2.drawText(note, { x:notesX+12, y:notesY-18-(i*16), font:reg, size:8, color:darkGray });
    });

    // ── PAGE 3: Logo ──────────────────────────────────────────────────────
    const p3 = doc.addPage([W, H]);
    p3.drawRectangle({ x:0, y:0, width:W, height:H, color:offWhite });
    p3.drawRectangle({ x:0, y:H-52, width:W, height:52, color:nearBlack });
    p3.drawRectangle({ x:0, y:H-52, width:4, height:52, color:col1 });
    p3.drawText('LOGO MARK', { x:M, y:H-34, font:bold, size:18, color:white });
    addFooter(p3, 3);

    const logoBoxW = (W - M*2 - 24) / 2;
    const logoBoxH = H - 52 - 22 - 80;
    const logoBoxY = 22 + 80;

    // Light bg box
    p3.drawRectangle({ x:M, y:logoBoxY, width:logoBoxW, height:logoBoxH, color:white,
      borderColor:lightGray, borderWidth:0.5, borderRadius:4 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(logoBoxW-48, logoBoxH-48);
      p3.drawImage(logoImg, {
        x: M+(logoBoxW-ld.width)/2,
        y: logoBoxY+(logoBoxH-ld.height)/2,
        width:ld.width, height:ld.height
      });
    }
    p3.drawText('ON LIGHT', { x:M+(logoBoxW/2)-22, y:logoBoxY-18, font:bold, size:8, color:midGray });

    // Dark bg box
    const dbx = M + logoBoxW + 24;
    p3.drawRectangle({ x:dbx, y:logoBoxY, width:logoBoxW, height:logoBoxH, color:nearBlack, borderRadius:4 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(logoBoxW-48, logoBoxH-48);
      p3.drawImage(logoImg, {
        x: dbx+(logoBoxW-ld.width)/2,
        y: logoBoxY+(logoBoxH-ld.height)/2,
        width:ld.width, height:ld.height
      });
    }
    p3.drawText('ON DARK', { x:dbx+(logoBoxW/2)-20, y:logoBoxY-18, font:bold, size:8, color:midGray });

    // Guidelines below
    const glY = logoBoxY - 46;
    sectionLabel(p3, 'USAGE GUIDELINES', M, glY);
    const guidelines = [
      'Always maintain clear space equal to the cap-height of the wordmark on all sides.',
      'Do not distort, rotate, recolour, or add effects to the logo.',
      'Minimum digital size: 120px wide. Minimum print size: 25mm wide.',
    ];
    guidelines.forEach((g, i) => {
      p3.drawText('—', { x:M, y:glY-18-(i*14), font:reg, size:8, color:col1 });
      p3.drawText(g, { x:M+14, y:glY-18-(i*14), font:reg, size:8, color:darkGray });
    });

    // ── PAGE 4: Social Assets ─────────────────────────────────────────────
    const p4 = doc.addPage([W, H]);
    p4.drawRectangle({ x:0, y:0, width:W, height:H, color:offWhite });
    p4.drawRectangle({ x:0, y:H-52, width:W, height:52, color:nearBlack });
    p4.drawRectangle({ x:0, y:H-52, width:4, height:52, color:col1 });
    p4.drawText('SOCIAL MEDIA ASSETS', { x:M, y:H-34, font:bold, size:18, color:white });
    addFooter(p4, 4);

    const availW = W - M*2;
    const startY = H - 52 - 18;

    // Facebook cover
    sectionLabel(p4, 'FACEBOOK COVER  —  820 x 312 px', M, startY);
    const fbRenderH = Math.round(availW * (312/820));
    const fbY = startY - fbRenderH - 8;
    if (fbImg) {
      const fd = fbImg.scaleToFit(availW, fbRenderH);
      p4.drawImage(fbImg, { x:M+(availW-fd.width)/2, y:fbY+(fbRenderH-fd.height)/2, width:fd.width, height:fd.height });
      // Border
      p4.drawRectangle({ x:M, y:fbY, width:availW, height:fbRenderH,
        borderColor:lightGray, borderWidth:0.5, color:rgb(0,0,0,0) });
    } else {
      p4.drawRectangle({ x:M, y:fbY, width:availW, height:fbRenderH, color:veryLightGray, borderRadius:3 });
      p4.drawText('Facebook Cover', { x:M+availW/2-40, y:fbY+fbRenderH/2, font:reg, size:10, color:midGray });
    }

    // LinkedIn cover
    const liTopY = fbY - 22;
    sectionLabel(p4, 'LINKEDIN COVER  —  1584 x 396 px', M, liTopY);
    const liRenderH = Math.round(availW * (396/1584));
    const liY = liTopY - liRenderH - 8;
    if (liImg) {
      const ld = liImg.scaleToFit(availW, liRenderH);
      p4.drawImage(liImg, { x:M+(availW-ld.width)/2, y:liY+(liRenderH-ld.height)/2, width:ld.width, height:ld.height });
      p4.drawRectangle({ x:M, y:liY, width:availW, height:liRenderH,
        borderColor:lightGray, borderWidth:0.5, color:rgb(0,0,0,0) });
    } else {
      p4.drawRectangle({ x:M, y:liY, width:availW, height:liRenderH, color:veryLightGray, borderRadius:3 });
      p4.drawText('LinkedIn Cover', { x:M+availW/2-40, y:liY+liRenderH/2, font:reg, size:10, color:midGray });
    }

    // ── PAGE 5: Typography & Brand Voice ──────────────────────────────────
    const p5 = doc.addPage([W, H]);
    p5.drawRectangle({ x:0, y:0, width:W, height:H, color:offWhite });
    p5.drawRectangle({ x:0, y:H-52, width:W, height:52, color:nearBlack });
    p5.drawRectangle({ x:0, y:H-52, width:4, height:52, color:col1 });
    p5.drawText('TYPOGRAPHY & BRAND VOICE', { x:M, y:H-34, font:bold, size:18, color:white });
    addFooter(p5, 5);

    const tyY = H - 52 - 20;

    // Typography section - left half
    sectionLabel(p5, 'PRIMARY TYPEFACE', M, tyY);

    // Big type specimen
    p5.drawText('Aa', { x:M, y:tyY-70, font:bold, size:64, color:col1 });
    p5.drawText('Helvetica Bold', { x:M, y:tyY-90, font:bold, size:16, color:nearBlack });
    p5.drawText('Helvetica Regular', { x:M, y:tyY-112, font:reg, size:13, color:darkGray });

    // Alphabet
    p5.drawRectangle({ x:M, y:tyY-124, width:(W/2-M-12), height:0.5, color:lightGray });
    p5.drawText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x:M, y:tyY-140, font:reg, size:8.5, color:midGray });
    p5.drawText('abcdefghijklmnopqrstuvwxyz', { x:M, y:tyY-154, font:reg, size:8.5, color:midGray });
    p5.drawText('0123456789  !@#$%&*()', { x:M, y:tyY-168, font:reg, size:8.5, color:midGray });

    // Usage table
    sectionLabel(p5, 'TYPE SCALE', M, tyY-186);
    const typeRows = [
      ['Display', '48 – 72 pt', 'Bold'],
      ['Heading', '28 – 36 pt', 'Bold'],
      ['Subheading', '18 – 24 pt', 'Bold'],
      ['Body', '10 – 14 pt', 'Regular'],
      ['Caption', '8 – 10 pt', 'Regular'],
    ];
    typeRows.forEach(([use, size, weight], i) => {
      const isFirst = i === 0;
      const ry = tyY - 204 - (i*20);
      if (isFirst) {
        p5.drawRectangle({ x:M, y:ry-5, width:W/2-M-12, height:19, color:col1, borderRadius:2 });
        p5.drawText(use, { x:M+8, y:ry+1, font:bold, size:8.5, color:white });
        p5.drawText(size, { x:M+130, y:ry+1, font:reg, size:8.5, color:rgb(0.85,0.85,0.85) });
        p5.drawText(weight, { x:M+220, y:ry+1, font:reg, size:8.5, color:rgb(0.85,0.85,0.85) });
      } else {
        p5.drawRectangle({ x:M, y:ry-5, width:W/2-M-12, height:19, color:i%2===0?white:veryLightGray, borderRadius:2 });
        p5.drawText(use, { x:M+8, y:ry+1, font:bold, size:8.5, color:darkGray });
        p5.drawText(size, { x:M+130, y:ry+1, font:reg, size:8.5, color:midGray });
        p5.drawText(weight, { x:M+220, y:ry+1, font:reg, size:8.5, color:midGray });
      }
    });

    // Brand voice - right half
    const bvX = W/2 + 12;
    const bvW = W/2 - M - 12;
    sectionLabel(p5, 'BRAND VOICE', bvX, tyY);

    // Personality tags
    if (personality) {
      const tags = personality.split(/[,.]/).map(t => t.trim()).filter(Boolean).slice(0,5);
      let tagX = bvX;
      let tagY = tyY - 22;
      tags.forEach(tag => {
        const tw = bold.widthOfTextAtSize(tag, 8) + 16;
        if (tagX + tw > bvX + bvW) { tagX = bvX; tagY -= 22; }
        p5.drawRectangle({ x:tagX, y:tagY-8, width:tw, height:18, color:col1, borderRadius:9 });
        p5.drawText(tag, { x:tagX+8, y:tagY-1, font:bold, size:8, color:white });
        tagX += tw + 6;
      });
    }

    // Description
    if (description) {
      sectionLabel(p5, 'ABOUT', bvX, tyY-70);
      const words = description.split(' ');
      let line = '', lineY = tyY-88;
      const maxW = bvW;
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (reg.widthOfTextAtSize(test, 8.5) > maxW) {
          if (lineY > 80) {
            p5.drawText(line, { x:bvX, y:lineY, font:reg, size:8.5, color:darkGray });
            lineY -= 14;
          }
          line = word;
        } else { line = test; }
      });
      if (line && lineY > 80) p5.drawText(line, { x:bvX, y:lineY, font:reg, size:8.5, color:darkGray });
    }

    // Tagline callout box
    if (tagline) {
      const tqY = 80;
      p5.drawRectangle({ x:bvX, y:tqY, width:bvW, height:52, color:nearBlack, borderRadius:4 });
      p5.drawRectangle({ x:bvX, y:tqY, width:4, height:52, color:col1, borderRadius:0 });
      p5.drawText('TAGLINE', { x:bvX+16, y:tqY+38, font:bold, size:7, color:col1 });
      // Split tagline if too long
      const maxTW = bvW - 24;
      if (reg.widthOfTextAtSize(tagline, 13) <= maxTW) {
        p5.drawText(tagline, { x:bvX+16, y:tqY+18, font:oblique, size:13, color:white });
      } else {
        const words2 = tagline.split(' ');
        let l1 = '', l2 = '';
        words2.forEach(w => {
          if (!l1 || reg.widthOfTextAtSize(l1+' '+w, 11) <= maxTW) l1 = l1?l1+' '+w:w;
          else l2 = l2?l2+' '+w:w;
        });
        p5.drawText(l1, { x:bvX+16, y:tqY+26, font:oblique, size:11, color:white });
        if (l2) p5.drawText(l2, { x:bvX+16, y:tqY+12, font:oblique, size:11, color:white });
      }
    }

    const pdfBytes = await doc.save();
    const safeName = (brand.brandName||'brand').replace(/[^a-zA-Z0-9]/g,'-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-brand-kit.pdf"`);
    return res.status(200).send(Buffer.from(pdfBytes));

  } catch (e) {
    console.error('PDF generation error:', e);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};

// Helper to get logo dimensions safely
function ld_h(img, maxW, maxH) {
  if (!img) return maxH;
  const s = img.scaleToFit(maxW, maxH);
  return s.height;
}
