(function(){
var $=id=>document.getElementById(id);
var clp=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
var money=n=>clp.format(Math.round(n));
var esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
var sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);
var pg=Logic.pagos;
var D={products:{},sales:[],held:[],users:[],clients:{},proveedores:{},compras:[],gastos:[],audit:[],ajustes:[],config:{nombre:'Mi tienda',rut:'',dir:'',pie:'¡Gracias por su compra!',iva:19,ptsPor:1000,valPto:50,printer:'',autoPrint:false,drawer:false},caja:{abierta:false,inicio:0,apertura:'',movs:[],cierres:[]}};
var DEMO={'7801000000011':{name:'Bebida 1,5 L',price:1500,cost:900,stock:24,min:6},'7801000000028':{name:'Pan de molde',price:2290,cost:1500,stock:12,min:4},'7801000000035':{name:'Galletas de vainilla',price:990,cost:550,stock:3,min:5}};
var cart=[],method='Efectivo',lastCode=null,editing=null;
var save=()=>window.api.save(D).then(r=>{if(r!==true)say('No se pudo guardar: '+r,'err')});
var beep=f=>{try{var C=window.AudioContext||window.webkitAudioContext,a=new C(),o=a.createOscillator(),g=a.createGain();o.frequency.value=f;g.gain.value=.08;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.09)}catch(e){}};
var say=(t,c)=>{$('msg').textContent=t;$('msg').className='msg '+(c||'')};
var anyOpen=()=>document.querySelector('dialog[open]');
var focusScan=()=>{if(!anyOpen()&&$('login').hidden&&$('venta').classList.contains('on'))$('scan').focus()};
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>setTimeout(focusScan,0)));
function askConfirm(msg){return new Promise(res=>{var d=$('dConf');$('cMsg').textContent=msg;$('cOk').onclick=()=>{d.close();res(true)};$('cNo').onclick=()=>{d.close();res(false)};d.oncancel=()=>res(false);d.showModal();$('cNo').focus()})}
var csv=rows=>rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
function dl(name,txt,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([(type?'':'\ufeff')+txt],{type:type||'text/csv'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}

/* ---------- Carrito ---------- */
var inCart=c=>{var it=cart.find(i=>i.code===c);return it?it.qty:0};
var lt=i=>Logic.lineTotal(i,D.products[i.code]);
var subtotal=()=>sum(cart,lt);
function addToCart(code){
  var p=D.products[code];if(!p)return false;
  if(p.stock!=null&&inCart(code)+1>p.stock){beep(200);say('No alcanza el stock de '+p.name+' (quedan '+Math.max(p.stock,0)+')','err');return true}
  var it=cart.find(i=>i.code===code);
  if(it)it.qty++;else cart.push({code:code,name:p.name,price:p.price,qty:1});
  lastCode=code;beep(880);say(p.name+' agregado','ok');renderCart();return true;
}
function renderCart(){
  $('tkNum').textContent='N.º '+String(D.sales.length+1).padStart(4,'0');
  $('cart').innerHTML=cart.map(i=>{var c=esc(i.code);
    return '<div class="line'+(i.code===lastCode?' flash':'')+'"><span class="q"><button data-a="dec" data-c="'+c+'" aria-label="Quitar uno">−</button><b>'+i.qty+'</b><button data-a="inc" data-c="'+c+'" aria-label="Agregar uno">+</button></span><span class="nm">'+esc(i.name)+'<small>'+money(i.price)+' c/u</small></span><span class="sub">'+money(lt(i))+'</span><button class="x" data-a="rm" data-c="'+c+'" aria-label="Quitar producto">×</button></div>'}).join('');
  $('count').textContent=sum(cart,i=>i.qty);$('total').textContent=money(subtotal());
  $('cartEmpty').hidden=cart.length>0;
  $('cobrar').disabled=$('vaciar').disabled=$('dejar').disabled=cart.length===0;
  $('espera').textContent='En espera ('+D.held.length+')';
}
$('cart').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;var c=b.dataset.c,it=cart.find(i=>i.code===c);if(!it)return;
  if(b.dataset.a==='inc'){addToCart(c);focusScan();return}
  lastCode=null;
  if(b.dataset.a==='dec'){it.qty--;if(it.qty<=0)cart=cart.filter(i=>i!==it)}
  if(b.dataset.a==='rm')cart=cart.filter(i=>i!==it);
  renderCart();focusScan();
});
$('vaciar').onclick=()=>{cart=[];lastCode=null;renderCart();say('');focusScan()};
function renderQuick(){
  $('quick').innerHTML=Object.keys(D.products).slice(0,24).map(c=>{var p=D.products[c],lo=p.stock!=null&&p.stock<=(p.min||0);
    return '<button class="tile" data-c="'+esc(c)+'"><span>'+esc(p.name)+'</span><b>'+money(p.price)+'</b>'+(p.stock!=null?'<span class="st'+(lo?' low':'')+'">'+(lo?'Stock bajo: ':'Stock: ')+p.stock+'</span>':'')+'</button>'}).join('');
}
$('quick').addEventListener('click',e=>{var b=e.target.closest('button');if(b){addToCart(b.dataset.c);focusScan()}});
function tick(){var d=new Date();$('clock').innerHTML='<b>'+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+'</b><span>'+d.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})+'</span>';$('tkDate').textContent=d.toLocaleDateString('es-CL')}
setInterval(tick,20000);tick();

/* Escaneo */
$('scanForm').addEventListener('submit',e=>{
  e.preventDefault();var code=$('scan').value.trim();$('scan').value='';if(!code)return;
  if(!addToCart(code)){beep(200);if(U&&U.rol==='dueno'){say('Código '+code+' no registrado. Completa los datos del producto.','err');openProd(code)}else say('Código '+code+' no registrado. Avise al dueño.','err')}
});

/* ---------- Venta en espera ---------- */
$('dejar').onclick=()=>{if(!cart.length)return;D.held.push({id:Date.now(),hora:new Date().toISOString(),items:cart});cart=[];lastCode=null;save();renderCart();say('Venta dejada en espera','ok');focusScan()};
function renderHeld(){
  $('heldBody').innerHTML=D.held.length?D.held.map((h,i)=>'<div class="hr"><span>'+new Date(h.hora).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+' · '+sum(h.items,x=>x.qty)+' art. · '+money(sum(h.items,lt))+'</span><span><button class="btn" data-a="rec" data-i="'+i+'">Recuperar</button> <button class="btn del" data-a="del" data-i="'+i+'">Eliminar</button></span></div>').join(''):'<div class="empty">No hay ventas en espera.</div>';
}
$('espera').onclick=()=>{renderHeld();$('dHeld').showModal()};
$('heldClose').onclick=()=>$('dHeld').close();
$('heldBody').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;var i=Number(b.dataset.i),h=D.held[i];if(!h)return;
  if(b.dataset.a==='rec'){h.items.forEach(x=>{var it=cart.find(c=>c.code===x.code);if(it)it.qty+=x.qty;else cart.push(x)});D.held.splice(i,1);save();renderCart();$('dHeld').close()}
  else{D.held.splice(i,1);save();renderCart();renderHeld()}
});

