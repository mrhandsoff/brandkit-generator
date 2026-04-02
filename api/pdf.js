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

  // Sanitise string — strip anything outside printable ASCII for pdf-lib standard fonts
  function s(str, max) {
    if (!str) return '';
    return String(str).replace(/[^\x20-\x7E]/g, '').slice(0, max || 300);
  }

  function hexToRgb(hex) {
    const c = (hex || '#000000').replace('#', '');
    return {
      r: parseInt(c.slice(0,2), 16) / 255,
      g: parseInt(c.slice(2,4), 16) / 255,
      b: parseInt(c.slice(4,6), 16) / 255
    };
  }

  function toCmyk(r, g, b) {
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1-r-k)/(1-k))*100),
      m: Math.round(((1-g-k)/(1-k))*100),
      y: Math.round(((1-b-k)/(1-k))*100),
      k: Math.round(k * 100)
    };
  }

  async function fetchBuf(url) {
    if (!url) return null;
    try {
      const r = await fetch(url, { timeout: 15000 });
      if (!r.ok) return null;
      return await r.buffer();
    } catch (e) { return null; }
  }

  async function embedImg(doc, url) {
    const buf = await fetchBuf(url);
    if (!buf) return null;
    try { return await doc.embedPng(buf); } catch (e) {}
    try { return await doc.embedJpg(buf); } catch (e) {}
    return null;
  }

  try {
    const c1s = brand.c1 || '#1A56DB';
    const c2s = brand.c2 || '#374151';
    const r1 = hexToRgb(c1s), r2 = hexToRgb(c2s);
    const col1 = rgb(r1.r, r1.g, r1.b);
    const col2 = rgb(r2.r, r2.g, r2.b);
    const white = rgb(1, 1, 1);
    const nearBlack = rgb(0.06, 0.07, 0.09);
    const darkBg = rgb(0.1, 0.12, 0.16);
    const surfaceBg = rgb(0.94, 0.95, 0.97);
    const lightBorder = rgb(0.88, 0.90, 0.93);
    const midGray = rgb(0.50, 0.54, 0.60);
    const darkText = rgb(0.12, 0.14, 0.18);
    const mutedText = rgb(0.38, 0.42, 0.50);

    const cmyk1 = toCmyk(r1.r, r1.g, r1.b);
    const cmyk2 = toCmyk(r2.r, r2.g, r2.b);

    const doc = await PDFDocument.create();

    // Use Helvetica — reliable, clean, no runtime fetch needed
    // We'll use it well rather than fighting custom fonts
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const it = await doc.embedFont(StandardFonts.HelveticaOblique);

    const W = 841.89, H = 595.28, M = 40;

    const [logoImg, fbImg, liImg] = await Promise.all([
      embedImg(doc, logoUrl),
      embedImg(doc, fbUrl),
      embedImg(doc, liUrl)
    ]);

    const brandName = s(brand.brandName, 50);
    const tagline = s(brand.tagline, 70);
    const niche = s(brand.niche, 90);
    const personality = s(brand.personality, 100);
    const description = s(brand.description, 280);

    // ── Footer helper ──────────────────────────────────────────────────────
    function footer(page, n) {
      page.drawRectangle({ x:0, y:0, width:W, height:20, color:nearBlack });
      page.drawRectangle({ x:0, y:0, width:3, height:20, color:col1 });
      page.drawText(brandName, { x:12, y:6, font:reg, size:8, color:mutedText });
      page.drawText(`0${n}`, { x:W-M, y:6, font:bold, size:8, color:midGray });
    }

    // ── Wrap text helper ───────────────────────────────────────────────────
    function drawWrapped(page, text, x, y, font, size, color, maxW, lineH) {
      const words = text.split(' ');
      let line = '', curY = y;
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(test, size) > maxW) {
          if (curY > 30) { page.drawText(line, { x, y:curY, font, size, color }); }
          line = word; curY -= lineH;
        } else { line = test; }
      });
      if (line && curY > 30) page.drawText(line, { x, y:curY, font, size, color });
      return curY;
    }

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 1 — COVER
    // ─────────────────────────────────────────────────────────────────────
    const p1 = doc.addPage([W, H]);

    // Full dark background
    p1.drawRectangle({ x:0, y:0, width:W, height:H, color:nearBlack });

    // Left accent panel
    p1.drawRectangle({ x:0, y:0, width:W*0.40, height:H, color:col1 });

    // Subtle dot grid on left panel
    for (let gx = 24; gx < W*0.38; gx += 22) {
      for (let gy = 24; gy < H; gy += 22) {
        p1.drawCircle({ x:gx, y:gy, size:1, color:rgb(1,1,1), opacity:0.08 });
      }
    }

    // Diagonal cut on right edge of left panel
    p1.drawRectangle({ x:W*0.40, y:0, width:3, height:H, color:rgb(1,1,1), opacity:0.06 });

    // Logo centered in left panel
    if (logoImg) {
      const ld = logoImg.scaleToFit(W*0.28, H*0.40);
      p1.drawImage(logoImg, {
        x: (W*0.40 - ld.width) / 2,
        y: H/2 - ld.height/2,
        width: ld.width, height: ld.height
      });
    }

    // Horizontal line below logo
    p1.drawRectangle({ x:M, y:H/2 - (logoImg ? logoImg.scaleToFit(W*0.28,H*0.40).height/2 : 60) - 20, width:W*0.32, height:0.5, color:rgb(1,1,1), opacity:0.2 });

    // Right side — brand name + tagline
    const nameSize = brandName.length > 20 ? 38 : brandName.length > 14 ? 46 : 56;
    p1.drawText(brandName, { x:W*0.44, y:H*0.57, font:bold, size:nameSize, color:white });

    // Colour accent bar under name
    p1.drawRectangle({ x:W*0.44, y:H*0.57 - 10, width:56, height:3, color:col1 });

    if (tagline) {
      p1.drawText(tagline, { x:W*0.44, y:H*0.57 - 30, font:reg, size:15, color:rgb(0.7,0.74,0.82) });
    }

    // Brand Kit label
    p1.drawText('BRAND KIT', { x:W*0.44, y:H*0.20, font:bold, size:8, color:rgb(0.35,0.40,0.50) });
    p1.drawText(new Date().toLocaleDateString('en-GB', { month:'long', year:'numeric' }), {
      x:W*0.44, y:H*0.20 - 14, font:reg, size:9, color:rgb(0.30,0.35,0.45)
    });

    footer(p1, 1);

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 2 — COLOR PALETTE
    // ─────────────────────────────────────────────────────────────────────
    const p2 = doc.addPage([W, H]);
    p2.drawRectangle({ x:0, y:0, width:W, height:H, color:surfaceBg });

    // Header
    p2.drawRectangle({ x:0, y:H-56, width:W, height:56, color:nearBlack });
    p2.drawRectangle({ x:0, y:H-56, width:4, height:56, color:col1 });
    p2.drawText('COLOR PALETTE', { x:M, y:H-36, font:bold, size:20, color:white });

    footer(p2, 2);

    const swY = H - 80, swW = 195, swH = 155;

    // Primary swatch
    p2.drawRectangle({ x:M, y:swY-swH, width:swW, height:swH, color:col1, borderRadius:6 });
    // Dark strip at bottom of swatch
    p2.drawRectangle({ x:M, y:swY-swH, width:swW, height:48, color:rgb(0,0,0), opacity:0.3 });
    p2.drawText(c1s.toUpperCase(), { x:M+14, y:swY-swH+28, font:bold, size:16, color:white });
    p2.drawText('Primary', { x:M+14, y:swY-swH+11, font:reg, size:9, color:rgb(0.85,0.87,0.92) });

    // Primary specs card
    const specY1 = swY - swH - 14;
    p2.drawRectangle({ x:M, y:specY1-52, width:swW, height:56, color:white, borderRadius:4,
      borderColor:lightBorder, borderWidth:0.5 });

    [
      ['HEX', c1s.toUpperCase()],
      ['RGB', `${Math.round(r1.r*255)}, ${Math.round(r1.g*255)}, ${Math.round(r1.b*255)}`],
      ['CMYK', `${cmyk1.c}  ${cmyk1.m}  ${cmyk1.y}  ${cmyk1.k}`],
    ].forEach(([lbl, val], i) => {
      const ry = specY1 - 16 - i*14;
      p2.drawText(lbl, { x:M+10, y:ry, font:bold, size:7.5, color:mutedText });
      p2.drawText(val, { x:M+54, y:ry, font:reg, size:7.5, color:darkText });
    });

    // Secondary swatch
    const sx2 = M + swW + 20;
    p2.drawRectangle({ x:sx2, y:swY-swH, width:swW, height:swH, color:col2, borderRadius:6 });
    p2.drawRectangle({ x:sx2, y:swY-swH, width:swW, height:48, color:rgb(0,0,0), opacity:0.35 });
    p2.drawText(c2s.toUpperCase(), { x:sx2+14, y:swY-swH+28, font:bold, size:16, color:white });
    p2.drawText('Secondary', { x:sx2+14, y:swY-swH+11, font:reg, size:9, color:rgb(0.82,0.84,0.89) });

    p2.drawRectangle({ x:sx2, y:specY1-52, width:swW, height:56, color:white, borderRadius:4,
      borderColor:lightBorder, borderWidth:0.5 });
    [
      ['HEX', c2s.toUpperCase()],
      ['RGB', `${Math.round(r2.r*255)}, ${Math.round(r2.g*255)}, ${Math.round(r2.b*255)}`],
      ['CMYK', `${cmyk2.c}  ${cmyk2.m}  ${cmyk2.y}  ${cmyk2.k}`],
    ].forEach(([lbl, val], i) => {
      const ry = specY1 - 16 - i*14;
      p2.drawText(lbl, { x:sx2+10, y:ry, font:bold, size:7.5, color:mutedText });
      p2.drawText(val, { x:sx2+54, y:ry, font:reg, size:7.5, color:darkText });
    });

    // Usage notes
    const ux = sx2 + swW + 28;
    const uW = W - ux - M;

    p2.drawText('USAGE GUIDELINES', { x:ux, y:swY-8, font:bold, size:8.5, color:mutedText });
    p2.drawRectangle({ x:ux, y:swY-14, width:uW, height:1, color:col1 });

    [
      `${c1s} is the primary brand colour. Use it for calls to action, headings, and key interactive elements.`,
      `${c2s} is the secondary colour. Use it for body text, backgrounds, and supporting design elements.`,
      'Always maintain a minimum contrast ratio of 4.5:1 when placing text over coloured backgrounds.',
    ].forEach((line, i) => {
      drawWrapped(p2, line, ux, swY-30-(i*38), reg, 8.5, darkText, uW, 13);
    });

    // Utility swatches
    p2.drawText('UTILITY', { x:ux, y:specY1+8, font:bold, size:8.5, color:mutedText });
    const utils = [
      ['White', '#FFFFFF', 1, 1, 1, true],
      ['Black', '#1A1A1A', 0.1, 0.1, 0.1, false],
      ['Light Gray', '#F3F4F6', 0.95, 0.96, 0.97, true],
    ];
    utils.forEach(([name, hex, rr, gg, bb, dark], i) => {
      const uy = specY1 - 12 - i*46;
      p2.drawRectangle({ x:ux, y:uy-30, width:uW, height:34, color:rgb(rr,gg,bb), borderRadius:4,
        borderColor:lightBorder, borderWidth:0.5 });
      p2.drawText(name, { x:ux+10, y:uy-12, font:bold, size:8, color:dark?darkText:white });
      p2.drawText(hex, { x:ux+10, y:uy-24, font:reg, size:7.5, color:dark?mutedText:rgb(0.7,0.7,0.7) });
    });

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 3 — LOGO
    // ─────────────────────────────────────────────────────────────────────
    const p3 = doc.addPage([W, H]);
    p3.drawRectangle({ x:0, y:0, width:W, height:H, color:surfaceBg });
    p3.drawRectangle({ x:0, y:H-56, width:W, height:56, color:nearBlack });
    p3.drawRectangle({ x:0, y:H-56, width:4, height:56, color:col1 });
    p3.drawText('LOGO MARK', { x:M, y:H-36, font:bold, size:20, color:white });
    footer(p3, 3);

    const lbW = (W - M*2 - 20) / 2;
    const lbH = H - 56 - 22 - 90;
    const lbY = 90;

    // Light bg box
    p3.drawRectangle({ x:M, y:lbY, width:lbW, height:lbH, color:white,
      borderColor:lightBorder, borderWidth:0.5, borderRadius:6 });
    p3.drawText('ON LIGHT', { x:M+8, y:lbY+lbH-20, font:bold, size:8, color:mutedText });
    if (logoImg) {
      const ld = logoImg.scaleToFit(lbW-60, lbH-60);
      p3.drawImage(logoImg, { x:M+(lbW-ld.width)/2, y:lbY+(lbH-ld.height)/2, width:ld.width, height:ld.height });
    }

    // Dark bg box
    const dbX = M + lbW + 20;
    p3.drawRectangle({ x:dbX, y:lbY, width:lbW, height:lbH, color:nearBlack, borderRadius:6 });
    p3.drawText('ON DARK', { x:dbX+8, y:lbY+lbH-20, font:bold, size:8, color:rgb(0.4,0.44,0.52) });
    if (logoImg) {
      const ld = logoImg.scaleToFit(lbW-60, lbH-60);
      p3.drawImage(logoImg, { x:dbX+(lbW-ld.width)/2, y:lbY+(lbH-ld.height)/2, width:ld.width, height:ld.height });
    }

    // Guidelines
    p3.drawText('LOGO GUIDELINES', { x:M, y:lbY-24, font:bold, size:8.5, color:mutedText });
    p3.drawRectangle({ x:M, y:lbY-30, width:W-M*2, height:0.5, color:lightBorder });
    [
      'Maintain clear space equal to the cap-height of the wordmark on all sides of the logo.',
      'Do not distort, rotate, recolour, or add drop shadows or effects to the logo.',
    ].forEach((txt, i) => {
      p3.drawText('—', { x:M, y:lbY-46-(i*14), font:reg, size:8.5, color:col1 });
      p3.drawText(txt, { x:M+14, y:lbY-46-(i*14), font:reg, size:8.5, color:darkText });
    });

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 4 — SOCIAL ASSETS
    // ─────────────────────────────────────────────────────────────────────
    const p4 = doc.addPage([W, H]);
    p4.drawRectangle({ x:0, y:0, width:W, height:H, color:surfaceBg });
    p4.drawRectangle({ x:0, y:H-56, width:W, height:56, color:nearBlack });
    p4.drawRectangle({ x:0, y:H-56, width:4, height:56, color:col1 });
    p4.drawText('SOCIAL MEDIA ASSETS', { x:M, y:H-36, font:bold, size:20, color:white });
    footer(p4, 4);

    const availW = W - M*2;
    const startY = H - 70;

    p4.drawText('FACEBOOK COVER', { x:M, y:startY, font:bold, size:8.5, color:mutedText });
    p4.drawText('820 x 312 px', { x:M + bold.widthOfTextAtSize('FACEBOOK COVER', 8.5) + 10, y:startY, font:reg, size:8.5, color:rgb(0.6,0.65,0.72) });

    const fbH = Math.round(availW * (312/820));
    const fbY = startY - fbH - 8;

    if (fbImg) {
      const fd = fbImg.scaleToFit(availW, fbH);
      p4.drawImage(fbImg, { x:M+(availW-fd.width)/2, y:fbY+(fbH-fd.height)/2, width:fd.width, height:fd.height });
    }
    p4.drawRectangle({ x:M, y:fbY, width:availW, height:fbH,
      borderColor:lightBorder, borderWidth:0.5, color:fbImg?rgb(0,0,0,0):rgb(0.90,0.91,0.94) });
    if (!fbImg) p4.drawText('Facebook Cover', { x:M+availW/2-42, y:fbY+fbH/2-5, font:reg, size:10, color:mutedText });

    const liTop = fbY - 22;
    p4.drawText('LINKEDIN COVER', { x:M, y:liTop, font:bold, size:8.5, color:mutedText });
    p4.drawText('1584 x 396 px', { x:M + bold.widthOfTextAtSize('LINKEDIN COVER', 8.5) + 10, y:liTop, font:reg, size:8.5, color:rgb(0.6,0.65,0.72) });

    const liH = Math.round(availW * (396/1584));
    const liY = liTop - liH - 8;

    if (liImg) {
      const ld = liImg.scaleToFit(availW, liH);
      p4.drawImage(liImg, { x:M+(availW-ld.width)/2, y:liY+(liH-ld.height)/2, width:ld.width, height:ld.height });
    }
    p4.drawRectangle({ x:M, y:liY, width:availW, height:liH,
      borderColor:lightBorder, borderWidth:0.5, color:liImg?rgb(0,0,0,0):rgb(0.90,0.91,0.94) });
    if (!liImg) p4.drawText('LinkedIn Cover', { x:M+availW/2-40, y:liY+liH/2-5, font:reg, size:10, color:mutedText });

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 5 — TYPOGRAPHY & BRAND VOICE
    // ─────────────────────────────────────────────────────────────────────
    const p5 = doc.addPage([W, H]);
    p5.drawRectangle({ x:0, y:0, width:W, height:H, color:surfaceBg });
    p5.drawRectangle({ x:0, y:H-56, width:W, height:56, color:nearBlack });
    p5.drawRectangle({ x:0, y:H-56, width:4, height:56, color:col1 });
    p5.drawText('TYPOGRAPHY & BRAND VOICE', { x:M, y:H-36, font:bold, size:20, color:white });
    footer(p5, 5);

    const tyY = H - 75;
    const halfW = (W - M*2 - 24) / 2;

    // Left — typography
    p5.drawText('PRIMARY TYPEFACE', { x:M, y:tyY, font:bold, size:8.5, color:mutedText });
    p5.drawRectangle({ x:M, y:tyY-6, width:halfW, height:0.5, color:col1 });

    p5.drawText('Aa', { x:M, y:tyY-68, font:bold, size:60, color:col1 });
    p5.drawText('Helvetica Bold', { x:M, y:tyY-84, font:bold, size:15, color:darkText });
    p5.drawText('Helvetica Regular', { x:M, y:tyY-102, font:reg, size:12, color:midGray });

    p5.drawRectangle({ x:M, y:tyY-112, width:halfW, height:0.5, color:lightBorder });
    p5.drawText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x:M, y:tyY-126, font:reg, size:8.5, color:mutedText });
    p5.drawText('abcdefghijklmnopqrstuvwxyz  0123456789', { x:M, y:tyY-140, font:reg, size:8.5, color:mutedText });

    p5.drawText('TYPE SCALE', { x:M, y:tyY-160, font:bold, size:8.5, color:mutedText });
    p5.drawRectangle({ x:M, y:tyY-166, width:halfW, height:0.5, color:lightBorder });

    [
      ['Display', '48-72pt', 'Bold', true],
      ['Heading', '24-36pt', 'Bold', false],
      ['Subheading', '16-20pt', 'Bold', false],
      ['Body', '10-14pt', 'Regular', false],
      ['Caption', '8-10pt', 'Regular', false],
    ].forEach(([use, size, wt, accent], i) => {
      const ry = tyY - 182 - i*19;
      p5.drawRectangle({ x:M, y:ry-5, width:halfW, height:17,
        color: accent ? col1 : (i%2===0 ? white : rgb(0.92,0.93,0.95)), borderRadius:2 });
      p5.drawText(use, { x:M+8, y:ry+1, font:accent?bold:reg, size:8.5, color:accent?white:darkText });
      p5.drawText(size, { x:M+halfW*0.54, y:ry+1, font:reg, size:8.5, color:accent?rgb(0.85,0.87,0.92):mutedText });
      p5.drawText(wt, { x:M+halfW*0.78, y:ry+1, font:reg, size:8.5, color:accent?rgb(0.85,0.87,0.92):mutedText });
    });

    // Right — brand voice
    const bvX = M + halfW + 24;
    const bvW = halfW;

    p5.drawText('BRAND VOICE', { x:bvX, y:tyY, font:bold, size:8.5, color:mutedText });
    p5.drawRectangle({ x:bvX, y:tyY-6, width:bvW, height:0.5, color:col1 });

    // Personality tags
    if (personality) {
      const tags = personality.split(/[,.]/).map(t => t.trim()).filter(Boolean).slice(0, 5);
      let tagX = bvX, tagY = tyY - 24;
      tags.forEach(tag => {
        const clean = s(tag, 30);
        const tw = bold.widthOfTextAtSize(clean, 8) + 18;
        if (tagX + tw > bvX + bvW) { tagX = bvX; tagY -= 22; }
        p5.drawRectangle({ x:tagX, y:tagY-8, width:tw, height:18, color:col1, borderRadius:9 });
        p5.drawText(clean, { x:tagX+9, y:tagY-1, font:bold, size:8, color:white });
        tagX += tw + 6;
      });
    }

    // About
    if (description) {
      p5.drawText('ABOUT', { x:bvX, y:tyY-66, font:bold, size:8.5, color:mutedText });
      p5.drawRectangle({ x:bvX, y:tyY-72, width:bvW, height:0.5, color:lightBorder });
      drawWrapped(p5, description, bvX, tyY-88, reg, 8.5, darkText, bvW, 14);
    }

    // Tagline callout
    if (tagline) {
      const tqY = 85;
      p5.drawRectangle({ x:bvX, y:tqY, width:bvW, height:58, color:nearBlack, borderRadius:6 });
      p5.drawRectangle({ x:bvX, y:tqY, width:4, height:58, color:col1 });
      p5.drawText('TAGLINE', { x:bvX+16, y:tqY+43, font:bold, size:7, color:col1 });

      // Split tagline safely if needed
      const tqClean = s(tagline, 65);
      const maxTW = bvW - 28;
      if (it.widthOfTextAtSize(tqClean, 13) <= maxTW) {
        p5.drawText(tqClean, { x:bvX+16, y:tqY+24, font:it, size:13, color:white });
      } else {
        const words = tqClean.split(' ');
        let l1 = '', l2 = '';
        words.forEach(w => {
          const test = l1 ? l1+' '+w : w;
          if (it.widthOfTextAtSize(test, 11) <= maxTW) l1 = test;
          else l2 = l2 ? l2+' '+w : w;
        });
        p5.drawText(l1, { x:bvX+16, y:tqY+30, font:it, size:11, color:white });
        if (l2) p5.drawText(l2, { x:bvX+16, y:tqY+14, font:it, size:11, color:white });
      }
    }

    const pdfBytes = await doc.save();
    const fname = s(brand.brandName, 40).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'brand';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}-brand-kit.pdf"`);
    return res.status(200).send(Buffer.from(pdfBytes));

  } catch (e) {
    console.error('PDF error:', e);
    return res.status(500).json({ error: e.message });
  }
};
