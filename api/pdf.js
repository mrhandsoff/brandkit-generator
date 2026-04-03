const fetch = require('node-fetch');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Increase Vercel timeout and body size for base64 image payloads
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

  const { brand, logoUrl, fbUrl, liUrl } = req.body;
  if (!brand) return res.status(400).json({ error: 'Missing brand data' });

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
    // Handle base64 data URLs sent from browser
    if (url.startsWith('data:')) {
      try {
        const base64 = url.split(',')[1];
        return Buffer.from(base64, 'base64');
      } catch (e) { return null; }
    }
    // Fetch remote URL with retries
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BrandKit/1.0)',
            'Accept': 'image/*,*/*'
          }
        });
        if (!r.ok) continue;
        return await r.buffer();
      } catch (e) {
        if (attempt === 2) return null;
        await new Promise(res => setTimeout(res, 1000));
      }
    }
    return null;
  }

  async function embedImg(doc, url) {
    const buf = await fetchBuf(url);
    if (!buf) return null;
    try { return await doc.embedPng(buf); } catch (e) {}
    try { return await doc.embedJpg(buf); } catch (e) {}
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
        if (cy > 30) page.drawText(line, { x, y:cy, font, size, color });
        line = w; cy -= lineH;
      } else { line = test; }
    });
    if (line && cy > 30) page.drawText(line, { x, y:cy, font, size, color });
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

    // Color system — matches reference PDF aesthetic
    const white      = rgb(1, 1, 1);
    const nearBlack  = rgb(0.12, 0.12, 0.12);
    const ink        = rgb(0.15, 0.15, 0.15);
    const bodyText   = rgb(0.30, 0.30, 0.30);
    const muted      = rgb(0.55, 0.55, 0.55);
    const faint      = rgb(0.82, 0.82, 0.82);
    const bgLight    = rgb(0.96, 0.96, 0.96);
    const bgDark     = rgb(0.14, 0.14, 0.16);

    const doc = await PDFDocument.create();
    const B  = await doc.embedFont(StandardFonts.HelveticaBold);
    const R  = await doc.embedFont(StandardFonts.Helvetica);
    const BI = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
    const I  = await doc.embedFont(StandardFonts.HelveticaOblique);

    // A4 Landscape
    const W = 841.89, H = 595.28;

    const [logoImg, fbImg, liImg] = await Promise.all([
      embedImg(doc, logoUrl),
      embedImg(doc, fbUrl),
      embedImg(doc, liUrl)
    ]);

    const brandName = s(brand.brandName, 50);
    const tagline   = s(brand.tagline, 80);
    const niche     = s(brand.niche, 100);
    const pers      = s(brand.personality, 120);
    const desc      = s(brand.description, 400);

    // ── Shared footer ──────────────────────────────────────────────────────
    function footer(page, num, section) {
      // Bottom rule
      page.drawRectangle({ x:0, y:28, width:W, height:0.5, color:faint });
      // Left: section name
      drawText(page, section, { x:40, y:14, font:R, size:8, color:muted });
      // Center: prepared by
      const credit = 'Prepared by The AI Owners';
      drawText(page, credit, { x:(W - R.widthOfTextAtSize(credit,8))/2, y:14, font:R, size:8, color:muted });
      // Right: page number
      const pStr = `${String(num).padStart(2,'0')}`;
      drawText(page, pStr, { x:W-40-B.widthOfTextAtSize(pStr,9), y:13, font:B, size:9, color:col1 });
    }

    // ── Shared left accent sidebar ─────────────────────────────────────────
    function leftBar(page, label) {
      // Vertical rule at left
      page.drawRectangle({ x:30, y:42, width:1.5, height:H-70, color:col1 });
      // Rotated label — approximate by drawing character by character
      // pdf-lib doesn't support rotation on text natively so we use a label at the top
      if (label) {
        drawText(page, label.toUpperCase(), { x:8, y:H-50, font:B, size:7.5, color:muted, rotate: { type:'degrees', angle:90 } });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 1 — COVER (full bleed, matches reference exactly)
    // ─────────────────────────────────────────────────────────────────────
    const p1 = doc.addPage([W, H]);

    // Full bleed: left half brand color, right half near-black
    p1.drawRectangle({ x:0, y:0, width:W*0.48, height:H, color:col1 });
    p1.drawRectangle({ x:W*0.48, y:0, width:W*0.52, height:H, color:nearBlack });

    // Subtle texture lines on the dark side
    for (let i = 0; i < 8; i++) {
      const y = H*0.15 + i*(H*0.1);
      p1.drawRectangle({ x:W*0.48, y, width:W*0.52, height:0.4, color:white, opacity:0.03 });
    }

    // Logo in left panel — centered vertically
    if (logoImg) {
      const ld = logoImg.scaleToFit(W*0.32, H*0.42);
      const lx = (W*0.48 - ld.width) / 2;
      const ly = (H - ld.height) / 2 + 20;
      p1.drawImage(logoImg, { x:lx, y:ly, width:ld.width, height:ld.height });
    }

    // Horizontal thin rule below logo on left panel
    p1.drawRectangle({ x:40, y:H*0.30, width:W*0.38, height:0.6, color:white, opacity:0.25 });

    // Brand name — stacked large on the right side (matches reference)
    const lines = brandName.toUpperCase().split(' ');
    const lineSize = lines.length > 2 ? 46 : lines.length === 2 ? 52 : 60;
    let textY = H * 0.62;
    lines.forEach(line => {
      drawText(p1, line, { x:W*0.52, y:textY, font:B, size:lineSize, color:white });
      textY -= lineSize + 8;
    });

    // Tagline below brand name
    if (tagline) {
      drawText(p1, tagline, { x:W*0.52, y:textY - 10, font:I, size:14, color:rgb(0.75,0.77,0.82) });
    }

    // "Brand Kit" label + website top left corner
    drawText(p1, 'Brand Kit', { x:40, y:H-30, font:B, size:11, color:white, opacity:0.7 });
    if (brand.website) {
      drawText(p1, s(brand.website, 50), { x:40, y:H-46, font:R, size:9, color:rgb(0.7,0.72,0.78) });
    }

    // Page number top right
    drawText(p1, '01', { x:W-50, y:H-30, font:B, size:11, color:rgb(0.5,0.52,0.58) });

    // "Prepared by" — bottom right
    drawText(p1, 'Prepared by The AI Owners', { x:W*0.52, y:22, font:R, size:8, color:rgb(0.40,0.42,0.48) });

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 2 — COLOR PALETTE (matches reference: 2-column, full specs)
    // ─────────────────────────────────────────────────────────────────────
    const p2 = doc.addPage([W, H]);
    p2.drawRectangle({ x:0, y:0, width:W, height:H, color:white });

    // Left sidebar accent
    p2.drawRectangle({ x:0, y:0, width:5, height:H, color:col1 });

    // Top: section header
    drawText(p2, 'Introduction', { x:40, y:H-32, font:R, size:9, color:muted });
    drawText(p2, '02', { x:W-50, y:H-32, font:B, size:9, color:muted });

    // Main title
    drawText(p2, 'Color', { x:40, y:H-60, font:B, size:28, color:ink });
    drawText(p2, 'Palette', { x:40, y:H-90, font:B, size:28, color:ink });

    // Horizontal rule after title
    p2.drawRectangle({ x:40, y:H-100, width:W-80, height:0.5, color:faint });

    // ── Swatch 1 ──
    const sw1X = 40, sw1Y = H-120, swW = 110, swH = 110;
    p2.drawRectangle({ x:sw1X, y:sw1Y-swH, width:swW, height:swH, color:col1 });
    // Specs to the right of swatch
    const sp1X = sw1X + swW + 20;
    drawText(p2, `CMYK : (${cmyk1.c}%, ${cmyk1.m}%, ${cmyk1.y}%, ${cmyk1.k}%)`, { x:sp1X, y:sw1Y-22, font:R, size:9, color:bodyText });
    drawText(p2, `RGB : (${Math.round(r1.r*255)}, ${Math.round(r1.g*255)}, ${Math.round(r1.b*255)})`, { x:sp1X, y:sw1Y-38, font:R, size:9, color:bodyText });
    drawText(p2, `WEB : ${c1s.toUpperCase()}`, { x:sp1X, y:sw1Y-54, font:R, size:9, color:bodyText });

    // Description paragraph for color 1
    const desc1 = `The primary brand color ${c1s} brings energy, confidence, and attention. Use it for calls to action, headings, and key brand touchpoints where impact is needed.`;
    wrap(p2, desc1, sp1X, sw1Y-78, R, 8.5, bodyText, W - sp1X - 40, 14);

    // ── Swatch 2 ──
    const sw2Y = sw1Y - swH - 30;
    p2.drawRectangle({ x:sw1X, y:sw2Y-swH, width:swW, height:swH, color:col2 });
    drawText(p2, `CMYK : (${cmyk2.c}%, ${cmyk2.m}%, ${cmyk2.y}%, ${cmyk2.k}%)`, { x:sp1X, y:sw2Y-22, font:R, size:9, color:bodyText });
    drawText(p2, `RGB : (${Math.round(r2.r*255)}, ${Math.round(r2.g*255)}, ${Math.round(r2.b*255)})`, { x:sp1X, y:sw2Y-38, font:R, size:9, color:bodyText });
    drawText(p2, `WEB : ${c2s.toUpperCase()}`, { x:sp1X, y:sw2Y-54, font:R, size:9, color:bodyText });

    const desc2 = `The secondary color ${c2s} provides balance, sophistication, and grounding. Use it for body text, backgrounds, and supporting elements throughout the brand.`;
    wrap(p2, desc2, sp1X, sw2Y-78, R, 8.5, bodyText, W - sp1X - 40, 14);

    // Color narrative — right column (matches reference style)
    const narX = W*0.58;
    const narrative = `The color scheme featuring ${c1s} and ${c2s} has been carefully selected to reflect the brand's core values. The primary color commands attention and communicates ${pers ? pers.split(',')[0].trim().toLowerCase() : 'confidence'}, while the secondary anchors the palette with professionalism and trust. Together they create a cohesive visual identity that is both distinctive and appropriate for ${niche || 'the industry'}.`;
    wrap(p2, narrative, narX, H-120, R, 8.5, bodyText, W-narX-40, 15);

    footer(p2, 2, 'Introduction');

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 3 — LOGO MARK (matches reference: dark + light mockup cards)
    // ─────────────────────────────────────────────────────────────────────
    const p3 = doc.addPage([W, H]);
    p3.drawRectangle({ x:0, y:0, width:W, height:H, color:white });
    p3.drawRectangle({ x:0, y:0, width:5, height:H, color:col1 });

    drawText(p3, 'Introduction', { x:40, y:H-32, font:R, size:9, color:muted });
    drawText(p3, '03', { x:W-50, y:H-32, font:B, size:9, color:muted });
    drawText(p3, 'Mark', { x:40, y:H-60, font:B, size:28, color:ink });
    drawText(p3, 'Construction', { x:40, y:H-90, font:B, size:28, color:ink });
    p3.drawRectangle({ x:40, y:H-100, width:W-80, height:0.5, color:faint });

    // Two large mockup cards (matching reference exactly)
    const cardM = 40;
    const cardW = (W - cardM*2 - 24) / 2;
    const cardH = H - 140;
    const cardY = 42;

    // Dark card (left)
    p3.drawRectangle({ x:cardM, y:cardY, width:cardW, height:cardH, color:bgDark, borderRadius:8 });
    if (logoImg) {
      const ld = logoImg.scaleToFit(cardW-60, cardH-60);
      p3.drawImage(logoImg, {
        x: cardM + (cardW-ld.width)/2,
        y: cardY + (cardH-ld.height)/2,
        width: ld.width, height: ld.height
      });
    }

    // Light card (right)
    const c2X = cardM + cardW + 24;
    p3.drawRectangle({ x:c2X, y:cardY, width:cardW, height:cardH, color:bgLight, borderRadius:8 });
    // Subtle shadow effect border
    p3.drawRectangle({ x:c2X, y:cardY, width:cardW, height:cardH, color:faint, borderRadius:8, borderWidth:0.5, borderColor:faint });
    if (logoImg) {
      const ld = logoImg.scaleToFit(cardW-60, cardH-60);
      p3.drawImage(logoImg, {
        x: c2X + (cardW-ld.width)/2,
        y: cardY + (cardH-ld.height)/2,
        width: ld.width, height: ld.height
      });
    }

    footer(p3, 3, 'Introduction');

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 4 — SOCIAL MEDIA ASSETS
    // ─────────────────────────────────────────────────────────────────────
    const p4 = doc.addPage([W, H]);
    p4.drawRectangle({ x:0, y:0, width:W, height:H, color:white });
    p4.drawRectangle({ x:0, y:0, width:5, height:H, color:col1 });

    drawText(p4, 'Introduction', { x:40, y:H-32, font:R, size:9, color:muted });
    drawText(p4, '04', { x:W-50, y:H-32, font:B, size:9, color:muted });
    drawText(p4, 'Social', { x:40, y:H-60, font:B, size:28, color:ink });
    drawText(p4, 'Assets', { x:40, y:H-90, font:B, size:28, color:ink });
    p4.drawRectangle({ x:40, y:H-100, width:W-80, height:0.5, color:faint });

    const aW = W - 80;
    const aX = 40;
    let aY = H - 115;

    // Facebook
    drawText(p4, 'Facebook Cover  —  820 × 312 px', { x:aX, y:aY, font:B, size:9, color:muted });
    aY -= 8;
    const fbH = Math.round(aW * (312/820));
    aY -= fbH;
    if (fbImg) {
      const fd = fbImg.scaleToFit(aW, fbH);
      p4.drawImage(fbImg, { x:aX+(aW-fd.width)/2, y:aY+(fbH-fd.height)/2, width:fd.width, height:fd.height });
    }
    p4.drawRectangle({ x:aX, y:aY, width:aW, height:fbH, borderColor:faint, borderWidth:0.5, color:fbImg?rgb(0,0,0,0):bgLight });
    if (!fbImg) drawText(p4, 'Facebook Cover', { x:aX+aW/2-40, y:aY+fbH/2, font:R, size:10, color:muted });

    // Gap
    aY -= 24;

    // LinkedIn
    drawText(p4, 'LinkedIn Cover  —  1584 × 396 px', { x:aX, y:aY, font:B, size:9, color:muted });
    aY -= 8;
    const liH = Math.round(aW * (396/1584));
    aY -= liH;
    if (liImg) {
      const ld = liImg.scaleToFit(aW, liH);
      p4.drawImage(liImg, { x:aX+(aW-ld.width)/2, y:aY+(liH-ld.height)/2, width:ld.width, height:ld.height });
    }
    p4.drawRectangle({ x:aX, y:aY, width:aW, height:liH, borderColor:faint, borderWidth:0.5, color:liImg?rgb(0,0,0,0):bgLight });
    if (!liImg) drawText(p4, 'LinkedIn Cover', { x:aX+aW/2-40, y:aY+liH/2, font:R, size:10, color:muted });

    footer(p4, 4, 'Introduction');

    // ─────────────────────────────────────────────────────────────────────
    // PAGE 5 — TYPOGRAPHY (matches reference: specimen + scale)
    // ─────────────────────────────────────────────────────────────────────
    const p5 = doc.addPage([W, H]);
    p5.drawRectangle({ x:0, y:0, width:W, height:H, color:white });
    p5.drawRectangle({ x:0, y:0, width:5, height:H, color:col1 });

    drawText(p5, 'Introduction', { x:40, y:H-32, font:R, size:9, color:muted });
    drawText(p5, '05', { x:W-50, y:H-32, font:B, size:9, color:muted });
    drawText(p5, 'Corporate', { x:40, y:H-60, font:B, size:28, color:ink });
    drawText(p5, 'Typography', { x:40, y:H-90, font:B, size:28, color:ink });
    p5.drawRectangle({ x:40, y:H-100, width:W-80, height:0.5, color:faint });

    // Left column — type specimen
    const tyX = 40, tyW = W*0.50 - 20;
    let tyY = H - 120;

    drawText(p5, 'PRIMARY TYPEFACE', { x:tyX, y:tyY, font:B, size:8, color:muted });
    tyY -= 4;
    p5.drawRectangle({ x:tyX, y:tyY, width:tyW, height:0.5, color:faint });
    tyY -= 10;

    drawText(p5, 'Helvetica Semibold', { x:tyX, y:tyY, font:B, size:13, color:ink });
    tyY -= 18;

    // Big Aa specimen
    drawText(p5, 'aA', { x:tyX, y:tyY-40, font:B, size:72, color:ink });
    tyY -= 60;

    // Alphabet
    drawText(p5, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x:tyX, y:tyY-10, font:B, size:9, color:muted });
    drawText(p5, 'abcdefghijklmnopqrstuvwxyz', { x:tyX, y:tyY-24, font:R, size:9, color:muted });
    drawText(p5, '0123456789!@#$%^&*()', { x:tyX, y:tyY-38, font:R, size:9, color:muted });

    tyY -= 54;
    p5.drawRectangle({ x:tyX, y:tyY, width:tyW, height:0.5, color:faint });
    tyY -= 14;

    // Lorem ipsum paragraph (matches reference style)
    const loremText = 'Typography is the voice of a brand. The primary typeface should be used consistently across all brand materials — from digital to print — to build recognition and reinforce the brand\'s professional character.';
    wrap(p5, loremText, tyX, tyY, R, 8.5, bodyText, tyW, 13);

    // Right column — usage scale
    const scX = W*0.52;
    let scY = H - 120;
    drawText(p5, 'Headings', { x:scX, y:scY, font:B, size:9, color:muted });
    drawText(p5, 'Titles', { x:scX, y:scY-14, font:B, size:9, color:muted });
    drawText(p5, 'Subtitles', { x:scX, y:scY-28, font:B, size:9, color:muted });
    drawText(p5, 'Bold', { x:scX, y:scY-42, font:B, size:9, color:muted });
    drawText(p5, 'Number', { x:scX, y:scY-56, font:B, size:9, color:muted });
    p5.drawRectangle({ x:scX+70, y:scY-62, width:W-scX-70-40, height:0.5, color:faint });
    drawText(p5, 'Primary Font', { x:scX, y:scY-74, font:B, size:10, color:ink });

    // Secondary font row
    scY -= 90;
    p5.drawRectangle({ x:scX, y:scY, width:W-scX-40, height:0.5, color:faint });
    scY -= 14;
    drawText(p5, 'Helvetica Regular', { x:scX, y:scY, font:R, size:13, color:ink });
    scY -= 20;
    drawText(p5, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { x:scX, y:scY, font:R, size:8.5, color:muted });
    scY -= 14;
    drawText(p5, 'abcdefghijklmnopqrstuvwxyz', { x:scX, y:scY, font:R, size:8.5, color:muted });
    scY -= 14;
    drawText(p5, '0123456789!', { x:scX, y:scY, font:R, size:8.5, color:muted });

    // Brand voice tagline callout
    if (tagline) {
      scY -= 30;
      p5.drawRectangle({ x:scX, y:scY-52, width:W-scX-40, height:56, color:col1, borderRadius:4 });
      p5.drawRectangle({ x:scX, y:scY-52, width:4, height:56, color:white, opacity:0.3 });
      drawText(p5, 'BRAND TAGLINE', { x:scX+14, y:scY-16, font:B, size:7, color:rgb(1,1,1,0.6) });
      // Handle long taglines
      const tq = s(tagline, 55);
      const tqW = W - scX - 55;
      if (I.widthOfTextAtSize(tq, 13) <= tqW) {
        drawText(p5, tq, { x:scX+14, y:scY-34, font:I, size:13, color:white });
      } else {
        const wds = tq.split(' ');
        let l1='',l2='';
        wds.forEach(w=>{
          if(I.widthOfTextAtSize((l1?l1+' ':'')+w,11)<=tqW) l1=(l1?l1+' ':'')+w;
          else l2=(l2?l2+' ':'')+w;
        });
        drawText(p5, l1, { x:scX+14, y:scY-28, font:I, size:11, color:white });
        if (l2) drawText(p5, l2, { x:scX+14, y:scY-43, font:I, size:11, color:white });
      }
    }

    footer(p5, 5, 'Introduction');

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