/* ---------- Productos ---------- */
function openProd(code,edit){
  editing=edit?code:null;var p=edit?D.products[code]:{};
  $('dProdTitle').textContent=edit?'Editar producto':'Producto nuevo';
  $('pCode').value=code||'';$('pName').value=p.name||'';$('pPrice').value=p.price==null?'':p.price;$('pCost').value=p.cost==null?'':p.cost;$('pStock').value=p.stock==null?'':p.stock;$('pMin').value=p.min==null?'':p.min;$('pVence').value=p.vence||'';$('pPN').value=p.pn||'';$('pPP').value=p.pp||'';$('pCat').value=p.cat||'';
  $('pCode').readOnly=!!edit;$('dProd').showModal();(code&&!edit?$('pName'):$('pCode')).focus();
}
$('nuevo').onclick=()=>openProd('');
$('pCancel').onclick=()=>$('dProd').close();
$('fProd').addEventListener('submit',()=>{
  var code=$('pCode').value.trim(),name=$('pName').value.trim(),price=Math.round(Number($('pPrice').value));
  if(!code||!name||isNaN(price))return;
  var n=v=>v===''?null:Math.round(Number(v));
  var isNew=!D.products[code],old=D.products[code]||{};
  D.products[code]={name:name,price:price,cost:n($('pCost').value)||0,stock:n($('pStock').value),min:n($('pMin').value)||0,vence:$('pVence').value,pn:n($('pPN').value)||0,pp:n($('pPP').value)||0,cat:$('pCat').value.trim(),hist:old.hist||[]};var np=D.products[code];
  if(!isNew&&old.price!==price){np.hist=np.hist.concat({f:new Date().toISOString(),precio:old.price}).slice(-20);log('Precio cambiado',name+': '+money(old.price)+' a '+money(price))}
  if(!isNew&&old.stock!=np.stock)log('Stock editado',name+': '+old.stock+' a '+np.stock);
  save();renderProducts();
  if(isNew&&!editing&&$('venta').classList.contains('on'))addToCart(code);
});
function cats(){var o={};Object.keys(D.products).forEach(k=>{if(D.products[k].cat)o[D.products[k].cat]=1});return Object.keys(o).sort()}
function renderProducts(){
  var cur=$('fCat').value;$('fCat').innerHTML='<option value="">Todas las categorías</option>'+cats().map(c=>'<option>'+esc(c)+'</option>').join('');$('fCat').value=cur;
  $('catList').innerHTML=cats().map(c=>'<option value="'+esc(c)+'">').join('');
  var ks=Object.keys(D.products).filter(k=>!$('fCat').value||D.products[k].cat===$('fCat').value);
  $('prodBody').innerHTML=ks.map(c=>{var p=D.products[c],lo=p.stock!=null&&p.stock<=(p.min||0);
    return '<tr><td>'+esc(c)+'</td><td>'+esc(p.name)+(p.cat?' <small class="muted">'+esc(p.cat)+'</small>':'')+'</td><td class="n">'+money(p.price)+'</td><td class="n">'+money(p.cost||0)+'</td><td class="n'+(lo?' low':'')+'">'+(p.stock==null?'—':p.stock+(lo?' (bajo)':''))+'</td><td class="'+(vdias(p)!==null&&vdias(p)<=7?'low':'')+'">'+(p.vence||'—')+'</td><td class="n"><button class="btn" data-a="etq" data-c="'+esc(c)+'">Etiqueta</button> <button class="btn" data-a="edit" data-c="'+esc(c)+'">Editar</button> <button class="btn del" data-a="del" data-c="'+esc(c)+'">Eliminar</button></td></tr>'}).join('');
  $('prodEmpty').hidden=ks.length>0;renderQuick();renderAlerts();
}
$('prodBody').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;var c=b.dataset.c;
  if(b.dataset.a==='edit')openProd(c,true);if(b.dataset.a==='etq')openEtq(c);
  if(b.dataset.a==='del')askConfirm('¿Eliminar "'+D.products[c].name+'" del catálogo?').then(ok=>{if(ok){log('Producto eliminado',D.products[c].name);delete D.products[c];save();renderProducts()}});
});
$('exportP').onclick=()=>dl('productos.csv',csv([['codigo','nombre','precio','costo','stock','minimo']].concat(Object.keys(D.products).map(c=>{var p=D.products[c];return [c,p.name,p.price,p.cost||0,p.stock==null?'':p.stock,p.min||0]}))));
$('importP').onclick=()=>$('file').click();
function splitRow(l,sep){var o=[],cur='',q=false;for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){o.push(cur);cur=''}else cur+=ch}o.push(cur);return o}
$('file').addEventListener('change',e=>{
  var f=e.target.files[0];if(!f)return;var r=new FileReader();
  r.onload=()=>{
    var lines=String(r.result).replace(/^\ufeff/,'').split(/\r?\n/).filter(l=>l.trim()),n=0;
    lines.forEach(l=>{var sep=l.indexOf(';')>=0?';':',',c=splitRow(l,sep).map(x=>x.trim());
      if(c.length<3||c[0]===''||isNaN(Number(c[2])))return;
      D.products[c[0]]={name:c[1],price:Math.round(Number(c[2])),cost:Math.round(Number(c[3]))||0,stock:c[4]===undefined||c[4]===''?null:Math.round(Number(c[4])),min:Math.round(Number(c[5]))||0};n++});
    save();renderProducts();$('impMsg').textContent=n+' productos importados';
  };
  r.readAsText(f);e.target.value='';
});

/* ---------- Cobro ---------- */
var cliente=null,usePts=false,U=null,curSale=null;
function totals(){var sb=subtotal(),d=Logic.discount(sb,$('desc').value,$('descTipo').value,U&&U.rol==='dueno'?100:10),pt=cliente&&usePts?Logic.pointsDiscount(D.clients[cliente].points,D.config.valPto,sb-d):0;return{s:sb,d:d,p:pt,t:sb-d-pt}}
function payVals(){return{Efectivo:Number($('pEf').value||0),Tarjeta:Number($('pTa').value||0),Transferencia:Number($('pTr').value||0),Fiado:Number($('pFi').value||0)}}
function updatePay(){
  var T=totals(),v=payVals(),r=Logic.split(T.t,v);
  $('payTotal').textContent=money(T.t);
  $('vuelto').textContent=!r.any?'Efectivo exacto':r.falta>0?'Faltan '+money(r.falta):(r.vuelto>0?'Vuelto: '+money(r.vuelto):'Pago completo');
  $('vuelto').style.color=r.falta>0?'var(--warn)':'';
  $('fiadoNote').textContent=v.Fiado>0&&!cliente?'Elige un cliente para dejar fiado':(r.otros>T.t?'Tarjeta, transferencia y fiado superan el total':'');
  $('payOk').disabled=!r.ok||(v.Fiado>0&&!cliente);
}
$('cobrar').onclick=()=>{
  ['pEf','pTa','pTr','pFi','desc'].forEach(id=>$(id).value='');$('descTipo').value='%';usePts=false;$('usePts').checked=false;
  $('desc').placeholder=U&&U.rol==='dueno'?'0':'máx. 10%';
  var c=cliente&&D.clients[cliente];$('ptsRow').hidden=!(c&&c.points>0&&Number(D.config.valPto)>0);
  if(c)$('ptsTxt').textContent='Usar '+c.points+' puntos (−'+money(Math.min(c.points*D.config.valPto,subtotal()))+')';
  updatePay();$('dPay').showModal();$('pEf').focus();
};
$('dPay').addEventListener('click',e=>{var b=e.target.closest('[data-f]');if(!b)return;var v=payVals(),k={pEf:'Efectivo',pTa:'Tarjeta',pTr:'Transferencia',pFi:'Fiado'}[b.dataset.f];
  $(b.dataset.f).value=Math.max(totals().t-(v.Efectivo+v.Tarjeta+v.Transferencia+v.Fiado-v[k]),0);updatePay()});
['pEf','pTa','pTr','pFi','desc'].forEach(id=>{$(id).addEventListener('input',updatePay);$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('payOk').click()}})});
$('descTipo').addEventListener('change',updatePay);
$('usePts').addEventListener('change',()=>{usePts=$('usePts').checked;updatePay()});
$('payCancel').onclick=()=>$('dPay').close();
$('payOk').onclick=()=>{
  if($('payOk').disabled)return;
  var T=totals(),r=Logic.split(T.t,payVals()),ks=Object.keys(r.pagos),sale={id:Date.now(),fecha:new Date().toISOString(),metodo:ks.length>1?'Mixto':(ks[0]||'Efectivo'),pagos:r.pagos,subtotal:T.s,desc:T.d+T.p,total:T.t,recibido:r.recibido,anulada:false,user:U.name,cliente:cliente,pts:0,ptsUsed:0,
    items:cart.map(i=>({code:i.code,name:i.name,price:i.price,cost:(D.products[i.code]||{}).cost||0,qty:i.qty,total:lt(i)}))};
  if(cliente){var c=D.clients[cliente];sale.ptsUsed=Logic.pointsUsed(T.p,D.config.valPto,c.points);sale.pts=Logic.earnPoints(T.t,D.config.ptsPor);Logic.applySaleToClient(c,sale)}
  cart.forEach(i=>{var p=D.products[i.code];if(p&&p.stock!=null)p.stock-=i.qty});
  D.sales.unshift(sale);if(sale.desc)log('Descuento',money(sale.desc)+' en venta de '+money(sale.total));save();$('dPay').close();
  cart=[];lastCode=null;cliente=null;usePts=false;renderCliBtn();say('');renderAll();beep(1175);showReceipt(sale,false);autoPrint(sale);
};
function revClient(s){var c=s.cliente&&D.clients[s.cliente];if(c)Logic.revertSaleOnClient(c,s)}
function receiptHTML(s){
  var c=D.config,d=new Date(s.fecha),iva=Number(c.iva)||0,neto=s.total/(1+iva/100);
  return '<div class="rc-h"><b>'+esc(c.nombre)+'</b>'+(c.rut?'<br>RUT '+esc(c.rut):'')+(c.dir?'<br>'+esc(c.dir):'')+'<br>'+d.toLocaleString('es-CL')+'<br>Ticket N.º '+s.id.toString().slice(-6)+'</div><hr>'+
  s.items.map(i=>'<div class="row"><span>'+i.qty+' × '+esc(i.name)+'</span><span>'+money(i.total!=null?i.total:i.price*i.qty)+'</span></div>').join('')+'<hr>'+
  (s.desc?'<div class="row"><span>Subtotal</span><span>'+money(s.subtotal||s.total)+'</span></div><div class="row"><span>Descuento</span><span>−'+money(s.desc)+'</span></div>':'')+
  '<div class="row tot"><span>Total</span><span>'+money(s.total)+'</span></div>'+
  '<div class="row"><span>Neto</span><span>'+money(neto)+'</span></div><div class="row"><span>IVA '+iva+'%</span><span>'+money(s.total-neto)+'</span></div>'+
  Object.keys(pg(s)).map(k=>'<div class="row"><span>'+k+'</span><span>'+money(pg(s)[k])+'</span></div>').join('')+((pg(s).Efectivo||0)>0&&s.recibido>pg(s).Efectivo?'<div class="row"><span>Vuelto</span><span>'+money(s.recibido-pg(s).Efectivo)+'</span></div>':'')+(s.user?'<div class="row"><span>Atendió</span><span>'+esc(s.user)+'</span></div>':'')+
  '<hr><div class="rc-h">'+esc(c.pie)+'<br><small>Comprobante interno, no es boleta</small></div>'+(s.anulada?'<div class="rc-h low">VENTA ANULADA</div>':'');
}
function showReceipt(s,re){curSale=s;$('recTitle').textContent=re?'Comprobante':'Venta registrada';$('recBody').innerHTML=receiptHTML(s);var c=s.cliente&&D.clients[s.cliente];$('recTel').value=c?c.phone||'':'';$('recMsg').textContent='';$('dRec').showModal()}
$('recOk').onclick=()=>$('dRec').close();


