const fetch = require('node-fetch');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '20mb' } }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand, logoUrl } = req.body;
  if (!brand) return res.status(400).json({ error: 'Missing brand data' });

  function s(str, max) {
    if (!str) return '';
    return String(str).replace(/[^\x20-\x7E]/g, '').slice(0, max || 300);
  }

  function hexToRgb(hex) {
    const c = (hex || '#000000').replace('#', '');
    return { r: parseInt(c.slice(0,2),16)/255, g: parseInt(c.slice(2,4),16)/255, b: parseInt(c.slice(4,6),16)/255 };
  }

  function toCmyk(r, g, b) {
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c:0, m:0, y:0, k:100 };
    return {
      c: Math.round(((1-r-k)/(1-k))*100),
      m: Math.round(((1-g-k)/(1-k))*100),
      y: Math.round(((1-b-k)/(1-k))*100),
      k: Math.round(k*100)
    };
  }

  async function fetchBuf(url) {
    if (!url) return null;
    if (url.startsWith('data:')) {
      try { return Buffer.from(url.split(',')[1], 'base64'); } catch (_) { return null; }
    }
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { timeout: 25000 });
        if (r.ok) return await r.buffer();
      } catch (_) {
        if (i === 2) return null;
        await new Promise(res => setTimeout(res, 1500));
      }
    }
    return null;
  }

  async function embedImg(doc, url) {
    const buf = await fetchBuf(url);
    if (!buf) return null;
    try { return await doc.embedPng(buf); } catch (_) {}
    try { return await doc.embedJpg(buf); } catch (_) {}
    return null;
  }

  function drawText(page, text, opts) {
    if (!text || !text.trim()) return;
    page.drawText(String(text), opts);
  }

  function wrap(page, text, x, y, font, size, color, maxW, lineH) {
    const words = text.split(' ');
    let line = '', cy = y;
    words.forEach(w => {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        if (cy > 30) page.drawText(line, { x, y: cy, font, size, color });
        line = w; cy -= lineH;
      } else { line = test; }
    });
    if (line && cy > 30) page.drawText(line, { x, y: cy, font, size, color });
    return cy;
  }

  try {
    const c1s = s(brand.c1 || '#D92526', 7);
    const c2s = s(brand.c2 || '#4A4C4D', 7);
    const r1 = hexToRgb(c1s), r2 = hexToRgb(c2s);
    const col1 = rgb(r1.r, r1.g, r1.b);
    const col2 = rgb(r2.r, r2.g, r2.b);
    const cmyk1 = toCmyk(r1.r, r1.g, r1.b);
    const cmyk2 = toCmyk(r2.r, r2.g, r2.b);

    const white = rgb(1, 1, 1);
    const nearBlack = rgb(0.12, 0.12, 0.12);
    const ink = rgb(0.15, 0.15, 0.15);
    const bodyText = rgb(0.30, 0.30, 0.30);
    const muted = rgb(0.55, 0.55, 0.55);
    const faint = rgb(0.82, 0.82, 0.82);
    const bgLight = rgb(0.96, 0.96, 0.96);
    const bgDark = rgb(0.14, 0.14, 0.16);

    const doc = await PDFDocument.create();
    const B = await doc.embedFont(StandardFonts.HelveticaBold);
    const R = await doc.embedFont(StandardFonts.Helvetica);
    const I = await doc.embedFont(StandardFonts.HelveticaOblique);

    const W = 841.89, H = 595.28; // A4 Landscape

    const logoImg = await embedImg(doc, logoUrl);

    const brandName = s(brand.brandName, 50);
    const tagline = s(brand.tagline, 80);
    const niche = s(brand.niche, 100);
    const pers = s(brand.personality, 120);

    // ── Shared footer ─────────────────────────────────────────────────
    function footer(page, num, section) {
      page.drawRectangle({ x: 0, y: 28, width: W, height: 0.5, color: col1 });
      drawText(page, section, { x: 40, y: 14, font: R, size: 8, color: muted });
      const credit = 'Prepared by The AI Owners';
      drawText(page, credit, { x: (W - R.widthOfTextAtSize(credit, 8)) / 2, y: 14, font: R, size: 8, color: muted });
      const pStr = String(num).padStart(2, '0');
      drawText(page, pStr, { x: W - 40 - B.widthOfTextAtSize(pStr, 9), y: 13, font: B, size: 9, color: col1 });
    }

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER
    // ═══════════════════════════════════════════════════════════════════
    const p1 = doc.addPage([W, H]);
    p1.drawRectangle({ x: 0, y: 0, width: W * 0.48, height: H, color: col1 });
    p1.drawRectangle({ x: W * 0.48, y: 0, width: W * 0.52, height: H, color: nearBlack });

    for (let i = 0; i < 8; i++) {
      p1.drawRectangle({ x: W * 0.48, y: H * 0.15 + i * H * 0.1, width: W * 0.52, height: 0.4, color: white, opacity: 0.03 });
    }

    if (logoImg) {
      const ld = logoImg.scaleToFit(W * 0.32, H * 0.42);
      p1.drawImage(logoImg, { x: (W * 0.48 - ld.width) / 2, y: (H - ld.height) / 2 + 20, width: ld.width, height: ld.height });
    }

    p1.drawRectangle({ x: 40, y: H * 0.30, width: W * 0.38, height: 0.6, color: white, opacity: 0.25 });

    const lines = brandName.toUpperCase().split(' ');
    const lineSize = lines.length > 2 ? 46 : lines.length === 2 ? 52 : 60;
    let textY = H * 0.62;
    lines.forEach(line => {
      drawText(p1, line, { x: W * 0.52, y: textY, font: B, size: lineSize, color: white });
      textY -= lineSize + 8;
    });

    if (tagline) {
      drawText(p1, tagline, { x: W * 0.52, y: textY - 10, font: I, size: 14, color: rgb(0.75, 0.77, 0.82) });
    }

    drawText(p1, 'Brand Kit', { x: 40, y: H - 30, font: B, size: 11, color: white, opacity: 0.7 });
    drawText(p1, '01', { x: W - 50, y: H - 30, font: B, size: 11, color: rgb(0.5, 0.52, 0.58) });
    drawText(p1, 'Prepared by The AI Owners', { x: W * 0.52, y: 22, font: R, size: 8, color: rgb(0.40, 0.42, 0.48) });

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 2 — COLOR PALETTE
    // ═══════════════════════════════════════════════════════════════════
    const p2 = doc.addPage([W, H]);
    p2.drawRectangle({ x: 0, y: 0, width: W, height: H, color: white });
    p2.drawRectangle({ x: 0, y: 0, width: 5, height: H, color: col1 });

    drawText(p2, '02', { x: 40, y: H - 32, font: B, size: 11, color: ink });
    drawText(p2, 'Color', { x: 40, y: H - 60, font: B, size: 32, color: ink });
    drawText(p2, 'Palette', { x: 40, y: H - 95, font: B, size: 32, color: ink });
    p2.drawRectangle({ x: 40, y: H - 108, width: W - 80, height: 0.5, color: faint });

    // Swatch 1
    const sw1Y = H - 128, swW = 110, swH = 110;
    p2.drawRectangle({ x: 40, y: sw1Y - swH, width: swW, height: swH, color: col1 });
    const sp1X = 40 + swW + 24;
    drawText(p2, `CMYK : (${cmyk1.c}%, ${cmyk1.m}%, ${cmyk1.y}%, ${cmyk1.k}%)`, { x: sp1X, y: sw1Y - 22, font: R, size: 9, color: bodyText });
    drawText(p2, `RGB : (${Math.round(r1.r*255)}, ${Math.round(r1.g*255)}, ${Math.round(r1.b*255)})`, { x: sp1X, y: sw1Y - 38, font: R, size: 9, color: bodyText });
    drawText(p2, `WEB : ${c1s.toUpperCase()}`, { x: sp1X, y: sw1Y - 54, font: R, size: 9, color: bodyText });

    // Swatch 2
    const sw2Y = sw1Y - swH - 30;
    p2.drawRectangle({ x: 40, y: sw2Y - swH, width: swW, height: swH, color: col2 });
    drawText(p2, `CMYK : (${cmyk2.c}%, ${cmyk2.m}%, ${cmyk2.y}%, ${cmyk2.k}%)`, { x: sp1X, y: sw2Y - 22, font: R, size: 9, color: bodyText });
    drawText(p2, `RGB : (${Math.round(r2.r*255)}, ${Math.round(r2.g*255)}, ${Math.round(r2.b*255)})`, { x: sp1X, y: sw2Y - 38, font: R, size: 9, color: bodyText });
    drawText(p2, `WEB : ${c2s.toUpperCase()}`, { x: sp1X, y: sw2Y - 54, font: R, size: 9, color: bodyText });

    // Color narrative — right column
    const narX = W * 0.55;
    const persWord = pers ? pers.split(',')[0].trim().toLowerCase() : 'confidence';
    const narrative = `The color scheme featuring ${c1s.toUpperCase()} and ${c2s.toUpperCase()} has been carefully selected to reflect the brand's core values. The primary color commands attention and communicates ${persWord}, which is essential for ${niche || 'the industry'}. The secondary color provides balance, sophistication, and grounding. Together they create a dynamic yet professional visual identity that makes the brand stand out while building trust with clients.`;
    wrap(p2, narrative, narX, H - 128, R, 9, bodyText, W - narX - 40, 15);

    footer(p2, 2, 'Introduction');

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 3 — MARK CONSTRUCTION (logo on dark + light)
    // ═══════════════════════════════════════════════════════════════════
    const p3 = doc.addPage([W, H]);
    p3.drawRectangle({ x: 0, y: 0, width: W, height: H, color: white });
    p3.drawRectangle({ x: 0, y: 0, width: 5, height: H, color: col1 });

    drawText(p3, '03', { x: 40, y: H - 32, font: B, size: 11, color: ink });
    drawText(p3, 'Logo', { x: 40, y: H - 60, font: B, size: 32, color: ink });
    drawText(p3, 'Usage', { x: 40, y: H - 95, font: B, size: 32, color: ink });
    p3.drawRectangle({ x: 40, y: H - 108, width: W - 80, height: 0.5, color: faint });

    const cardM = 40;
    const cardGap = 16;
    const cardW = (W - cardM * 2 - cardGap * 2) / 3;
    const cardH = H - 150;
    const cardY = 42;

    // Dark card
    p3.drawRectangle({ x: cardM, y: cardY, width: cardW, height: cardH, color: bgDark, borderRadius: 8 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(cardW - 60, cardH - 60);
      p3.drawImage(logoImg, { x: cardM + (cardW - ld.width) / 2, y: cardY + (cardH - ld.height) / 2, width: ld.width, height: ld.height });
    }
    drawText(p3, 'ON DARK', { x: cardM + cardW / 2 - 20, y: cardY + 12, font: B, size: 7, color: muted });

    // Light card
    const c2X = cardM + cardW + cardGap;
    p3.drawRectangle({ x: c2X, y: cardY, width: cardW, height: cardH, color: bgLight, borderRadius: 8 });
    p3.drawRectangle({ x: c2X, y: cardY, width: cardW, height: cardH, borderColor: faint, borderWidth: 0.5, borderRadius: 8 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(cardW - 60, cardH - 60);
      p3.drawImage(logoImg, { x: c2X + (cardW - ld.width) / 2, y: cardY + (cardH - ld.height) / 2, width: ld.width, height: ld.height });
    }
    drawText(p3, 'ON LIGHT', { x: c2X + cardW / 2 - 22, y: cardY + 12, font: B, size: 7, color: muted });

    // Brand color card
    const c3X = c2X + cardW + cardGap;
    p3.drawRectangle({ x: c3X, y: cardY, width: cardW, height: cardH, color: col1, borderRadius: 8 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(cardW - 60, cardH - 60);
      p3.drawImage(logoImg, { x: c3X + (cardW - ld.width) / 2, y: cardY + (cardH - ld.height) / 2, width: ld.width, height: ld.height });
    }
    drawText(p3, 'ON BRAND', { x: c3X + cardW / 2 - 24, y: cardY + 12, font: B, size: 7, color: white });

    footer(p3, 3, 'Introduction');

    // ═══════════════════════════════════════════════════════════════════
    // PAGE 4 — TYPOGRAPHY
    // ═══════════════════════════════════════════════════════════════════
    const p4 = doc.addPage([W, H]);
    p4.drawRectangle({ x: 0, y: 0, width: W, height: H, color: white });
    p4.drawRectangle({ x: 0, y: 0, width: 5, height: H, color: col1 });

    drawText(p4, '04', { x: 40, y: H - 32, font: B, size: 11, color: ink });
    drawText(p4, 'Corporate', { x: 40, y: H - 60, font: B, size: 32, color: ink });
    drawText(p4, 'Typography', { x: 40, y: H - 95, font: B, size: 32, color: ink });
    p4.drawRectangle({ x: 40, y: H - 108, width: W - 80, height: 0.5, color: faint });

    // Left column — type specimen
    const tyX = 40, tyW = W * 0.50 - 20;
    let tyY = H - 128;

    drawText(p4, 'PRIMARY TYPEFACE', { x: tyX, y: tyY, font: B, size: 8, color: muted });
    tyY -= 6;
    p4.drawRectangle({ x: tyX, y: tyY, width: tyW, height: 0.5, color: faint });
    tyY -= 14;
    drawText(p4, 'Helvetica Semibold', { x: tyX, y: tyY, font: B, size: 14, color: ink });
    tyY -= 22;
    drawText(p4, 'aA', { x: tyX, y: tyY - 45, font: B, size: 80, color: ink });
    tyY -= 70;
    drawText(p4, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x: tyX, y: tyY - 10, font: B, size: 9, color: muted });
    drawText(p4, 'abcdefghijklmnopqrstuvwxyz', { x: tyX, y: tyY - 26, font: R, size: 9, color: muted });
    drawText(p4, '0123456789!@#$%^&*()', { x: tyX, y: tyY - 42, font: R, size: 9, color: muted });

    tyY -= 60;
    p4.drawRectangle({ x: tyX, y: tyY, width: tyW, height: 0.5, color: faint });
    tyY -= 16;
    wrap(p4, 'Typography is the voice of a brand. The primary typeface should be used consistently across all brand materials — from digital to print — to build recognition and reinforce professionalism.', tyX, tyY, R, 8.5, bodyText, tyW, 13);

    // Right column — usage scale
    const scX = W * 0.52;
    let scY = H - 128;
    drawText(p4, 'Headings', { x: scX, y: scY, font: B, size: 9, color: muted });
    drawText(p4, 'Titles', { x: scX, y: scY - 16, font: B, size: 9, color: muted });
    drawText(p4, 'Subtitles', { x: scX, y: scY - 32, font: B, size: 9, color: muted });
    drawText(p4, 'Bold', { x: scX, y: scY - 48, font: B, size: 9, color: muted });
    drawText(p4, 'Number', { x: scX, y: scY - 64, font: B, size: 9, color: muted });
    p4.drawRectangle({ x: scX + 70, y: scY - 70, width: W - scX - 70 - 40, height: 0.5, color: faint });
    drawText(p4, 'Primary Font', { x: scX, y: scY - 84, font: B, size: 11, color: ink });

    scY -= 104;
    p4.drawRectangle({ x: scX, y: scY, width: W - scX - 40, height: 0.5, color: faint });
    scY -= 18;
    drawText(p4, 'Helvetica Regular', { x: scX, y: scY, font: R, size: 14, color: ink });
    scY -= 22;
    drawText(p4, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x: scX, y: scY, font: R, size: 8.5, color: muted });
    scY -= 16;
    drawText(p4, 'abcdefghijklmnopqrstuvwxyz', { x: scX, y: scY, font: R, size: 8.5, color: muted });
    scY -= 16;
    drawText(p4, '0123456789!', { x: scX, y: scY, font: R, size: 8.5, color: muted });

    // Tagline callout box
    if (tagline) {
      scY -= 32;
      p4.drawRectangle({ x: scX, y: scY - 56, width: W - scX - 40, height: 60, color: col1, borderRadius: 4 });
      drawText(p4, 'BRAND TAGLINE', { x: scX + 16, y: scY - 18, font: B, size: 7, color: rgb(1, 1, 1) });
      const tq = s(tagline, 55);
      const tqW = W - scX - 60;
      if (I.widthOfTextAtSize(tq, 14) <= tqW) {
        drawText(p4, tq, { x: scX + 16, y: scY - 38, font: I, size: 14, color: white });
      } else {
        const wds = tq.split(' ');
        let l1 = '', l2 = '';
        wds.forEach(w => {
          if (I.widthOfTextAtSize((l1 ? l1 + ' ' : '') + w, 11) <= tqW) l1 = (l1 ? l1 + ' ' : '') + w;
          else l2 = (l2 ? l2 + ' ' : '') + w;
        });
        drawText(p4, l1, { x: scX + 16, y: scY - 30, font: I, size: 11, color: white });
        if (l2) drawText(p4, l2, { x: scX + 16, y: scY - 46, font: I, size: 11, color: white });
      }
    }

    footer(p4, 4, 'Introduction');

    // ── Save and send ─────────────────────────────────────────────────
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
