'use strict';

// Fixed camera-only gestures in the already isolated, hidden renderer workflow.
// No camera state, application handlers or model values are read or injected.
module.exports = function cameraInput({ getWindow, evaluate, check, digest, allowed, allowFrameDiagnostics = false }) {
  const diagnosticNames = new Set();
  const bounds = async () => {
    const window = getWindow();
    check(allowed && window && !window.isVisible() && window.webContents.debugger.isAttached(), 'Camera evidence belongs to the fixed hidden test window');
    const rect = await evaluate(`(() => {
      const list=[...document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"]),.assembly-viewport canvas')]
        .filter(e=>e.getClientRects().length&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().height>100);
      if(list.length!==1)throw Error('One current visible CAD canvas required');
      const e=list[0],r=e.getBoundingClientRect(),x=r.left+r.width*.62,y=r.top+r.height*.52;
      return {x:r.left,y:r.top,width:r.width,height:r.height,innerWidth,innerHeight,hit:document.elementFromPoint(x,y)===e};
    })()`);
    check(rect.width>250&&rect.height>200&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=rect.innerWidth+1&&rect.y+rect.height<=rect.innerHeight+1,
      'Camera canvas has bounded visible geometry');
    return {window,rect};
  };
  async function cameraFrame(options) {
    let diagnostic = null;
    if (options !== undefined) {
      check(allowFrameDiagnostics === true && options !== null && typeof options === 'object' && !Array.isArray(options)
        && Object.keys(options).length === 1 && Object.hasOwn(options, 'diagnostic')
        && ['before', 'before-confirm', 'restored'].includes(options.diagnostic), 'Only the opted-in reference-edit workflow may request a named frame diagnostic');
      diagnostic = options.diagnostic;
      check(diagnosticNames.size < 3 && !diagnosticNames.has(diagnostic), 'At most three unique named frame diagnostics');
      diagnosticNames.add(diagnostic);
    }
    const {window,rect}=await bounds();
    // Interior crop avoids the command toolbar, orientation triad and status UI.
    const crop={x:Math.ceil(rect.x+rect.width*.12),y:Math.ceil(rect.y+rect.height*.20),width:Math.floor(rect.width*.76),height:Math.floor(rect.height*.60)};
    const labels=await evaluate(`(() => {
      const rectangle=r=>({x:r.left,y:r.top,width:r.width,height:r.height});
      return [...document.querySelectorAll('.assembly-origin-labels > button[data-origin-key]')]
        .filter(button=>button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&button.getClientRects().length)
        .map(button=>{
          const range=document.createRange();range.selectNodeContents(button);
          const box=button.getBoundingClientRect(),style=getComputedStyle(button);
          const left=parseFloat(style.borderLeftWidth),right=parseFloat(style.borderRightWidth),top=parseFloat(style.borderTopWidth),bottom=parseFloat(style.borderBottomWidth);
          return {key:button.dataset.originKey,text:button.textContent,
            state:{disabled:button.disabled,className:button.className,ariaPressed:button.getAttribute('aria-pressed'),ariaSelected:button.getAttribute('aria-selected')},
            button:rectangle(box),interior:{x:box.left+left,y:box.top+top,width:box.width-left-right,height:box.height-top-bottom},textRect:rectangle(range.getBoundingClientRect())};
        });
    })()`);
    check(Array.isArray(labels)&&labels.length<=32,'Only a bounded set of visible origin-label texts may be excluded');
    const keys=new Set();
    for(const label of labels){
      check(typeof label.key==='string'&&label.key.length>0&&label.key.length<=4096&&!keys.has(label.key)
        &&typeof label.text==='string'&&label.text.length>0&&label.text.length<=4096,'Origin-label text has a unique bounded identity');
      keys.add(label.key);
      for(const box of [label.button,label.interior,label.textRect])check(box&&['x','y','width','height'].every(k=>Number.isFinite(box[k]))
        &&box.width>0&&box.height>0,'Origin-label rectangles are finite and nonempty');
      const b=label.button,i=label.interior,t=label.textRect;
      check(b.x>=0&&b.y>=0&&b.x+b.width<=rect.innerWidth+1&&b.y+b.height<=rect.innerHeight+1
        &&i.x>=b.x&&i.y>=b.y&&i.x+i.width<=b.x+b.width&&i.y+i.height<=b.y+b.height
        &&t.x>=i.x&&t.y>=i.y&&t.x+t.width<=i.x+i.width&&t.y+t.height<=i.y+i.height,
      'Only text contained in a visible origin-label button may be excluded');
    }
    const image=await window.webContents.capturePage(crop),size=image.getSize();
    check(!image.isEmpty()&&Number.isInteger(size.width)&&Number.isInteger(size.height)&&size.width>0&&size.height>0,'Actual renderer camera crop has pixels');
    const raw=image.toBitmap(),pixelCount=size.width*size.height;
    check(Buffer.isBuffer(raw)&&raw.length===pixelCount*4,'Actual renderer capture has four bytes per bitmap pixel');
    // capturePage includes composited HTML. Text antialiasing may change while
    // the camera and geometry are identical. Exclude only observed text ranges
    // from a copied comparison buffer; leave the DOM, original pixels, button
    // borders/backgrounds, SVG leaders and all remaining pixels untouched.
    const bitmap=Buffer.from(raw),covered=new Uint8Array(pixelCount),maskedRects=[];
    const sx=size.width/crop.width,sy=size.height/crop.height;
    for(const label of labels){
      const t=label.textRect,b=label.interior;
      // One bitmap pixel around the text, clipped to the button's interior and
      // capture. Never enlarge the exclusion to the whole button or viewport.
      const left=Math.max(0,Math.ceil((b.x-crop.x)*sx),Math.floor((t.x-crop.x)*sx)-1);
      const top=Math.max(0,Math.ceil((b.y-crop.y)*sy),Math.floor((t.y-crop.y)*sy)-1);
      const right=Math.min(size.width,Math.floor((b.x+b.width-crop.x)*sx),Math.ceil((t.x+t.width-crop.x)*sx)+1);
      const bottom=Math.min(size.height,Math.floor((b.y+b.height-crop.y)*sy),Math.ceil((t.y+t.height-crop.y)*sy)+1);
      if(right<=left||bottom<=top)continue;
      maskedRects.push({key:label.key,text:label.text,state:label.state,x:left,y:top,width:right-left,height:bottom-top});
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)covered[y*size.width+x]=1;
    }
    maskedRects.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
    let maskedPixelCount=0;for(const value of covered)maskedPixelCount+=value;
    check(maskedPixelCount<=pixelCount*.10,'Text exclusions must leave at least 90 percent of the capture exact');
    for(let i=0;i<covered.length;i++)if(covered[i])bitmap.fill(0,i*4,i*4+4);
    const result={width:size.width,height:size.height,sha256:digest(bitmap),rawSha256:digest(raw),maskedRects,unmaskedPixelCount:pixelCount-maskedPixelCount};
    if (diagnostic !== null) {
      // Encode the already captured, unmodified image. No extra screenshot,
      // page mutation, path, camera access or alternative comparison buffer.
      const png=image.toPNG();
      check(Buffer.isBuffer(png) && png.length > 0 && png.length <= 4*1024*1024, 'Bounded diagnostic PNG bytes');
      result.diagnosticImage={name:diagnostic,mimeType:'image/png',byteLength:png.length,sha256:digest(png),crop,base64:png.toString('base64')};
    }
    return result;
  }
  async function cameraGesture(kind) {
    check(['orbit','pan','wheel-in'].includes(kind),'Only fixed camera gesture kinds');
    const {window,rect}=await bounds();check(rect.hit,'Actual CAD canvas owns the camera gesture origin');
    const send=event=>window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',event);
    const start={x:rect.x+rect.width*.62,y:rect.y+rect.height*.52},end={x:start.x+60,y:start.y+24},modifiers=kind==='pan'?8:0;
    check(end.x<rect.x+rect.width-10&&end.y<rect.y+rect.height-10,'Fixed gesture stays within visible canvas');
    await send({type:'mouseMoved',...start,button:'none',buttons:0,pointerType:'mouse'});
    let gestureError;
    try {
      if(kind==='wheel-in')await send({type:'mouseWheel',...start,deltaX:0,deltaY:-160,button:'none',buttons:0,pointerType:'mouse'});
      else {
        await send({type:'mousePressed',...start,button:'middle',buttons:4,clickCount:1,pointerType:'mouse',modifiers});
        for(let step=1;step<=6;step++)await send({type:'mouseMoved',x:start.x+(end.x-start.x)*step/6,y:start.y+(end.y-start.y)*step/6,button:'middle',buttons:4,pointerType:'mouse',modifiers});
      }
    } catch(error) { gestureError=error; }
    // Attempt both cleanup events independently; a failed release must neither
    // skip parking nor replace the original gesture error.
    const cleanup=[...(kind!=='wheel-in'?[{type:'mouseReleased',...end,button:'middle',buttons:0,clickCount:1,pointerType:'mouse',modifiers}]:[]),
      {type:'mouseMoved',x:16,y:16,button:'none',buttons:0,pointerType:'mouse',modifiers:0}];
    for(const event of cleanup){
      try{await send(event);}catch(error){gestureError??=error;}
    }
    if(gestureError)throw gestureError;
    return {kind,start,end:kind==='wheel-in'?start:end,modifiers,transport:'CDP mouse events'};
  }
  return {cameraFrame,cameraGesture};
};