/* ---------- Caja ---------- */
function cajaCalc(){return Logic.cajaEsperado(D.caja,D.sales)}
function renderCaja(){
  var c=D.caja,h='';
  $('cajaTag').textContent=c.abierta?'Caja abierta':'Caja cerrada';$('cajaTag').className='tag'+(c.abierta?' on':'');
  if(!c.abierta){
    h='<div class="toolbar"><h2>Caja cerrada</h2></div><div class="f w"><label for="cInicio">Dinero con que abre la caja (CLP)</label><input id="cInicio" type="number" min="0" step="1" value="0"></div><button class="btn pri" data-a="abrir">Abrir caja</button>';
  }else{
    var k=cajaCalc();
    h='<div class="toolbar"><h2>Caja abierta</h2><span class="sp">Desde '+new Date(c.apertura).toLocaleString('es-CL')+'</span></div><div class="stats">'+
    '<div class="stat"><span>Dinero inicial</span><b>'+money(c.inicio)+'</b></div><div class="stat"><span>Ventas en efectivo</span><b>'+money(k.ef)+'</b></div><div class="stat"><span>Ingresos</span><b>'+money(k.ing)+'</b></div><div class="stat"><span>Retiros</span><b>'+money(k.ret)+'</b></div><div class="stat"><span>Debería haber</span><b>'+money(k.esp)+'</b></div></div>'+
    '<div class="btns" style="max-width:420px"><button class="btn" data-a="mov">Ingreso o retiro</button><button class="btn pri" data-a="cerrar">Cerrar caja</button></div>'+
    (c.movs.length?'<h3 style="margin-top:18px">Movimientos</h3>'+c.movs.map(m=>'<div class="hr"><span>'+new Date(m.t).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+' '+(m.tipo==='ingreso'?'Ingreso':'Retiro')+(m.nota?': '+esc(m.nota):'')+'</span><b>'+money(m.monto)+'</b></div>').join(''):'');
  }
  if(c.cierres.length)h+='<h3 style="margin-top:22px">Últimos cierres</h3>'+c.cierres.slice(0,10).map(x=>'<div class="hr"><span>'+new Date(x.cierre).toLocaleString('es-CL')+'</span><span>Esperado '+money(x.esperado)+', contado '+money(x.contado)+', diferencia <b class="'+(x.dif?'low':'')+'">'+money(x.dif)+'</b></span></div>').join('');
  $('cajaBody').innerHTML=h;
}
$('cajaBody').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;var a=b.dataset.a;
  if(a==='abrir'){D.caja={abierta:true,inicio:Math.round(Number($('cInicio').value)||0),apertura:new Date().toISOString(),movs:[],cierres:D.caja.cierres};save();renderCaja()}
  if(a==='mov'){$('mMonto').value='';$('mNota').value='';$('dMov').showModal();$('mMonto').focus()}
  if(a==='cerrar'){$('cEsp').textContent=money(cajaCalc().esp);$('cContado').value='';$('cDif').textContent='';$('dCierre').showModal();$('cContado').focus()}
});
$('mNo').onclick=()=>$('dMov').close();
$('mOk').onclick=()=>{var m=Math.round(Number($('mMonto').value));if(!m||m<1)return;D.caja.movs.push({t:new Date().toISOString(),tipo:$('mTipo').value,monto:m,nota:$('mNota').value.trim()});log('Caja: '+$('mTipo').value,money(m)+' '+$('mNota').value.trim());save();$('dMov').close();renderCaja()};
$('cContado').addEventListener('input',()=>{var v=$('cContado').value;if(v==='')return($('cDif').textContent='');var d=Number(v)-cajaCalc().esp;$('cDif').textContent=d===0?'Cuadra perfecto':(d>0?'Sobran ':'Faltan ')+money(Math.abs(d));$('cDif').style.color=d?'var(--warn)':'var(--okt)'});
$('cNo2').onclick=()=>$('dCierre').close();
$('cOk2').onclick=()=>{var v=$('cContado').value;if(v==='')return;var k=cajaCalc(),ct=Math.round(Number(v));
  D.caja.cierres.unshift({apertura:D.caja.apertura,cierre:new Date().toISOString(),inicio:D.caja.inicio,esperado:k.esp,contado:ct,dif:ct-k.esp,user:U.name});if(ct!==k.esp)log('Cierre de caja con diferencia',money(ct-k.esp)+' ('+U.name+')');
  D.caja={abierta:false,inicio:0,apertura:'',movs:[],cierres:D.caja.cierres};save();$('dCierre').close();renderCaja();renderReportes()};

/* ---------- Ventas y reportes ---------- */
function renderHist(){
  var ok=D.sales.filter(s=>!s.anulada),hoy=new Date().toDateString(),td=ok.filter(s=>new Date(s.fecha).toDateString()===hoy);
  var tot=sum(td,s=>s.total),costo=sum(td,s=>sum(s.items,i=>(i.cost||0)*i.qty)),pm={},tp={};
  var pu={};td.forEach(s=>{Object.keys(pg(s)).forEach(k=>{pm[k]=(pm[k]||0)+pg(s)[k]});pu[s.user||'—']=(pu[s.user||'—']||0)+s.total;s.items.forEach(i=>{tp[i.name]=(tp[i.name]||0)+i.qty})});
  var top=Object.keys(tp).sort((a,b)=>tp[b]-tp[a]).slice(0,5);
  $('rep').innerHTML='<div class="stats"><div class="stat"><span>Ventas</span><b>'+td.length+'</b></div><div class="stat"><span>Total vendido</span><b>'+money(tot)+'</b></div><div class="stat"><span>Ganancia estimada</span><b>'+money(tot-costo)+'</b></div></div>'+
   '<div class="cols"><div><h3>Por forma de pago</h3>'+(Object.keys(pm).map(k=>'<div class="sm hr" style="border:0"><span>'+k+'</span><b>'+money(pm[k])+'</b></div>').join('')||'<div class="sm">Sin ventas hoy</div>')+'</div>'+
   '<div><h3>Más vendidos hoy</h3>'+(top.map(k=>'<div class="sm hr" style="border:0"><span>'+esc(k)+'</span><b>'+tp[k]+'</b></div>').join('')||'<div class="sm">Sin ventas hoy</div>')+'</div><div><h3>Por cajero</h3>'+(Object.keys(pu).map(k=>'<div class="sm hr" style="border:0"><span>'+esc(k)+'</span><b>'+money(pu[k])+'</b></div>').join('')||'<div class="sm">Sin ventas hoy</div>')+'</div></div>';
  $('histBody').innerHTML=D.sales.slice(0,200).map(s=>{var d=new Date(s.fecha);
    return '<tr><td>'+d.toLocaleDateString('es-CL')+' '+d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})+'</td><td class="'+(s.anulada?'anul':'')+'">'+s.items.map(i=>i.qty+' × '+esc(i.name)).join(', ')+'</td><td>'+s.metodo+'</td><td class="n '+(s.anulada?'anul':'')+'">'+money(s.total)+'</td><td class="n"><button class="btn" data-a="ver" data-i="'+s.id+'">Ver</button>'+(s.anulada?' <span class="low">Anulada</span>':' <button class="btn del" data-a="anu" data-i="'+s.id+'">Anular</button>')+'</td></tr>'}).join('');
  $('histEmpty').hidden=D.sales.length>0;
}
$('histBody').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;var s=D.sales.find(x=>String(x.id)===b.dataset.i);if(!s)return;
  if(b.dataset.a==='ver')showReceipt(s,true);
  if(b.dataset.a==='anu')askConfirm('¿Anular esta venta de '+money(s.total)+'? El stock se devuelve.').then(ok=>{if(!ok)return;s.anulada=true;revClient(s);log('Venta anulada',money(s.total)+' (atendió '+(s.user||'—')+')');s.items.forEach(i=>{var p=D.products[i.code];if(p&&p.stock!=null)p.stock+=i.qty});save();renderAll()});
});
$('exportV').onclick=()=>dl('ventas.csv',csv([['fecha','pago','total','estado','detalle']].concat(D.sales.map(s=>[s.fecha,s.metodo,s.total,s.anulada?'anulada':'ok',s.items.map(i=>i.qty+'x '+i.name).join(' | ')]))));

