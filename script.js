(function(){
  const urlInput = document.getElementById('urlInput');
  const fgColor = document.getElementById('fgColor');
  const bgColor = document.getElementById('bgColor');
  const logoInput = document.getElementById('logoInput');
  const clearLogoBtn = document.getElementById('clearLogo');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');
  const downloadImgBtn = document.getElementById('downloadImgBtn');
  const imgFormat = document.getElementById('imgFormat');
  const imgQuality = document.getElementById('imgQuality');
  const qualityValueEl = document.getElementById('qualityValue');
  const placeholderMsg = document.getElementById('placeholderMsg');
  const canvas = document.getElementById('qrcanvas');
  const ctx = canvas.getContext('2d');
  const serialEl = document.getElementById('serialNo');
  const tagDateEl = document.getElementById('tagDate');
  const patternRow = document.getElementById('patternRow');
  const eyeRow = document.getElementById('eyeRow');
  const presetRow = document.getElementById('presetRow');
  const qrFrame = document.querySelector('.qr-frame');

  let pattern = 'square';   // square | rounded | dots
  let eyeStyle = 'square';  // square | rounded
  let logoImage = null;     // uploaded image, when markMode === 'upload'
  let logoImageDataUrl = null; // same image as a data: URL, for SVG export
  let markMode = null;      // null | 'upload' | 'book' | 'heart' | 'star' | 'camera' | 'paw'
  let serial = Math.floor(Math.random()*900+100) + '-' + String(Math.floor(Math.random()*9000+1000));
  let hasGenerated = false;
  let lastQrData = null;    // cached geometry from the last successful render(), reused by exports

  // Renders real SVG path data onto the QR canvas — scales it to fit an s×s
  // box centered at (cx,cy), in the current ink color, regardless of the
  // original viewBox size or origin.
  function drawSvgPath(ctx, cx, cy, s, opts){
    const { d, vbX = 0, vbY = 0, vbW, vbH, preTranslate, mode = 'fill', fillRule = 'nonzero', lineWidth } = opts;
    const scale = s / Math.max(vbW, vbH);
    const path = new Path2D(d);
    ctx.save();
    ctx.translate(cx - (vbW*scale)/2 - vbX*scale, cy - (vbH*scale)/2 - vbY*scale);
    ctx.scale(scale, scale);
    if(preTranslate){ ctx.translate(preTranslate.tx, preTranslate.ty); }
    if(mode === 'stroke'){
      ctx.lineWidth = lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke(path);
    } else {
      ctx.fill(path, fillRule);
    }
    ctx.restore();
  }

  // Expandable icon library for the center mark. Each entry needs:
  //  id    — unique key, stored in markMode
  //  label — shown as a tooltip
  //  icon  — inline SVG markup for the picker button (uses currentColor)
  //  draw  — how it's stamped onto the actual QR canvas, in the current ink color
  // To add a new mark later: push one more entry here, nothing else changes.
  const MARK_LIBRARY = [
    {
      id: 'book', label: 'Book',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.5c-1.6-2-4.5-3-7.5-2.3v11c3-.7 5.9.3 7.5 2.3"/><path d="M12 8.5c1.6-2 4.5-3 7.5-2.3v11c-3-.7-5.9.3-7.5 2.3"/><path d="M12 8.5v11.3"/></svg>',
      draw(ctx, cx, cy, s){
        const lw = Math.max(1, s*0.09);
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const w = s*0.46, topY = cy - s*0.30, botY = cy + s*0.32;
        // left page
        ctx.beginPath();
        ctx.moveTo(cx, topY + s*0.10);
        ctx.bezierCurveTo(cx - w*0.35, topY - s*0.06, cx - w, topY - s*0.02, cx - w, topY + s*0.06);
        ctx.lineTo(cx - w, botY - s*0.10);
        ctx.bezierCurveTo(cx - w, botY - s*0.02, cx - w*0.35, botY - s*0.08, cx, botY + s*0.06);
        ctx.stroke();
        // right page (mirror)
        ctx.beginPath();
        ctx.moveTo(cx, topY + s*0.10);
        ctx.bezierCurveTo(cx + w*0.35, topY - s*0.06, cx + w, topY - s*0.02, cx + w, topY + s*0.06);
        ctx.lineTo(cx + w, botY - s*0.10);
        ctx.bezierCurveTo(cx + w, botY - s*0.02, cx + w*0.35, botY - s*0.08, cx, botY + s*0.06);
        ctx.stroke();
        // spine
        ctx.beginPath();
        ctx.moveTo(cx, topY + s*0.10);
        ctx.lineTo(cx, botY + s*0.02);
        ctx.stroke();
        ctx.restore();
      }
    },
    {
      id: 'heart', label: 'Heart',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.8-9.4C.8 7.6 2.4 4 6 4c2 0 3.4 1.1 4 2.4C10.6 5.1 12 4 14 4c3.6 0 5.2 3.6 3.8 7.1C19.5 15.9 12 20.5 12 20.5z"/></svg>',
      draw(ctx, cx, cy, s){
        const w = s*0.86;
        ctx.beginPath();
        ctx.moveTo(cx, cy+w*0.32);
        ctx.bezierCurveTo(cx-w*0.62, cy-w*0.28, cx-w*0.22, cy-w*0.62, cx, cy-w*0.14);
        ctx.bezierCurveTo(cx+w*0.22, cy-w*0.62, cx+w*0.62, cy-w*0.28, cx, cy+w*0.32);
        ctx.closePath();
        ctx.fill();
      }
    },
    {
      id: 'star', label: 'Star',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.8l2.7 6.1 6.6.6-5 4.5 1.5 6.5L12 17l-5.8 3.5 1.5-6.5-5-4.5 6.6-.6z"/></svg>',
      draw(ctx, cx, cy, s){
        const spikes = 5, outerR = s*0.5, innerR = s*0.21;
        ctx.beginPath();
        for(let i=0;i<spikes*2;i++){
          const r = i%2===0 ? outerR : innerR;
          const a = (Math.PI/spikes)*i - Math.PI/2;
          const px = cx + Math.cos(a)*r, py = cy + Math.sin(a)*r;
          if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
    {
      id: 'camera', label: 'Camera',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="14" rx="2"/><path d="M8 6.5l1.6-2.5h4.8L16 6.5"/><circle cx="12" cy="13.3" r="3.6"/></svg>',
      draw(ctx, cx, cy, s){
        const w = s*0.86, h = s*0.62;
        const lw = Math.max(1, s*0.05);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineJoin = 'round';
        roundedRectPath(cx-w/2, cy-h/2+h*0.08, w, h*0.84, s*0.08);
        ctx.stroke();
        const bw = w*0.32, bh = h*0.22;
        roundedRectPath(cx-bw/2, cy-h/2-bh*0.35, bw, bh, s*0.03);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy+h*0.06, h*0.26, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    },
    {
      id: 'ipod', label: 'iPod Classic',
      icon: '<svg viewBox="-26 0 128 128" fill="currentColor" fill-rule="evenodd"><g transform="translate(-770,-432)"><g transform="translate(120,224)"><path d="M688,305 C684.14,305 681,301.86 681,298 C681,294.14 684.14,291 688,291 C691.86,291 695,294.14 695,298 C695,301.86 691.86,305 688,305 L688,305 Z M688,290 C683.582,290 680,293.582 680,298 C680,302.418 683.582,306 688,306 C692.418,306 696,302.418 696,298 C696,293.582 692.418,290 688,290 L688,290 Z M688,320 C675.869,320 666,310.131 666,298 C666,285.869 675.869,276 688,276 C700.131,276 710,285.869 710,298 C710,310.131 700.131,320 688,320 L688,320 Z M688,274 C674.745,274 664,284.745 664,298 C664,311.255 674.745,322 688,322 C701.255,322 712,311.255 712,298 C712,284.745 701.255,274 688,274 L688,274 Z M719,258 C719,259.654 717.654,261 716,261 L660,261 C658.346,261 657,259.654 657,258 L657,218 C657,216.346 658.346,215 660,215 L716,215 C717.654,215 719,216.346 719,218 L719,258 Z M716,214 L660,214 C657.8,214 656,215.8 656,218 L656,258 C656,260.2 657.8,262 660,262 L716,262 C718.2,262 720,260.2 720,258 L720,218 C720,215.8 718.2,214 716,214 L716,214 Z M724,330 C724,332.206 722.206,334 720,334 L656,334 C653.794,334 652,332.206 652,330 L652,214 C652,211.794 653.794,210 656,210 L720,210 C722.206,210 724,211.794 724,214 L724,330 Z M720,208 L656,208 C652.7,208 650,210.7 650,214 L650,330 C650,333.3 652.7,336 656,336 L720,336 C723.3,336 726,333.3 726,330 L726,214 C726,210.7 723.3,208 720,208 L720,208 Z"/></g></g></svg>',
      draw(ctx, cx, cy, s){
        drawSvgPath(ctx, cx, cy, s, {
          d: "M688,305 C684.14,305 681,301.86 681,298 C681,294.14 684.14,291 688,291 C691.86,291 695,294.14 695,298 C695,301.86 691.86,305 688,305 L688,305 Z M688,290 C683.582,290 680,293.582 680,298 C680,302.418 683.582,306 688,306 C692.418,306 696,302.418 696,298 C696,293.582 692.418,290 688,290 L688,290 Z M688,320 C675.869,320 666,310.131 666,298 C666,285.869 675.869,276 688,276 C700.131,276 710,285.869 710,298 C710,310.131 700.131,320 688,320 L688,320 Z M688,274 C674.745,274 664,284.745 664,298 C664,311.255 674.745,322 688,322 C701.255,322 712,311.255 712,298 C712,284.745 701.255,274 688,274 L688,274 Z M719,258 C719,259.654 717.654,261 716,261 L660,261 C658.346,261 657,259.654 657,258 L657,218 C657,216.346 658.346,215 660,215 L716,215 C717.654,215 719,216.346 719,218 L719,258 Z M716,214 L660,214 C657.8,214 656,215.8 656,218 L656,258 C656,260.2 657.8,262 660,262 L716,262 C718.2,262 720,260.2 720,258 L720,218 C720,215.8 718.2,214 716,214 L716,214 Z M724,330 C724,332.206 722.206,334 720,334 L656,334 C653.794,334 652,332.206 652,330 L652,214 C652,211.794 653.794,210 656,210 L720,210 C722.206,210 724,211.794 724,214 L724,330 Z M720,208 L656,208 C652.7,208 650,210.7 650,214 L650,330 C650,333.3 652.7,336 656,336 L720,336 C723.3,336 726,333.3 726,330 L726,214 C726,210.7 723.3,208 720,208 L720,208 Z",
          vbX: -26, vbY: 0, vbW: 128, vbH: 128,
          preTranslate: { tx: -650, ty: -208 },
          mode: 'fill', fillRule: 'evenodd'
        });
      }
    },
    {
      id: 'event', label: 'Event',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.7" fill="currentColor" stroke="none"/></svg>',
      draw(ctx, cx, cy, s){
        const w = s*0.86, h = s*0.78;
        const lw = Math.max(1, s*0.05);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineCap = 'round';
        roundedRectPath(cx-w/2, cy-h/2+h*0.05, w, h*0.9, s*0.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx-w/2, cy-h/2+h*0.32);
        ctx.lineTo(cx+w/2, cy-h/2+h*0.32);
        ctx.stroke();
        const tabY0 = cy-h/2-h*0.06, tabY1 = cy-h/2+h*0.10;
        ctx.beginPath();
        ctx.moveTo(cx-w*0.28, tabY0); ctx.lineTo(cx-w*0.28, tabY1);
        ctx.moveTo(cx+w*0.28, tabY0); ctx.lineTo(cx+w*0.28, tabY1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy+h*0.14, s*0.06, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    },
    {
      id: 'paw', label: 'Paw',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><ellipse cx="12" cy="16" rx="5.2" ry="4.2"/><ellipse cx="5" cy="9.5" rx="2" ry="2.6"/><ellipse cx="10" cy="6" rx="2" ry="2.7"/><ellipse cx="14" cy="6" rx="2" ry="2.7"/><ellipse cx="19" cy="9.5" rx="2" ry="2.6"/></svg>',
      draw(ctx, cx, cy, s){
        const pad = (x,y,rx,ry)=>{ ctx.beginPath(); ctx.ellipse(cx+x, cy+y, rx, ry, 0, 0, Math.PI*2); ctx.fill(); };
        pad(0, s*0.14, s*0.30, s*0.24);
        pad(-s*0.32, -s*0.18, s*0.11, s*0.15);
        pad(-s*0.12, -s*0.32, s*0.11, s*0.15);
        pad(s*0.12, -s*0.32, s*0.11, s*0.15);
        pad(s*0.32, -s*0.18, s*0.11, s*0.15);
      }
    },
    {
      id: 'whatsapp', label: 'WhatsApp',
      icon: '<svg viewBox="0 0 48 48" fill="currentColor"><path d="M38.9,8.1A20.9,20.9,0,0,0,3.2,22.8,19.8,19.8,0,0,0,6,33.2L3,44l11.1-2.9a20.3,20.3,0,0,0,10,2.5A20.8,20.8,0,0,0,38.9,8.1Zm-14.8,32a17.1,17.1,0,0,1-9.5-2.8L8,39.1l1.8-6.4a17.9,17.9,0,0,1-3.1-9.9A17.4,17.4,0,1,1,24.1,40.1Z"/><path d="M33.6,27.2A29.2,29.2,0,0,0,30,25.5c-.4-.2-.8-.3-1.1.2s-1.4,1.7-1.7,2.1a.8.8,0,0,1-1.1.1,15.2,15.2,0,0,1-4.2-2.6A15,15,0,0,1,19,21.7a.7.7,0,0,1,.2-1l.8-1a3.5,3.5,0,0,0,.5-.8.9.9,0,0,0,0-.9c-.2-.3-1.2-2.8-1.6-3.9s-.9-.9-1.2-.9h-1a1.7,1.7,0,0,0-1.4.7,5.5,5.5,0,0,0-1.8,4.3,10.4,10.4,0,0,0,2.1,5.4c.3.3,3.7,5.6,8.9,7.8a16.4,16.4,0,0,0,3,1.1,6.4,6.4,0,0,0,3.3.2c1-.1,3.1-1.2,3.5-2.4s.5-2.3.3-2.5A2.1,2.1,0,0,0,33.6,27.2Z"/></svg>',
      draw(ctx, cx, cy, s){
        drawSvgPath(ctx, cx, cy, s, {
          d: "M38.9,8.1A20.9,20.9,0,0,0,3.2,22.8,19.8,19.8,0,0,0,6,33.2L3,44l11.1-2.9a20.3,20.3,0,0,0,10,2.5A20.8,20.8,0,0,0,38.9,8.1Zm-14.8,32a17.1,17.1,0,0,1-9.5-2.8L8,39.1l1.8-6.4a17.9,17.9,0,0,1-3.1-9.9A17.4,17.4,0,1,1,24.1,40.1Z M33.6,27.2A29.2,29.2,0,0,0,30,25.5c-.4-.2-.8-.3-1.1.2s-1.4,1.7-1.7,2.1a.8.8,0,0,1-1.1.1,15.2,15.2,0,0,1-4.2-2.6A15,15,0,0,1,19,21.7a.7.7,0,0,1,.2-1l.8-1a3.5,3.5,0,0,0,.5-.8.9.9,0,0,0,0-.9c-.2-.3-1.2-2.8-1.6-3.9s-.9-.9-1.2-.9h-1a1.7,1.7,0,0,0-1.4.7,5.5,5.5,0,0,0-1.8,4.3,10.4,10.4,0,0,0,2.1,5.4c.3.3,3.7,5.6,8.9,7.8a16.4,16.4,0,0,0,3,1.1,6.4,6.4,0,0,0,3.3.2c1-.1,3.1-1.2,3.5-2.4s.5-2.3.3-2.5A2.1,2.1,0,0,0,33.6,27.2Z",
          vbW: 48, vbH: 48, mode: 'fill'
        });
      }
    },
    {
      id: 'website', label: 'Website',
      icon: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M39.93,55.72A24.86,24.86,0,1,1,56.86,32.15a37.24,37.24,0,0,1-.73,6"/><path d="M37.86,51.1A47,47,0,0,1,32,56.7"/><path d="M32,7A34.14,34.14,0,0,1,43.57,30a34.07,34.07,0,0,1,.09,4.85"/><path d="M32,7A34.09,34.09,0,0,0,20.31,32.46c0,16.2,7.28,21,11.66,24.24"/><line x1="10.37" y1="19.9" x2="53.75" y2="19.9"/><line x1="32" y1="6.99" x2="32" y2="56.7"/><line x1="11.05" y1="45.48" x2="37.04" y2="45.48"/><line x1="7.14" y1="32.46" x2="56.86" y2="31.85"/><path d="M53.57,57,58,52.56l-8-8,4.55-2.91a.38.38,0,0,0-.12-.7L39.14,37.37a.39.39,0,0,0-.46.46L42,53.41a.39.39,0,0,0,.71.13L45.57,49Z"/></svg>',
      draw(ctx, cx, cy, s){
        drawSvgPath(ctx, cx, cy, s, {
          d: "M39.93,55.72A24.86,24.86,0,1,1,56.86,32.15a37.24,37.24,0,0,1-.73,6 M37.86,51.1A47,47,0,0,1,32,56.7 M32,7A34.14,34.14,0,0,1,43.57,30a34.07,34.07,0,0,1,.09,4.85 M32,7A34.09,34.09,0,0,0,20.31,32.46c0,16.2,7.28,21,11.66,24.24 M10.37,19.9L53.75,19.9 M32,6.99L32,56.7 M11.05,45.48L37.04,45.48 M7.14,32.46L56.86,31.85 M53.57,57,58,52.56l-8-8,4.55-2.91a.38.38,0,0,0-.12-.7L39.14,37.37a.39.39,0,0,0-.46.46L42,53.41a.39.39,0,0,0,.71.13L45.57,49Z",
          vbW: 64, vbH: 64, mode: 'stroke', lineWidth: 3
        });
      }
    },
    {
      id: 'cassette', label: 'Cassette Tape',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.6"/><circle cx="16" cy="12" r="2.6"/><path d="M10.3 12h3.4"/><path d="M6 16.5h12"/></svg>',
      draw(ctx, cx, cy, s){
        const w = s*0.86, h = s*0.6;
        const lw = Math.max(1, s*0.05);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        roundedRectPath(cx-w/2, cy-h/2, w, h, s*0.08);
        ctx.stroke();
        const rr = h*0.28, dx = w*0.22;
        [-1,1].forEach(sign=>{
          ctx.beginPath();
          ctx.arc(cx+sign*dx, cy+h*0.02, rr, 0, Math.PI*2);
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(cx-dx+rr*0.75, cy+h*0.02);
        ctx.lineTo(cx+dx-rr*0.75, cy+h*0.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx-w*0.30, cy+h*0.34);
        ctx.lineTo(cx+w*0.30, cy+h*0.34);
        ctx.stroke();
        ctx.restore();
      }
    },
    {
      id: 'vinyl', label: 'Vinyl Record',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
      draw(ctx, cx, cy, s){
        const inkColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(cx, cy, s*0.48, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = bgColor.value;
        ctx.beginPath();
        ctx.arc(cx, cy, s*0.19, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = inkColor;
        ctx.beginPath();
        ctx.arc(cx, cy, s*0.045, 0, Math.PI*2);
        ctx.fill();
      }
    },
    {
      id: 'books', label: 'Books (stack)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="14" width="18" height="4" rx="1"/><rect x="4" y="9.5" width="15" height="4" rx="1" transform="rotate(-2 11 11)"/><rect x="5" y="4.5" width="12" height="4.2" rx="1" transform="rotate(3 11 6)"/></svg>',
      draw(ctx, cx, cy, s){
        const lw = Math.max(1, s*0.045);
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        roundedRectPath(cx-s*0.42, cy+s*0.10, s*0.84, s*0.20, s*0.04);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy-s*0.06);
        ctx.rotate(-0.05);
        roundedRectPath(-s*0.36, -s*0.10, s*0.72, s*0.20, s*0.04);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(cx, cy-s*0.24);
        ctx.rotate(0.07);
        roundedRectPath(-s*0.30, -s*0.10, s*0.60, s*0.20, s*0.04);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
      }
    }
  ];

  const MARK_BY_ID = Object.fromEntries(MARK_LIBRARY.map(m => [m.id, m]));

  function buildPresetRow(){
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'preset-btn remove-btn active';
    removeBtn.dataset.preset = 'none';
    removeBtn.title = 'Remove quick mark';
    removeBtn.setAttribute('aria-label', 'Remove quick mark');
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M7 7l10 10"/></svg>';
    presetRow.appendChild(removeBtn);

    MARK_LIBRARY.forEach(mark => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.preset = mark.id;
      btn.title = mark.label;
      btn.setAttribute('aria-label', mark.label + ' mark');
      btn.innerHTML = mark.icon;
      presetRow.appendChild(btn);
    });
  }
  buildPresetRow();

  function setActive(row, attr, value){
    row.querySelectorAll('.style-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset[attr] === value);
    });
  }

  patternRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.style-btn');
    if(!btn) return;
    pattern = btn.dataset.pattern;
    setActive(patternRow, 'pattern', pattern);
    render();
  });

  eyeRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.style-btn');
    if(!btn) return;
    eyeStyle = btn.dataset.eye;
    setActive(eyeRow, 'eye', eyeStyle);
    render();
  });

  function loadUploadedFile(file){
    if(!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      const img = new Image();
      img.onload = function(){
        logoImage = img;
        logoImageDataUrl = ev.target.result;
        markMode = 'upload';
        clearLogoBtn.style.display = 'inline';
        setActivePreset(null);
        render();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setActivePreset(name){
    const active = name || 'none';
    presetRow.querySelectorAll('.preset-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.preset === active);
    });
  }

  logoInput.addEventListener('change', (e)=>{
    loadUploadedFile(e.target.files[0]);
  });

  clearLogoBtn.addEventListener('click', ()=>{
    logoImage = null;
    markMode = null;
    logoInput.value = '';
    clearLogoBtn.style.display = 'none';
    setActivePreset(null);
    render();
  });

  presetRow.addEventListener('click', (e)=>{
    const btn = e.target.closest('.preset-btn');
    if(!btn) return;
    const name = btn.dataset.preset;

    if(name === 'none'){
      markMode = null;
      logoImage = null;
      logoInput.value = '';
      clearLogoBtn.style.display = 'none';
      setActivePreset(null);
    } else if(markMode === name){
      // tap the active one again to remove it
      markMode = null;
      setActivePreset(null);
    } else {
      markMode = name;
      logoImage = null;
      logoInput.value = '';
      clearLogoBtn.style.display = 'none';
      setActivePreset(name);
    }
    render();
  });

  // Drag an image file straight onto the tag to set it as the center mark
  ['dragenter','dragover'].forEach(evt=>{
    qrFrame.addEventListener(evt, (e)=>{
      e.preventDefault();
      qrFrame.classList.add('drag-active');
    });
  });
  ['dragleave','dragend'].forEach(evt=>{
    qrFrame.addEventListener(evt, ()=> qrFrame.classList.remove('drag-active'));
  });
  qrFrame.addEventListener('drop', (e)=>{
    e.preventDefault();
    qrFrame.classList.remove('drag-active');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    loadUploadedFile(file);
  });

  [fgColor, bgColor].forEach(el => el.addEventListener('input', render));
  urlInput.addEventListener('input', debounce(render, 5000));

  function debounce(fn, ms){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=>fn.apply(this,args), ms);
    };
  }

  function roundedRectPath(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function inAnyEyeZone(r, c, count){
    const z = 7;
    const zones = [
      [0,0], [0,count-z], [count-z,0]
    ];
    return zones.some(([zr,zc]) => r>=zr && r<zr+z && c>=zc && c<zc+z);
  }

  function drawEye(cx, cy, cellPx, style, ink){
    // cx, cy = pixel coords of the top-left of the 7x7 finder block
    const outer = cellPx*7, ring = cellPx*5, inner = cellPx*3;
    const rOuter = style==='rounded' ? cellPx*2.1 : cellPx*0.5;
    const rInner = style==='rounded' ? cellPx*1.4 : cellPx*0.3;

    ctx.fillStyle = ink;
    roundedRectPath(cx, cy, outer, outer, rOuter);
    ctx.fill();

    ctx.fillStyle = bgColor.value;
    roundedRectPath(cx+cellPx, cy+cellPx, ring, ring, rOuter*0.65);
    ctx.fill();

    ctx.fillStyle = ink;
    roundedRectPath(cx+cellPx*2, cy+cellPx*2, inner, inner, rInner);
    ctx.fill();
  }

  function render(){
    const raw = urlInput.value.trim();
    if(!raw){
      canvas.style.display = 'none';
      placeholderMsg.style.display = 'block';
      downloadBtn.disabled = true;
      downloadSvgBtn.disabled = true;
      downloadImgBtn.disabled = true;
      tagDateEl.textContent = '';
      lastQrData = null;
      return;
    }

    let text = raw;
    // Gently assume https:// for bare domains like "example.com"
    if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) && /^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(text) && !text.includes(' ')){
      text = 'https://' + text;
    }

    canvas.style.display = 'block';
    placeholderMsg.style.display = 'none';
    downloadBtn.disabled = false;
    downloadSvgBtn.disabled = false;
    downloadImgBtn.disabled = false;

    const ecLevel = markMode ? 'H' : 'M';
    let qr;
    try{
      qr = qrcode(0, ecLevel);
      qr.addData(text);
      qr.make();
    }catch(err){
      // Fallback: text too long for this EC level, drop to a lighter level
      qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
    }

    const count = qr.getModuleCount();
    const size = canvas.width;
    const quiet = 4; // modules of quiet zone
    const cell = size / (count + quiet*2);
    const offset = cell * quiet;

    // No full-canvas paper fill here on purpose — the canvas stays
    // transparent outside the ink shapes, so PNG exports have no background.
    // The on-screen .qr-frame panel behind the canvas still supplies the
    // paper color visually; small structural fills (eye rings, mark backing)
    // still use bgColor.value further down.
    ctx.clearRect(0,0,size,size);

    const ink = fgColor.value;
    ctx.fillStyle = ink;

    for(let r=0; r<count; r++){
      for(let c=0; c<count; c++){
        if(!qr.isDark(r,c)) continue;
        if(inAnyEyeZone(r,c,count)) continue;

        const x = offset + c*cell;
        const y = offset + r*cell;

        if(pattern === 'dots'){
          ctx.beginPath();
          ctx.arc(x+cell/2, y+cell/2, cell*0.42, 0, Math.PI*2);
          ctx.fill();
        } else if(pattern === 'rounded'){
          roundedRectPath(x+cell*0.08, y+cell*0.08, cell*0.84, cell*0.84, cell*0.32);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell*0.98, cell*0.98);
        }
      }
    }

    // Finder patterns (eyes), drawn as clean shapes on top
    const eyePositions = [
      [0,0],
      [0, count-7],
      [count-7, 0]
    ];
    eyePositions.forEach(([r,c])=>{
      drawEye(offset + c*cell, offset + r*cell, cell, eyeStyle, ink);
    });

    // Optional center mark — one at a time: an uploaded image, or a preset icon
    if(markMode === 'upload' && logoImage){
      const logoSize = size * 0.20;
      const lx = (size - logoSize)/2;
      const ly = (size - logoSize)/2;
      const pad = logoSize * 0.14;
      ctx.fillStyle = bgColor.value;
      roundedRectPath(lx-pad, ly-pad, logoSize+pad*2, logoSize+pad*2, 10);
      ctx.fill();
      ctx.save();
      roundedRectPath(lx, ly, logoSize, logoSize, 8);
      ctx.clip();
      ctx.drawImage(logoImage, lx, ly, logoSize, logoSize);
      ctx.restore();
    } else if(markMode && MARK_BY_ID[markMode]){
      const markSize = size * 0.20;
      const pad = markSize * 0.30;
      ctx.fillStyle = bgColor.value;
      roundedRectPath(size/2 - markSize/2 - pad, size/2 - markSize/2 - pad, markSize+pad*2, markSize+pad*2, 10);
      ctx.fill();
      ctx.fillStyle = ink;
      MARK_BY_ID[markMode].draw(ctx, size/2, size/2, markSize);
    }

    if(!hasGenerated){
      hasGenerated = true;
    }
    tagDateEl.textContent = new Date().toLocaleDateString('en-US', {month:'short', day:'2-digit', year:'numeric'});

    // Cache this render's geometry so the SVG/image exports can reuse it
    // without recomputing the QR matrix.
    lastQrData = { qr, count, size, quiet, cell, offset, ink, bg: bgColor.value };
  }

  function bumpSerial(){
    // bump the serial each time a tag actually gets printed/exported
    const n = parseInt(serial.split('-')[1], 10) + 1;
    serial = serial.split('-')[0] + '-' + String(n).padStart(4,'0');
    serialEl.textContent = 'SERIAL NO. ' + serial;
  }

  function triggerDownload(href, filename){
    const link = document.createElement('a');
    link.download = filename;
    link.href = href;
    link.click();
  }

  // Builds a true vector SVG of the current tag — real <rect>/<circle> modules,
  // not a rasterized copy of the canvas — reusing the geometry cached by render().
  function buildSvgMarkup(){
    const d = lastQrData;
    if(!d) return null;
    const { qr, count, size, offset, cell, ink, bg } = d;

    let modules = '';
    for(let r=0; r<count; r++){
      for(let c=0; c<count; c++){
        if(!qr.isDark(r,c)) continue;
        if(inAnyEyeZone(r,c,count)) continue;
        const x = offset + c*cell, y = offset + r*cell;
        if(pattern === 'dots'){
          modules += `<circle cx="${(x+cell/2).toFixed(2)}" cy="${(y+cell/2).toFixed(2)}" r="${(cell*0.42).toFixed(2)}"/>`;
        } else if(pattern === 'rounded'){
          modules += `<rect x="${(x+cell*0.08).toFixed(2)}" y="${(y+cell*0.08).toFixed(2)}" width="${(cell*0.84).toFixed(2)}" height="${(cell*0.84).toFixed(2)}" rx="${(cell*0.32).toFixed(2)}"/>`;
        } else {
          modules += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cell*0.98).toFixed(2)}" height="${(cell*0.98).toFixed(2)}"/>`;
        }
      }
    }

    let eyes = '';
    [[0,0],[0,count-7],[count-7,0]].forEach(([r,c])=>{
      const ex = offset + c*cell, ey = offset + r*cell;
      const rOuter = eyeStyle==='rounded' ? cell*2.1 : cell*0.5;
      const rInner = eyeStyle==='rounded' ? cell*1.4 : cell*0.3;
      eyes += `<rect x="${ex.toFixed(2)}" y="${ey.toFixed(2)}" width="${(cell*7).toFixed(2)}" height="${(cell*7).toFixed(2)}" rx="${rOuter.toFixed(2)}" fill="${ink}"/>`;
      eyes += `<rect x="${(ex+cell).toFixed(2)}" y="${(ey+cell).toFixed(2)}" width="${(cell*5).toFixed(2)}" height="${(cell*5).toFixed(2)}" rx="${(rOuter*0.65).toFixed(2)}" fill="${bg}"/>`;
      eyes += `<rect x="${(ex+cell*2).toFixed(2)}" y="${(ey+cell*2).toFixed(2)}" width="${(cell*3).toFixed(2)}" height="${(cell*3).toFixed(2)}" rx="${rInner.toFixed(2)}" fill="${ink}"/>`;
    });

    let mark = '';
    if(markMode === 'upload' && logoImageDataUrl){
      const logoSize = size*0.20, lx = (size-logoSize)/2, ly = (size-logoSize)/2, pad = logoSize*0.14;
      mark += `<rect x="${(lx-pad).toFixed(2)}" y="${(ly-pad).toFixed(2)}" width="${(logoSize+pad*2).toFixed(2)}" height="${(logoSize+pad*2).toFixed(2)}" rx="10" fill="${bg}"/>`;
      mark += `<clipPath id="markClip"><rect x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${logoSize.toFixed(2)}" height="${logoSize.toFixed(2)}" rx="8"/></clipPath>`;
      mark += `<image href="${logoImageDataUrl}" xlink:href="${logoImageDataUrl}" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${logoSize.toFixed(2)}" height="${logoSize.toFixed(2)}" clip-path="url(#markClip)" preserveAspectRatio="xMidYMid slice"/>`;
    } else if(markMode && MARK_BY_ID[markMode]){
      // Rasterize just the small mark (not the whole QR) and embed it —
      // the scannable modules and eyes above stay true vector either way.
      const markSize = size*0.20, pad = markSize*0.30;
      const bx = size/2-markSize/2-pad, by = size/2-markSize/2-pad, bs = markSize+pad*2;
      mark += `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${bs.toFixed(2)}" height="${bs.toFixed(2)}" rx="10" fill="${bg}"/>`;
      const off = document.createElement('canvas');
      const dpr = 3;
      off.width = off.height = Math.ceil(markSize*dpr);
      const offCtx = off.getContext('2d');
      offCtx.scale(dpr, dpr);
      offCtx.fillStyle = ink;
      MARK_BY_ID[markMode].draw(offCtx, markSize/2, markSize/2, markSize);
      const markDataUrl = off.toDataURL('image/png');
      mark += `<image href="${markDataUrl}" xlink:href="${markDataUrl}" x="${(size/2-markSize/2).toFixed(2)}" y="${(size/2-markSize/2).toFixed(2)}" width="${markSize.toFixed(2)}" height="${markSize.toFixed(2)}"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">\n` +
      `<rect width="${size}" height="${size}" fill="${bg}"/>\n` +
      `<g fill="${ink}">${modules}</g>\n` +
      `${eyes}\n${mark}\n` +
      `</svg>`;
  }

  downloadBtn.addEventListener('click', ()=>{
    bumpSerial();
    triggerDownload(canvas.toDataURL('image/png'), 'qr-tag-' + serial + '.png');
  });

  downloadSvgBtn.addEventListener('click', ()=>{
    const svg = buildSvgMarkup();
    if(!svg) return;
    bumpSerial();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'qr-tag-' + serial + '.svg');
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
  });

  imgQuality.addEventListener('input', ()=>{
    qualityValueEl.textContent = imgQuality.value;
  });

  downloadImgBtn.addEventListener('click', ()=>{
    if(!lastQrData) return;
    bumpSerial();
    const format = imgFormat.value;
    const quality = parseInt(imgQuality.value, 10) / 100;
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    if(format === 'jpeg'){
      // JPEG has no transparency — composite onto a paper-colored backdrop
      // just for this export so it doesn't turn black. PNG stays transparent.
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const flatCtx = flat.getContext('2d');
      flatCtx.fillStyle = bgColor.value;
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(canvas, 0, 0);
      triggerDownload(flat.toDataURL('image/jpeg', quality), 'qr-tag-' + serial + '.' + ext);
    } else {
      triggerDownload(canvas.toDataURL('image/png'), 'qr-tag-' + serial + '.' + ext);
    }
  });

  serialEl.textContent = 'SERIAL NO. ' + serial;
  render();
})();