/* ---------- Tienda ---------- */
function fillConfig(){var c=D.config;$('cfNombre').value=c.nombre;$('cfRut').value=c.rut;$('cfDir').value=c.dir;$('cfPie').value=c.pie;$('cfIva').value=c.iva;$('cfPtsPor').value=c.ptsPor;$('cfValPto').value=c.valPto;$('cfPrinter').value=c.printer||'';$('cfAuto').checked=!!c.autoPrint;$('cfDrawer').checked=!!c.drawer}
$('cfSave').onclick=()=>{D.config={nombre:$('cfNombre').value.trim()||'Mi tienda',rut:$('cfRut').value.trim(),dir:$('cfDir').value.trim(),pie:$('cfPie').value.trim(),iva:Number($('cfIva').value)||0,ptsPor:Number($('cfPtsPor').value)||0,valPto:Number($('cfValPto').value)||0,printer:$('cfPrinter').value.trim(),autoPrint:$('cfAuto').checked,drawer:$('cfDrawer').checked};save();$('cfMsg').textContent='Guardado'};

/* ---------- Clientes ---------- */
var cliEdit=false,cliPick=false,abonoK=null;
function renderCliBtn(){var c=cliente&&D.clients[cliente];$('cliBtn').textContent=c?'Cliente: '+c.name:'Cliente: ninguno'}
function pickList(){var q=$('kQ').value.trim().toLowerCase(),ks=Object.keys(D.clients).filter(k=>!q||k.toLowerCase().includes(q)||D.clients[k].name.toLowerCase().includes(q)).slice(0,8);
  $('kList').innerHTML=ks.map(k=>'<div class="hr"><span>'+esc(D.clients[k].name)+' <small class="muted">'+esc(k)+'</small></span><button class="btn" data-k="'+esc(k)+'">Elegir</button></div>').join('')||'<div class="empty">Sin resultados</div>'}
$('cliBtn').onclick=()=>{$('kQ').value='';pickList();$('dPick').showModal();$('kQ').focus()};
$('kQ').addEventListener('input',pickList);
$('kList').addEventListener('click',e=>{var b=e.target.closest('button');if(b){cliente=b.dataset.k;renderCliBtn();$('dPick').close()}});
$('kNone').onclick=()=>{cliente=null;renderCliBtn();$('dPick').close()};
$('kClose').onclick=()=>$('dPick').close();
$('kNew').onclick=()=>{$('dPick').close();openCli('',false,true)};
$('cliNew').onclick=()=>openCli('',false,false);
function openCli(rut,edit,pick){cliEdit=edit;cliPick=pick;var c=edit?D.clients[rut]:{};$('cRut').value=rut||'';$('cName').value=c.name||'';$('cTel').value=c.phone||'';$('cRut').readOnly=edit;$('dCli').showModal();$('cRut').focus()}
$('cNo3').onclick=()=>$('dCli').close();
$('cOk3').onclick=()=>{var r=$('cRut').value.trim(),n=$('cName').value.trim();if(!r||!n)return;var o=D.clients[r]||{};D.clients[r]={name:n,phone:$('cTel').value.trim(),points:o.points||0,debt:o.debt||0};if(cliPick){cliente=r;renderCliBtn()}save();$('dCli').close();renderClients()};
function renderClients(){var ks=Object.keys(D.clients);
  $('cliBody').innerHTML=ks.map(k=>{var c=D.clients[k];return '<tr><td>'+esc(k)+'</td><td>'+esc(c.name)+'</td><td>'+esc(c.phone||'')+'</td><td class="n">'+(c.points||0)+'</td><td class="n'+(c.debt>0?' low':'')+'">'+money(c.debt||0)+'</td><td class="n"><button class="btn" data-a="e" data-k="'+esc(k)+'">Editar</button>'+(c.debt>0?' <button class="btn pri" data-a="ab" data-k="'+esc(k)+'">Abonar</button>':'')+'</td></tr>'}).join('');
  $('cliEmpty').hidden=ks.length>0}
$('cliBody').addEventListener('click',e=>{var b=e.target.closest('button');if(!b)return;var k=b.dataset.k;
  if(b.dataset.a==='e')openCli(k,true,false);
  if(b.dataset.a==='ab'){abonoK=k;abonoMode='cli';$('aTit').textContent='Abono de '+D.clients[k].name+' (debe '+money(D.clients[k].debt)+')';$('aMonto').value='';$('dAbono').showModal();$('aMonto').focus()}});
$('aNo').onclick=()=>$('dAbono').close();
$('aOk').onclick=()=>{if(abonoMode==='com')return pagarCompra();var c=D.clients[abonoK],m=Math.round(Number($('aMonto').value));if(!c||!m||m<1)return;m=Math.min(m,c.debt);c.debt-=m;
  if(D.caja.abierta)D.caja.movs.push({t:new Date().toISOString(),tipo:'ingreso',monto:m,nota:'Abono fiado: '+c.name});
  save();$('dAbono').close();renderClients();renderCaja()};

/* ---------- Vencimientos y alertas ---------- */
function vdias(p){return p.vence?Math.ceil((new Date(p.vence+'T23:59:59')-new Date())/864e5):null}
function renderAlerts(){var lo=0,vz=0;Object.keys(D.products).forEach(k=>{var p=D.products[k],d=vdias(p);if(p.stock!=null&&p.stock<=(p.min||0))lo++;if(d!==null&&d<=7)vz++});
  var t=[];if(lo)t.push(lo+' con stock bajo');if(vz)t.push(vz+' vencidos o por vencer');$('alerts').hidden=!t.length;$('alerts').textContent='Atención: '+t.join(' y ')+'.'+(U&&U.rol==='dueno'?' Toca para revisar.':'')}
$('alerts').onclick=()=>{if(U&&U.rol==='dueno')document.querySelector('nav [data-tab=productos]').click()};

/* ---------- Etiquetas Code 128 ---------- */
var C128='212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
function code128(t){var cs=[104],sm=104;t=String(t);for(var i=0;i<t.length;i++){var v=t.charCodeAt(i)-32;if(v<0||v>94)return'';cs.push(v);sm+=v*(i+1)}cs.push(sm%103,106);
  var x=10,r='';cs.forEach(c=>{var p=C128[c];for(var j=0;j<p.length;j++){var w=+p[j];if(j%2===0)r+='<rect x="'+x+'" y="0" width="'+w+'" height="40"/>';x+=w}});
  return '<svg viewBox="0 0 '+(x+10)+' 40" preserveAspectRatio="none" aria-hidden="true">'+r+'</svg>'}
var etqCode=null;
function openEtq(c){etqCode=c;$('eN').value=6;drawEtq();$('dEtiq').showModal()}
function drawEtq(){var p=D.products[etqCode],n=Math.max(1,Math.min(60,Number($('eN').value)||1));
  $('etqBody').innerHTML=('<div class="etq"><b>'+esc(p.name)+'</b>'+code128(etqCode)+'<small>'+esc(etqCode)+'</small><b>'+money(p.price)+'</b></div>').repeat(n)}
$('eN').addEventListener('input',drawEtq);$('eClose').onclick=()=>$('dEtiq').close();$('ePrint').onclick=()=>window.print();

/* ---------- Impresora ESC/POS, cajón y WhatsApp ---------- */
var ascii=t=>String(t).replace(/\u00a0/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
function ticketLines(s,W){
  var c=D.config,iva=Number(c.iva)||0,neto=s.total/(1+iva/100),g=pg(s),L=[],
  ctr=t=>{t=ascii(t);return ' '.repeat(Math.max(0,Math.floor((W-t.length)/2)))+t},
  lr=(a,b)=>{a=ascii(a);b=ascii(b);return a.slice(0,Math.max(0,W-b.length-1)).padEnd(W-b.length)+b},ln='-'.repeat(W);
  L.push(ctr(c.nombre));if(c.rut)L.push(ctr('RUT '+c.rut));if(c.dir)L.push(ctr(c.dir));L.push(ctr(new Date(s.fecha).toLocaleString('es-CL')),ln);
  s.items.forEach(i=>L.push(lr(i.qty+' x '+i.name,money(i.total!=null?i.total:i.price*i.qty))));L.push(ln);
  if(s.desc)L.push(lr('Descuento','-'+money(s.desc)));
  L.push(lr('TOTAL',money(s.total)),lr('Neto',money(neto)),lr('IVA '+iva+'%',money(s.total-neto)));
  Object.keys(g).forEach(k=>L.push(lr(k,money(g[k]))));
  if((g.Efectivo||0)>0&&s.recibido>g.Efectivo)L.push(lr('Vuelto',money(s.recibido-g.Efectivo)));
  L.push(ln,ctr(c.pie),ctr('Comprobante interno, no es boleta'));return L}
function escBytes(lines,drawer,cut){var o=[0x1b,0x40];lines.forEach(l=>{for(var i=0;i<l.length;i++)o.push(l.charCodeAt(i)&127);o.push(10)});if(cut)o.push(10,10,10,0x1d,0x56,0x42,0x03);if(drawer)o.push(0x1b,0x70,0,0x3c,0x78);return o}
function sendRaw(bytes){if(!D.config.printer)return Promise.resolve('falta configurar la impresora en la pestaña Tienda');return window.api.printRaw(D.config.printer,btoa(String.fromCharCode.apply(null,bytes)))}
function autoPrint(s){var c=D.config,cash=(pg(s).Efectivo||0)>0;
  if(c.autoPrint&&c.printer)sendRaw(escBytes(ticketLines(s,42),c.drawer&&cash,true)).then(r=>{if(r!=='ok')say('Impresora: '+r,'err')});
  else if(c.drawer&&c.printer&&cash)sendRaw(escBytes([],true,false))}
$('recPrint').onclick=()=>{if(D.config.printer&&curSale)sendRaw(escBytes(ticketLines(curSale,42),false,true)).then(r=>{$('recMsg').textContent=r==='ok'?'Enviado a la impresora':'Impresora: '+r});else window.print()};
$('recWa').onclick=()=>{var t=($('recTel').value||'').replace(/\D/g,'');if(t.length<8){$('recMsg').textContent='Escribe el celular del cliente';return}if(t.length===9)t='56'+t;
  window.api.openExternal('https://wa.me/'+t+'?text='+encodeURIComponent(ticketLines(curSale,32).join('\n')))};
$('cfTest').onclick=()=>sendRaw(escBytes(['PRUEBA DE IMPRESION','Todo OK'],false,true)).then(r=>{$('cfMsg').textContent=r==='ok'?'Prueba enviada':'Impresora: '+r});
$('cfOpen').onclick=()=>sendRaw(escBytes([],true,false)).then(r=>{$('cfMsg').textContent=r==='ok'?'Orden enviada al cajón':'Impresora: '+r});

/* ---------- Usuarios, sesión y respaldo ---------- */
var PERM={dueno:['inicio','venta','productos','clientes','caja','historial','compras','inventario','reportes','config'],cajero:['venta','clientes','caja']};
function showLogin(){$('lUser').innerHTML=D.users.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join('');$('lPin').value='';$('lErr').textContent='';
  $('lHint').textContent=D.users.some(u=>u.weak)?'PIN inicial del dueño: 1234. Cámbialo en la pestaña Tienda.':'';U=null;$('login').hidden=false;$('lPin').focus()}
function applyRole(){document.querySelectorAll('nav [data-tab]').forEach(b=>b.hidden=PERM[U.rol].indexOf(b.dataset.tab)<0);
  $('whoami').textContent=U.name+(U.rol==='dueno'?' (dueño)':' (cajero)');document.querySelectorAll('nav .grp').forEach(g=>{var n=g.nextElementSibling,v=false;while(n&&!n.classList.contains('grp')){if(!n.hidden)v=true;n=n.nextElementSibling}g.hidden=!v});document.querySelector('nav [data-tab='+(U.rol==='dueno'?'inicio':'venta')+']').click();renderAlerts()}
$('lForm').addEventListener('submit',e=>{e.preventDefault();
  window.api.login(Number($('lUser').value),$('lPin').value.trim()).then(r=>{
    if(r.error){$('lErr').textContent=r.error;$('lPin').value='';$('lPin').focus();return}
    window.api.load().then(d=>{U=r.user;loadData(d);$('login').hidden=true;applyRole();focusScan()})})});
$('logout').onclick=()=>{window.api.logout();showLogin()};
var uEdit=null;
function renderUsers(){$('uList').innerHTML=D.users.map(u=>'<div class="hr"><span>'+esc(u.name)+' ('+(u.rol==='dueno'?'dueño':'cajero')+')'+(u.weak?' <span class="low">PIN 1234, cámbialo</span>':'')+'</span><span><button class="btn" data-a="e" data-i="'+u.id+'">Editar</button> <button class="btn del" data-a="d" data-i="'+u.id+'">Eliminar</button></span></div>').join('')}
function refreshUsers(msg){window.api.users().then(us=>{D.users=us;renderUsers();$('uMsg').textContent=msg||''})}
$('uList').addEventListener('click',e=>{var b=e.target.closest('button');if(!b)return;var u=D.users.find(x=>String(x.id)===b.dataset.i);if(!u)return;
  if(b.dataset.a==='e'){uEdit=u.id;$('uName').value=u.name;$('uPin').value='';$('uRol').value=u.rol;$('uMsg').textContent='Editando a '+u.name+'. Deja el PIN vacío para no cambiarlo'}
  else window.api.deleteUser(u.id).then(r=>{if(r.error){$('uMsg').textContent=r.error;return}log('Usuario eliminado',u.name);save();refreshUsers('Usuario eliminado')})});
$('uSave').onclick=()=>{var n=$('uName').value.trim();
  window.api.saveUser({id:uEdit,name:n,pin:$('uPin').value.trim(),rol:$('uRol').value}).then(r=>{
    if(r.error){$('uMsg').textContent=r.error;return}
    if(r.user&&U&&r.user.id===U.id){U=r.user;$('whoami').textContent=U.name+(U.rol==='dueno'?' (dueño)':' (cajero)')}
    uEdit=null;$('uName').value=$('uPin').value='';log('Usuario guardado',n);save();refreshUsers('Guardado')})};
$('bkSave').onclick=()=>dl('respaldo-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(D),'application/json');
$('bkLoad').onclick=()=>$('fileB').click();
$('fileB').addEventListener('change',e=>{var f=e.target.files[0];if(!f)return;var r=new FileReader();
  r.onload=()=>{var d;try{d=JSON.parse(r.result);if(!d.products||!d.sales)throw 0}catch(x){$('cfMsg').textContent='Archivo no válido';return}
    askConfirm('¿Reemplazar todos los datos actuales por este respaldo?').then(ok=>{if(!ok)return;D.products=d.products;D.sales=d.sales;D.held=d.held||[];D.clients=d.clients||{};['proveedores','compras','gastos','audit','ajustes'].forEach(k=>{D[k]=d[k]||(k==='proveedores'?{}:[])});Object.assign(D.config,d.config||{});D.caja=Object.assign({abierta:false,inicio:0,apertura:'',movs:[],cierres:[]},d.caja||{});save();fillConfig();renderAll();$('cfMsg').textContent='Respaldo restaurado'})};
  r.readAsText(f);e.target.value=''});

/* ---------- Auditoría ---------- */
function log(a,d){D.audit.unshift({t:new Date().toISOString(),u:U?U.name:'—',a:a,d:d||''});if(D.audit.length>500)D.audit.length=500}
var abonoMode='cli',today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
var fdt=t=>new Date(t).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});

/* ---------- Proveedores y compras ---------- */
var pvEdit=null,cpLines=[],cpTouched=false,pagoC=null;
function openPv(id){pvEdit=id||null;var p=id?D.proveedores[id]:{};$('pvName').value=p.name||'';$('pvRut').value=p.rut||'';$('pvTel').value=p.tel||'';$('dPv').showModal();$('pvName').focus()}
$('pvNew').onclick=()=>openPv();$('pvNo').onclick=()=>$('dPv').close();
$('pvOk').onclick=()=>{var n=$('pvName').value.trim();if(!n)return;var id=pvEdit||String(Date.now());D.proveedores[id]={name:n,rut:$('pvRut').value.trim(),tel:$('pvTel').value.trim()};log(pvEdit?'Proveedor editado':'Proveedor creado',n);save();$('dPv').close();renderCompras()};
$('pvBody').addEventListener('click',e=>{var b=e.target.closest('button');if(b)openPv(b.dataset.i)});
var pend=c=>c.total-c.pagado,provName=id=>(D.proveedores[id]||{}).name||'Sin proveedor';
function reposicion(){return Logic.reposicion(D.products,D.sales,Date.now())}
function renderCompras(){
  var rp=reposicion();
  $('repBody').innerHTML=rp.map(x=>'<tr><td>'+esc(x.p.name)+'</td><td class="n low">'+x.p.stock+'</td><td class="n">'+x.vd.toFixed(1)+'</td><td class="n"><b>'+x.buy+'</b></td></tr>').join('');
  $('repEmpty').hidden=rp.length>0;$('repCompra').disabled=!rp.length;
  $('comBody').innerHTML=D.compras.slice(0,100).map(c=>'<tr><td>'+fdt(c.fecha)+'</td><td>'+esc(provName(c.prov))+'</td><td title="'+esc(c.items.map(i=>i.qty+' x '+i.name).join(', '))+'">'+esc(c.doc||'—')+'</td><td class="n">'+money(c.total)+'</td><td class="n'+(pend(c)>0?' low':'')+'">'+money(pend(c))+'</td><td class="n">'+(pend(c)>0?'<button class="btn pri" data-i="'+c.id+'">Pagar</button>':'')+'</td></tr>').join('');
  $('comEmpty').hidden=D.compras.length>0;
  $('pvBody').innerHTML=Object.keys(D.proveedores).map(id=>{var v=D.proveedores[id],deb=sum(D.compras.filter(c=>c.prov===id),pend);return '<tr><td>'+esc(v.name)+'</td><td>'+esc(v.rut||'')+'</td><td>'+esc(v.tel||'')+'</td><td class="n'+(deb>0?' low':'')+'">'+money(deb)+'</td><td class="n"><button class="btn" data-i="'+id+'">Editar</button></td></tr>'}).join('');
}
$('repCsv').onclick=()=>dl('reposicion.csv',csv([['codigo','producto','stock','vende_por_dia','comprar']].concat(reposicion().map(x=>[x.code,x.p.name,x.p.stock,x.vd.toFixed(2),x.buy]))));
$('repCompra').onclick=()=>openCompra(reposicion().map(x=>({code:x.code,qty:x.buy,cost:x.p.cost||0})));
function renderCpLines(){
  $('cpBody').innerHTML=cpLines.map((l,i)=>'<div class="hr"><span style="flex:1">'+esc(D.products[l.code].name)+'</span><input class="mini" type="number" min="0" step="1" value="'+l.qty+'" data-i="'+i+'" data-k="qty" style="width:72px" aria-label="Cantidad"><input class="mini" type="number" min="0" step="1" value="'+l.cost+'" data-i="'+i+'" data-k="cost" style="width:92px" aria-label="Costo unitario"><button class="btn del" data-x="'+i+'" aria-label="Quitar">×</button></div>').join('')||'<div class="empty">Escanea los productos que llegaron</div>';
  cpTotal()}
function cpTotal(){var t=sum(cpLines,l=>l.qty*l.cost);$('cpTot').textContent=money(t);if(!cpTouched)$('cpPag').value=t}
function openCompra(lines){cpLines=lines||[];cpTouched=false;$('cpProv').innerHTML='<option value="">Sin proveedor</option>'+Object.keys(D.proveedores).map(id=>'<option value="'+id+'">'+esc(D.proveedores[id].name)+'</option>').join('');$('cpDoc').value='';$('cpMsg').textContent='';$('cpCaja').checked=false;renderCpLines();$('dCompra').showModal();$('cpScan').focus()}
$('cpNew').onclick=()=>openCompra();$('cpNo').onclick=()=>$('dCompra').close();
$('cpForm').addEventListener('submit',e=>{e.preventDefault();var c=$('cpScan').value.trim();$('cpScan').value='';if(!c)return;var p=D.products[c];
  if(!p){$('cpMsg').textContent='El código '+c+' no está en el catálogo. Créalo primero en Productos.';return}
  $('cpMsg').textContent='';var l=cpLines.find(x=>x.code===c);if(l)l.qty++;else cpLines.push({code:c,qty:1,cost:p.cost||0});renderCpLines();$('cpScan').focus()});
$('cpBody').addEventListener('input',e=>{var i=e.target.dataset.i;if(i==null)return;cpLines[i][e.target.dataset.k]=Math.max(0,Number(e.target.value)||0);cpTotal()});
$('cpBody').addEventListener('click',e=>{var b=e.target.closest('[data-x]');if(b){cpLines.splice(+b.dataset.x,1);renderCpLines()}});
$('cpPag').addEventListener('input',()=>{cpTouched=true});
$('cpOk').onclick=()=>{
  var L=cpLines.filter(l=>l.qty>0);if(!L.length){$('cpMsg').textContent='Agrega al menos un producto';return}
  var tot=sum(L,l=>l.qty*l.cost),pag=Math.min(Math.max(Number($('cpPag').value)||0,0),tot);
  L.forEach(l=>{var p=D.products[l.code];p.stock=(p.stock==null?0:p.stock)+l.qty;if(l.cost>0)p.cost=l.cost});
  var c={id:Date.now(),fecha:new Date().toISOString(),prov:$('cpProv').value,doc:$('cpDoc').value.trim(),items:L.map(l=>({code:l.code,name:D.products[l.code].name,qty:l.qty,cost:l.cost})),total:tot,pagado:pag,user:U.name};
  D.compras.unshift(c);
  if($('cpCaja').checked&&D.caja.abierta&&pag>0)D.caja.movs.push({t:c.fecha,tipo:'retiro',monto:pag,nota:'Compra '+(c.doc||'')});
  log('Compra registrada',money(tot)+' a '+provName(c.prov)+(c.doc?' ('+c.doc+')':''));save();$('dCompra').close();renderAll()};
$('comBody').addEventListener('click',e=>{var b=e.target.closest('button');if(!b)return;var c=D.compras.find(x=>String(x.id)===b.dataset.i);if(!c)return;
  pagoC=c;abonoMode='com';$('aTit').textContent='Pagar a '+provName(c.prov)+' (quedan '+money(pend(c))+')';$('aMonto').value=pend(c);$('dAbono').showModal();$('aMonto').focus()});
function pagarCompra(){var m=Math.round(Number($('aMonto').value));if(!pagoC||!m||m<1)return;m=Math.min(m,pend(pagoC));pagoC.pagado+=m;log('Pago a proveedor',money(m)+' a '+provName(pagoC.prov));save();$('dAbono').close();renderCompras()}

/* ---------- Inventario: conteo, mermas y precios ---------- */
var conteo=null,cvZero=false;
function renderConteo(){
  if(!conteo){$('cvBox').innerHTML='<div class="empty">Cuenta lo que hay en las góndolas escaneando cada unidad y compáralo con el stock del sistema.</div>';return}
  var ks=Object.keys(conteo);
  $('cvBox').innerHTML='<form id="cvForm" class="scan" autocomplete="off"><input id="cvScan" placeholder="Escanea cada unidad (Enter)"><button class="btn pri">Contar</button></form><div id="cvMsg" class="msg"></div>'+
   '<div class="scroll"><table><thead><tr><th>Producto</th><th class="n">Contado</th><th class="n">Sistema</th><th class="n">Diferencia</th></tr></thead><tbody>'+ks.map(k=>{var p=D.products[k],sy=p.stock==null?0:p.stock,d=conteo[k]-sy;return '<tr><td>'+esc(p.name)+'</td><td class="n">'+conteo[k]+'</td><td class="n">'+sy+'</td><td class="n'+(d?' low':'')+'">'+(d>0?'+':'')+d+'</td></tr>'}).join('')+'</tbody></table></div>'+
   '<label class="chk" style="margin-top:10px"><input type="checkbox" id="cvZero"'+(cvZero?' checked':'')+'> Los productos con stock que no escaneé cuentan como 0</label><div class="btns" style="max-width:420px"><button class="btn" data-a="x">Cancelar conteo</button><button class="btn pri" data-a="ok">Aplicar ajustes</button></div>';
  $('cvScan').focus()}
$('cvStart').onclick=()=>{conteo={};cvZero=false;renderConteo()};
$('cvBox').addEventListener('submit',e=>{e.preventDefault();var c=$('cvScan').value.trim();if(!c)return;
  if(!D.products[c]){beep(200);renderConteo();$('cvMsg').textContent='Código '+c+' no registrado';$('cvMsg').className='msg err';return}
  conteo[c]=(conteo[c]||0)+1;beep(880);renderConteo()});
$('cvBox').addEventListener('change',e=>{if(e.target.id==='cvZero')cvZero=e.target.checked});
$('cvBox').addEventListener('click',e=>{var b=e.target.closest('[data-a]');if(!b)return;
  if(b.dataset.a==='x'){conteo=null;renderConteo()}
  if(b.dataset.a==='ok'){var n=0,now=new Date().toISOString();
    Object.keys(D.products).forEach(k=>{var p=D.products[k],has=conteo[k]!=null;if(!has&&!(cvZero&&p.stock!=null&&p.stock>0))return;var antes=p.stock==null?0:p.stock,des=has?conteo[k]:0;
      if(antes!==des||p.stock==null){D.ajustes.unshift({t:now,u:U.name,code:k,name:p.name,antes:antes,despues:des,motivo:'Conteo físico'});p.stock=des;n++}});
    log('Inventario físico',n+' productos ajustados');conteo=null;save();renderAll()}});
function renderInv(){renderConteo();$('ajBody').innerHTML=D.ajustes.slice(0,100).map(a=>'<tr><td>'+fdt(a.t)+'</td><td>'+esc(a.name)+'</td><td class="n">'+a.antes+'</td><td class="n">'+a.despues+'</td><td>'+esc(a.motivo)+'</td><td>'+esc(a.u)+'</td></tr>').join('')}
$('mmNew').onclick=()=>{$('mmProd').innerHTML=Object.keys(D.products).filter(k=>D.products[k].stock!=null).map(k=>'<option value="'+esc(k)+'">'+esc(D.products[k].name)+' (stock '+D.products[k].stock+')</option>').join('');$('mmQty').value='';$('dMerma').showModal()};
$('mmNo').onclick=()=>$('dMerma').close();
$('mmOk').onclick=()=>{var c=$('mmProd').value,p=D.products[c],q=Math.abs(Math.round(Number($('mmQty').value))),t=$('mmTipo').value;if(!p||!q)return;
  var antes=p.stock;p.stock=antes+(t==='Ajuste (suma)'?q:-q);D.ajustes.unshift({t:new Date().toISOString(),u:U.name,code:c,name:p.name,antes:antes,despues:p.stock,motivo:t});
  log(t,p.name+': '+antes+' a '+p.stock);save();$('dMerma').close();renderAll()};
$('fCat').onchange=renderProducts;
$('masivo').onclick=()=>{$('mCat').innerHTML='<option value="">Todos los productos</option>'+cats().map(c=>'<option>'+esc(c)+'</option>').join('');$('mPct').value='';$('dMasivo').showModal()};
$('mNo2').onclick=()=>$('dMasivo').close();
$('mOk2').onclick=()=>{var pct=Number($('mPct').value),c=$('mCat').value;if(!pct)return;var ks=Object.keys(D.products).filter(k=>!c||D.products[k].cat===c);$('dMasivo').close();
  askConfirm('Se cambiarán los precios de '+ks.length+' productos en '+(pct>0?'+':'')+pct+'%. ¿Continuar?').then(ok=>{if(!ok)return;
    ks.forEach(k=>{var p=D.products[k],np=p.price*(1+pct/100);if($('mRed').checked)np=Math.round(np/10)*10;np=Math.max(0,Math.round(np));if(np!==p.price){p.hist=(p.hist||[]).concat({f:new Date().toISOString(),precio:p.price}).slice(-20);p.price=np}});
    log('Cambio masivo de precios',(c||'Todos')+': '+pct+'% en '+ks.length+' productos');save();renderAll()})};

/* ---------- Reportes ---------- */
var lastRep=null;
function bars(v,l,step){var W=Math.max(300,v.length*14),H=120,mx=Math.max.apply(null,v.concat([1])),bw=W/v.length;
  return '<svg viewBox="0 0 '+W+' '+(H+16)+'" role="img" style="width:100%;height:auto">'+v.map((x,i)=>{var h=Math.round(x/mx*H);return '<rect x="'+(i*bw+1)+'" y="'+(H-h)+'" width="'+Math.max(bw-2,1)+'" height="'+h+'" rx="2" fill="var(--brand)"><title>'+l[i]+': '+money(x)+'</title></rect>'+(i%step===0?'<text x="'+(i*bw+bw/2)+'" y="'+(H+12)+'" font-size="9" text-anchor="middle" fill="var(--muted)">'+l[i]+'</text>':'')}).join('')+'</svg>'}
function renderReportes(){
  var n=Number($('rPer').value),d0=new Date(),end=new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()+1).getTime(),DAY=864e5,start=end-n*DAY,pst=start-n*DAY,
  ok=D.sales.filter(s=>!s.anulada),tm=s=>new Date(s.fecha).getTime(),cur=ok.filter(s=>tm(s)>=start&&tm(s)<end),prev=ok.filter(s=>tm(s)>=pst&&tm(s)<start),
  tot=sum(cur,s=>s.total),ptot=sum(prev,s=>s.total),costo=sum(cur,s=>sum(s.items,i=>(i.cost||0)*i.qty)),gs=D.gastos.filter(g=>{var t=new Date(g.fecha).getTime();return t>=start&&t<end}),gas=sum(gs,g=>g.monto),
  ch=ptot?Math.round((tot-ptot)/ptot*100):null,inv=sum(Object.keys(D.products).filter(k=>D.products[k].stock>0),k=>D.products[k].stock*(D.products[k].cost||0)),
  dias=[],dl=[],horas=Array(24).fill(0);
  for(var i=0;i<n;i++){var a=start+i*DAY;dias.push(sum(cur.filter(s=>tm(s)>=a&&tm(s)<a+DAY),s=>s.total));var dd=new Date(a);dl.push(dd.getDate()+'/'+(dd.getMonth()+1))}
  cur.forEach(s=>{horas[new Date(s.fecha).getHours()]+=s.total});
  var util=tot-costo-gas,tp={};cur.forEach(s=>s.items.forEach(i=>{tp[i.name]=(tp[i.name]||0)+i.qty}));
  var top=Object.keys(tp).sort((a,b)=>tp[b]-tp[a]).slice(0,8),vendidos={};cur.forEach(s=>s.items.forEach(i=>{vendidos[i.code]=1}));
  var sin=Object.keys(D.products).filter(k=>!vendidos[k]).map(k=>D.products[k].name).slice(0,8);
  var st=(a,b,c)=>'<div class="stat"><span>'+a+'</span><b>'+b+'</b>'+(c?'<span>'+c+'</span>':'')+'</div>';
  $('rStats').innerHTML='<div class="stats">'+st('Total vendido',money(tot),ch==null?'sin periodo anterior':(ch>=0?'+':'')+ch+'% frente al periodo anterior')+st('Ventas',cur.length,'ticket promedio '+money(cur.length?tot/cur.length:0))+st('Ganancia bruta',money(tot-costo),'ventas menos costo')+st('Gastos',money(gas))+st('Utilidad real',money(util),'ganancia menos gastos')+st('Inventario a costo',money(inv))+'</div>';
  $('chDia').innerHTML=bars(dias,dl,Math.ceil(n/8));$('chHora').innerHTML=bars(horas,horas.map((x,h)=>h+'h'),3);
  var row=(a,b)=>'<div class="sm hr" style="border:0"><span>'+esc(a)+'</span><b>'+b+'</b></div>';
  $('rTop').innerHTML=top.map(k=>row(k,tp[k])).join('')||'<div class="sm">Sin ventas en el periodo</div>';
  $('rNo').innerHTML=sin.map(k=>row(k,'')).join('')||'<div class="sm">Todos tuvieron ventas</div>';
  var cu={};D.caja.cierres.forEach(c=>{var u=c.user||'—';cu[u]=cu[u]||{n:0,d:0,t:0};cu[u].n++;if(c.dif){cu[u].d++;cu[u].t+=c.dif}});
  $('rCaja').innerHTML=Object.keys(cu).map(u=>{var x=cu[u],al=x.d>=3||(x.n>=2&&x.d/x.n>=.5);return '<div class="sm hr" style="border:0"><span class="'+(al?'low':'')+'">'+esc(u)+(al?' (revisar)':'')+'</span><span>'+x.d+' de '+x.n+' con diferencia ('+money(x.t)+')</span></div>'}).join('')||'<div class="sm">Aún no hay cierres de caja</div>';
  $('gBody').innerHTML=D.gastos.slice(0,100).map(g=>'<tr><td>'+new Date(g.fecha).toLocaleDateString('es-CL')+'</td><td>'+esc(g.cat)+'</td><td>'+esc(g.desc)+'</td><td class="n">'+money(g.monto)+'</td><td class="n"><button class="btn del" data-i="'+g.id+'">Eliminar</button></td></tr>').join('');
  $('auBody').innerHTML=D.audit.slice(0,100).map(a=>'<tr><td>'+fdt(a.t)+'</td><td>'+esc(a.u)+'</td><td>'+esc(a.a)+'</td><td>'+esc(a.d)+'</td></tr>').join('');
  lastRep={resumen:[['Periodo (dias)',n],['Total vendido',tot],['Periodo anterior',ptot],['Ventas',cur.length],['Ganancia bruta',tot-costo],['Gastos',gas],['Utilidad real',util],['Inventario a costo',inv]],dias:dias.map((v,i)=>[dl[i],v]),horas:horas.map((v,h)=>[h,v]),cur:cur,gs:gs}}
$('rPer').onchange=renderReportes;
$('gBody').addEventListener('click',e=>{var b=e.target.closest('button');if(!b)return;var g=D.gastos.find(x=>String(x.id)===b.dataset.i);if(g)askConfirm('¿Eliminar el gasto "'+g.desc+'"?').then(ok=>{if(ok){D.gastos=D.gastos.filter(x=>x!==g);log('Gasto eliminado',g.cat+' '+money(g.monto));save();renderReportes()}})});
$('gNew').onclick=()=>{$('gFecha').value=today();$('gCat').value='';$('gDet').value='';$('gMonto').value='';$('dGasto').showModal();$('gCat').focus()};
$('gNo').onclick=()=>$('dGasto').close();
$('gOk').onclick=()=>{var m=Math.round(Number($('gMonto').value));if(!m||m<1||!$('gFecha').value)return;D.gastos.unshift({id:Date.now(),fecha:new Date($('gFecha').value+'T12:00:00').toISOString(),cat:$('gCat').value.trim()||'Otros',desc:$('gDet').value.trim(),monto:m});log('Gasto registrado',money(m)+' '+$('gCat').value.trim());save();$('dGasto').close();renderReportes()};
$('aExp').onclick=()=>dl('auditoria.csv',csv([['fecha','usuario','accion','detalle']].concat(D.audit.map(a=>[a.t,a.u,a.a,a.d]))));
$('rXls').onclick=()=>{var R=lastRep;if(!R)return;
  window.api.saveXlsx('reporte-'+today()+'.xlsx',[{name:'Resumen',rows:R.resumen},{name:'Ventas por dia',rows:[['Dia','Total']].concat(R.dias)},{name:'Ventas por hora',rows:[['Hora','Total']].concat(R.horas)},
   {name:'Ventas',rows:[['Fecha','Usuario','Pago','Total','Detalle']].concat(R.cur.map(s=>[s.fecha,s.user||'',s.metodo,s.total,s.items.map(i=>i.qty+'x '+i.name).join(' | ')]))},
   {name:'Gastos',rows:[['Fecha','Categoria','Detalle','Monto']].concat(R.gs.map(g=>[g.fecha,g.cat,g.desc,g.monto]))},
   {name:'Inventario',rows:[['Codigo','Producto','Stock','Costo','Valor a costo']].concat(Object.keys(D.products).filter(k=>D.products[k].stock!=null).map(k=>{var p=D.products[k];return [k,p.name,p.stock,p.cost||0,p.stock*(p.cost||0)]}))}]
  ).then(r=>{$('rMsg').textContent=r==='ok'?'Excel guardado':(r==='cancelado'?'':'No se pudo guardar: '+r)})};
$('rPrint').onclick=()=>{document.body.classList.add('pv');window.print()};
window.addEventListener('afterprint',()=>document.body.classList.remove('pv'));

/* ---------- Panel de inicio ---------- */
var dPer=0,DPER=[{d:1,o:0},{d:1,o:1},{d:7,o:0},{d:30,o:0}];
function lineChart(v,l){var W=520,H=130,P=8,mx=Math.max.apply(null,v.concat([1])),st=(W-2*P)/Math.max(v.length-1,1),pts=v.map((x,i)=>[P+i*st,H-P-(x/mx)*(H-2*P)]),ln=pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ');
  return '<svg viewBox="0 0 '+W+' '+(H+14)+'" role="img" aria-label="Ventas del periodo" style="width:100%;height:auto"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fb4ff" stop-opacity=".35"/><stop offset="1" stop-color="#2fb4ff" stop-opacity="0"/></linearGradient></defs><polygon points="'+P+','+(H-P)+' '+ln+' '+(P+(v.length-1)*st)+','+(H-P)+'" fill="url(#lg)"/><polyline points="'+ln+'" fill="none" stroke="#2fb4ff" stroke-width="2" stroke-linejoin="round"/>'+pts.map((q,i)=>'<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="'+(v.length>40?0:2.5)+'" fill="#2fb4ff"><title>'+l[i]+': '+money(v[i])+'</title></circle>').join('')+'<text x="'+P+'" y="'+(H+11)+'" font-size="9" fill="var(--muted)">'+l[0]+'</text><text x="'+(W-P)+'" y="'+(H+11)+'" font-size="9" text-anchor="end" fill="var(--muted)">'+l[l.length-1]+'</text></svg>'}
var chg=(a,b)=>b?Math.round((a-b)/b*100):null,
    chgH=c=>c==null?'<small>sin periodo anterior</small>':'<small class="'+(c>=0?'up':'dn')+'">'+(c>=0?'▲ ':'▼ ')+Math.abs(c)+'% vs periodo anterior</small>';
function renderDash(){
  var cf=DPER[dPer],DAY=864e5,d0=new Date(),t0=new Date(d0.getFullYear(),d0.getMonth(),d0.getDate()).getTime(),end=t0+DAY-cf.o*DAY,start=end-cf.d*DAY,pst=start-cf.d*DAY,
  ok=D.sales.filter(s=>!s.anulada),tm=s=>new Date(s.fecha).getTime(),cur=ok.filter(s=>tm(s)>=start&&tm(s)<end),prev=ok.filter(s=>tm(s)>=pst&&tm(s)<start),
  tot=sum(cur,s=>s.total),ptot=sum(prev,s=>s.total),items=[].concat.apply([],cur.map(s=>s.items)),tp={},lows=[];
  items.forEach(i=>{tp[i.name]=(tp[i.name]||0)+i.qty});
  Object.keys(D.products).forEach(k=>{var p=D.products[k];if(p.stock!=null&&p.stock<=(p.min||0))lows.push(p)});
  $('dPills').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.p===dPer)));
  $('dSub').textContent=D.config.nombre+', '+new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});
  $('dTot').textContent=money(tot);$('dTotC').innerHTML=chgH(chg(tot,ptot));$('dOrd').textContent=cur.length;$('dOrdC').innerHTML=chgH(chg(cur.length,prev.length));
  $('dProds').textContent=Object.keys(D.products).length;$('dLow').textContent=lows.length;$('dDesc').textContent=cur.filter(s=>s.desc>0).length;
  $('dArt').textContent=sum(items,i=>i.qty);$('dDist').textContent=Object.keys(tp).length;
  var top=Object.keys(tp).sort((a,b)=>tp[b]-tp[a]).slice(0,5);
  $('dTop').innerHTML=top.map((k,i)=>'<div class="dr" style="grid-template-columns:1fr auto"><span>'+(i+1)+'. '+esc(k)+'</span><b>'+tp[k]+' u.</b></div>').join('')||'<small>Sin ventas en el periodo</small>';
  var v=[],l=[];
  if(cf.d===1){v=Array(24).fill(0);l=v.map((x,h)=>h+'h');cur.forEach(s=>{v[new Date(s.fecha).getHours()]+=s.total})}
  else for(var i=0;i<cf.d;i++){var a=start+i*DAY,dd=new Date(a);v.push(sum(cur.filter(s=>tm(s)>=a&&tm(s)<a+DAY),s=>s.total));l.push(dd.getDate()+'/'+(dd.getMonth()+1))}
  $('dLine').innerHTML=lineChart(v,l);var c=chg(tot,ptot);$('dLineNote').textContent=c==null?'Sin periodo anterior para comparar':'Ventas '+(c>=0?'suben ':'bajan ')+Math.abs(c)+'% frente al periodo anterior';
  var d7=[];for(var j=6;j>=0;j--){var a7=t0-j*DAY;d7.push([new Date(a7).toLocaleDateString('es-CL',{weekday:'short',day:'numeric'}),sum(ok.filter(s=>tm(s)>=a7&&tm(s)<a7+DAY),s=>s.total)])}
  var m7=Math.max.apply(null,d7.map(x=>x[1]).concat([1]));
  $('dDays').innerHTML=d7.map(x=>'<div class="dr"><span>'+x[0]+'</span><div class="bar"><i style="width:'+Math.round(x[1]/m7*100)+'%"></i></div><b>'+money(x[1])+'</b></div>').join('');
  $('dLowList').innerHTML=lows.sort((a,b)=>a.stock-b.stock).slice(0,6).map(p=>{var cr=p.stock<=0||p.stock<=(p.min||0)/2;return '<div class="rt"><span>'+esc(p.name)+'<small>Stock '+p.stock+' de mínimo '+(p.min||0)+'</small></span><span class="badge'+(cr?'':' w')+'">'+(cr?'Crítico':'Bajo')+'</span></div>'}).join('')||'<small>Todo el stock está sobre el mínimo</small>';
  $('dRecent').innerHTML=D.sales.slice(0,6).map(s=>'<div class="rt"><span class="'+(s.anulada?'anul':'')+'">Venta #'+String(s.id).slice(-6)+'<small>'+sum(s.items,i=>i.qty)+' art. · '+esc(s.user||'—')+' · '+fdt(s.fecha)+'</small></span><span style="text-align:right"><b>'+money(s.total)+'</b><br><span class="badge ok">'+esc(s.metodo)+'</span></span></div>').join('')||'<small>Aún no hay ventas</small>';
}
$('dPills').addEventListener('click',e=>{var b=e.target.closest('button');if(b){dPer=+b.dataset.p;renderDash()}});
$('dQa').addEventListener('click',e=>{var b=e.target.closest('button');if(b)document.querySelector('nav [data-tab='+b.dataset.go+']').click()});

/* ---------- Navegación y arranque ---------- */
function renderAll(){renderCart();renderProducts();renderCaja();renderHist();renderClients();renderUsers();renderCliBtn();renderCompras();renderInv();renderReportes();renderDash()}
document.querySelector('nav').addEventListener('click',e=>{
  var b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',x===b));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id===b.dataset.tab));
  focusScan();
});
document.addEventListener('click',e=>{if(e.target.closest('#venta')&&!e.target.closest('button,input'))focusScan()});
document.addEventListener('keydown',e=>{if(e.key==='F2'&&!anyOpen()&&!$('cobrar').disabled){e.preventDefault();$('cobrar').click()}});
function loadData(d){
  if(d){D.products=d.products||{};D.sales=d.sales||[];D.held=d.held||[];D.clients=d.clients||{};['proveedores','compras','gastos','audit','ajustes'].forEach(k=>{D[k]=d[k]||(k==='proveedores'?{}:[])});Object.assign(D.config,d.config||{});Object.assign(D.caja,d.caja||{})}
  else{D.products=DEMO;save()}
  fillConfig();renderAll()}
window.api.users().then(us=>{D.users=us;showLogin()});
})();
