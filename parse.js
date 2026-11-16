// Independent Markdown block and inline parser. All document state is local.
const punctuation = /[\p{P}\p{S}]/u;
const escapable = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;
function escapeHTML(s, all=false) {
 return s.replace(all ? /[&<>"']/g : /&(?!#\d{1,7};|#x[\da-f]{1,6};|[a-z][\da-z]*;)|[<>"']/gi,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function numeric(s) {return s.replace(/&#(x[\da-f]{1,6}|\d{1,7});/gi,(m,n)=>{let v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n;return String.fromCodePoint(v===0||v>0x10ffff||v>=0xd800&&v<=0xdfff?65533:v);});}
function unescape(s){return numeric(s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1'));}
function url(s){try{return encodeURI(unescape(s)).replace(/%25/g,'%');}catch{return null;}}
function label(s){return s.replace(/\s+/g,' ').trim().toLowerCase().replace(/ß/g,'ss');}
function indent(s){let n=0,i=0;while(s[i]===' '||s[i]==='\t'){n+=s[i++]==='\t'?4-n%4:1;}return n;}
function strip(s,n){let i=0,c=0;while(c<n&&(s[i]===' '||s[i]==='\t'))c+=s[i++]==='\t'?4-c%4:1;if(c>n){let rest=s.slice(i),lead=/^[ \t]*/.exec(rest)[0],extra=c-n;for(const ch of lead){extra+=ch==='\t'?4-c%4:1;c+=ch==='\t'?4-c%4:1;}return ' '.repeat(extra)+rest.slice(lead.length);}let rest=s.slice(i);if(n%4){let col=c,k=0,t='';while(/[ \t]/.test(rest[k]??'')&&k<rest.length){let ch=rest[k++];if(ch==='\t'){let w=4-col%4;t+=' '.repeat(w);col+=w;}else{t+=' ';col++;}}return t+rest.slice(k);}return rest;}
function paragraphTail(ts){let t=ts.at(-1);if(!t)return false;if(t.type==='quote')return paragraphTail(t.children);if(t.type==='list')return paragraphTail(t.items.at(-1).children);return t.type==='paragraph';}

const blockTags='address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' ');
const blockTagRE=new RegExp('^ {0,3}</?(?:'+blockTags.join('|')+')(?:[\\s/>]|$)','i');
const tagRE=/^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>/;
function htmlStart(s,interrupt=false){
 let first=0;while(first<3&&s[first]===' ')first++;if(s[first]!=='<')return null;
 if(/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.test(s))return {end:new RegExp('</'+s.trim().match(/^<(\w+)/)[1]+'\\s*>','i')};
 if(/^ {0,3}<!--/.test(s))return {end:/-->/};
 if(/^ {0,3}<\?/.test(s))return {end:/\?>/};
 if(/^ {0,3}<![A-Z]/.test(s))return {end:/>/};
 if(/^ {0,3}<!\[CDATA\[/.test(s))return {end:/\]\]>/};
 if(blockTagRE.test(s))return {blank:true};
 if(!interrupt){let t=s.trimStart(),m=tagRE.exec(t);if(m&&(!t.startsWith('</')||/^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/.test(m[0]))&&/^\s*$/.test(t.slice(m[0].length)))return {blank:true};}
 return null;
}
function thematic(s){return /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(s);}
function marker(s){let m=/^( {0,3})([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/.exec(s);if(!m)return null;let ordered=m[2].length>1;let col=m[1].length+m[2].length;let ws=0;for(const c of m[3])ws+=c==='\t'?4-(col+ws)%4:1;let pad=ws>4?1:ws||1;let rest=ws>4?' '.repeat(ws-1)+m[4]:m[4];return {base:m[1].length,kind:ordered?m[2].slice(-1):m[2],ordered,start:ordered?parseInt(m[2]):null,width:col+pad,text:rest,empty:!m[4]};}
function fence(s){return /^ {0,3}(`{3,}(?!.*`)|~{3,})(.*)$/.exec(s);}
function interrupt(s){let m=marker(s);return /^ {0,3}(?:#{1,6}(?:\s|$)|>)/.test(s)||thematic(s)||!!fence(s)||!!htmlStart(s,true)||!!(m&&(!m.ordered||m.start===1)&&!m.empty);}
function cells(s){s=s.trim();if(s[0]==='|')s=s.slice(1);if(/\|\s*$/.test(s)&&!/(?<!\\)(?:\\\\)*\\\|\s*$/.test(s))s=s.replace(/\|\s*$/,'');let a=[],p='';for(let i=0;i<s.length;i++){if(s[i]==='|'&&(i===0||s[i-1]!=='\\')){a.push(p.trim());p='';}else if(s[i]==='\\'&&s[i+1]==='|'){p+='|';i++;}else p+=s[i];}a.push(p.trim());return a;}
function tableInfo(a,b){if(!b||!a.includes('|'))return null;let x=cells(b);if(!x.length||x.some(v=>!/^:?-+:?$/.test(v)))return null;let h=cells(a);if(h.length!==x.length)return null;return {head:h,align:x.map(v=>v.startsWith(':')?v.endsWith(':')?'center':'left':v.endsWith(':')?'right':null)};}
function destination(s,pos,definition=false){
 let i=pos;while(/[ \t\n]/.test(s[i]??'')&&i<s.length)i++;
 let href='',angle=false;
 if(s[i]==='<'){angle=true;i++;let start=i;while(i<s.length&&s[i]!=='>'&&s[i]!=='\n'){if(s[i]==='\\'&&i+1<s.length)i+=2;else if(s[i]==='<')return null;else i++;}if(s[i]!=='>')return null;href=s.slice(start,i++);}
 else {let start=i,depth=0;while(i<s.length){let c=s[i];if(c==='\\'&&escapable.test(s[i+1]??'')){i+=2;continue;}if(/[ \t\n]/.test(c))break;if(c==='(')depth++;if(c===')'){if(depth===0)break;depth--;}i++;}if(depth)return null;href=s.slice(start,i);}
 const after=i;while(i<s.length&&/[ \t\n]/.test(s[i]))i++;
 let title=null;
 if(i>after&&['"',"'",'('].includes(s[i])){let end=s[i]==='('?')':s[i];let start=++i;while(i<s.length&&s[i]!==end){if(s[i]==='\\')i++;i++;}if(i>=s.length)return definition?{href,title:null,end:after}:null;title=s.slice(start,i++);while(i<s.length&&/[ \t\n]/.test(s[i]))i++;}
 return {href,title,end:i,after,angle};
}
function readDefinition(lines,i,refs){
 if(!/^ {0,3}\[/.test(lines[i]))return 0;
 let end=i;while(end<lines.length&&lines[end].trim())end++;
 let joined=lines.slice(i,end).join('\n');
 let m=/^ {0,3}\[((?:\\.|[^\[\]\\])+)\]:[ \t]*(?:\n[ \t]*)?/.exec(joined);
 if(!m||!label(m[1]))return 0;
 let d=destination(joined,m[0].length,true);if(!d||(!d.href&&!d.angle))return 0;
 let stop=d.end;while(stop>0&&/\s/.test(joined[stop-1]))stop--;
 if(joined.slice(stop).split('\n')[0].trim()){
  if(d.title!==null&&joined.slice(d.after,stop).includes('\n')){d.title=null;stop=d.after;}
  else return 0;
 }
 const key=label(m[1]);if(!refs.has(key))refs.set(key,{href:d.href,title:d.title});
 return joined.slice(0,stop).split('\n').length;
}

function blocks(lines,refs,nested=false){
 const out=[];let i=0,blankBefore=false;const emit=t=>{t.blankBefore=blankBefore;blankBefore=false;out.push(t);};
 while(i<lines.length){let s=lines[i];if(!s.trim()){blankBefore=true;i++;continue;}
 let m;
 if((m=fence(s))){let ch=m[1][0],n=m[1].length,base=m[1][0]==='`'?indent(s):0,body=[],closing=new RegExp('^ {0,3}'+ch+'{'+n+',}\\s*$');i++;while(i<lines.length&&!closing.test(lines[i])){let z=lines[i++];let k=0;while(k<z.length&&k<base&&(z[k]===' '||z[k]==='\t'))k++;body.push(z.slice(k));}if(i<lines.length)i++;emit({type:'code',text:body.join('\n').replace(/\n$/,''),nonempty:body.length>1,lang:unescape(m[2].trim()).split(/\s/)[0]});continue;}
 if(indent(s)>=4){let body=[];while(i<lines.length&&(indent(lines[i])>=4||!lines[i].trim()))body.push(strip(lines[i++],4));while(body.length&&!body.at(-1).trim())body.pop();emit({type:'code',text:body.join('\n')});continue;}
 if((m=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(s))){let t=(m[2]??'').trim().replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim();emit({type:'heading',depth:m[1].length,text:t});i++;continue;}
 if(thematic(s)){emit({type:'hr'});i++;continue;}
 if(/^ {0,3}>/.test(s)){let body=[],lazy=true;body.lazy=new Set();while(i<lines.length){let q=/^ {0,3}>[ \t]?(.*)$/.exec(lines[i]);if(q){let z=/^( {0,3})>([ \t]*)(.*)$/.exec(lines[i]),col=z[1].length+1,base=col;for(const ch of z[2])col+=ch==='\t'?4-col%4:1;let part=' '.repeat(Math.max(0,col-base-1))+z[3];body.push(part);lazy=part.trim()?paragraphTail(blocks(body,new Map())):false;i++;}else if(lines[i].trim()&&lazy&&!interrupt(lines[i])){body.lazy.add(body.length);body.push(/^ {0,3}(?:=+|-+)\s*$/.test(lines[i])?'    '+lines[i++]:lines[i++]);}else break;}body.finalNewline=false;emit({type:'quote',children:blocks(body,refs,true)});continue;}
 const hs=htmlStart(s);if(hs){let a=[];do{let line=lines[i++];a.push(line);if(hs.end?.test(line))break;}while(i<lines.length&&(!hs.blank||lines[i].trim()));emit({type:'html',text:a.join('\n')+((lines[i]!==undefined&&!lines[i].trim()&&(lines[i]===''||hs.blank))?'':i<lines.length||lines.finalNewline!==false?'\n':'')});continue;}
 const def=readDefinition(lines,i,refs);if(def){i+=def;continue;}
 let mark=marker(s);
 if(mark){let items=[],loose=false,kind=mark.kind,ordered=mark.ordered,start=mark.start;
  while(i<lines.length){let cur=marker(lines[i]);if(cur&&cur.empty)cur.width=cur.base+cur.kind.length+(cur.ordered?String(cur.start).length:0)+1;if(!cur||cur.kind!==kind||cur.ordered!==ordered||thematic(lines[i]))break;
   let body=[cur.text],blank=false,internalBlank=false;body.lazy=new Set();i++;
   while(i<lines.length){let line=lines[i],next=marker(line);
    if(next&&next.base<cur.width)break;
    if(!line.trim()){if(cur.empty&&body.length===1){i++;blank=true;break;}body.push('');blank=true;i++;continue;}
    if(indent(line)>=cur.width){if(blank)internalBlank=true;let lead=/^[ \t]*/.exec(line)[0];body.push(strip(' '.repeat(indent(lead))+line.slice(lead.length),cur.width));blank=false;i++;continue;}
    if(blank||interrupt(line)||body.length&&!!fence(body.at(-1)))break;
    body.lazy.add(body.length);body.push(line);i++;
   }
   const trailing=blank;while(body.length&&body.at(-1)==='')body.pop();
   body.finalNewline=false;let task=/^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]??'');if(task)body[0]=body[0].slice(task[0].length);
   let children=blocks(body,refs,true);items.push({children,task:task?task[1].toLowerCase()==='x':null});
   if(children.slice(1).some(t=>t.blankBefore)||internalBlank&&children.length===1&&body.some(x=>/^ {0,3}\[.*\]:/.test(x)))loose=true;
   let next=marker(lines[i]??'');if(trailing&&next&&next.kind===kind)loose=true;
  }
  if(blankBefore){}emit({type:'list',items,loose,ordered,start});if(i>0&&lines[i-1]==='')blankBefore=true;continue;
 }
 let tbl=tableInfo(s,lines[i+1]);if(tbl){i+=2;let rows=[];while(i<lines.length&&!/^ *$/.test(lines[i])&&!interrupt(lines[i]))rows.push(cells(lines[i++]));emit({type:'table',...tbl,rows});continue;}
 let text=[s];i++;
 while(i<lines.length&&(lines[i].trim()||lines[i]!==''&&i===lines.length-1)){
  if(!lines.lazy?.has(i)&&/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i])){emit({type:'heading',depth:lines[i].trim()[0]==='='?1:2,text:text.join('\n').trim()});i++;text=null;break;}
  if(!lines.lazy?.has(i)&&(interrupt(lines[i])||nested&&marker(lines[i])&&!marker(lines[i]).empty))break;
  if(tableInfo(lines[i],lines[i+1]))break;
  text.push(lines.lazy?.has(i)&&indent(lines[i])>=4&&!/^ {4}(?:=+|-+)\s*$/.test(lines[i])?lines[i].trimStart():lines[i]);i++;
 }
 if(text)emit({type:'paragraph',text:text.join('\n')});
 }
 return out;
}
function inline(src,refs,inLink=false,probe=false){
 const nestedLink=inLink;const nodes=[],delims=[];let i=0,raw=false;inLink=inLink||!!refs.rawLink;const masked=new Uint8Array(src.length);for(let p=src.indexOf('`');p>=0;p=src.indexOf('`',p)){let slash=p-1;while(slash>=0&&src[slash]==='\\')slash--;if((p-slash-1)%2){p++;continue;}let n=1;while(src[p+n]==='`')n++;let e=p+n,found=-1;while((e=src.indexOf('`',e))>=0){let k=1;while(src[e+k]==='`')k++;if(k===n){found=e+k;break;}e+=k;}if(found>=0){masked.fill(1,p,found);p=found;}else p+=n;}
 const bracketMask=/!?\[((?:\\.|[^\[\]\\])*)\]/g;let bm;
 while((bm=bracketMask.exec(src))){let end=bm.index+bm[0].length,valid=false;
  if(src[end]==='('){let d=destination(src,end+1);valid=!!d&&src[d.end]===')';}
  if(!valid){let r=/^\[([^\[\]]*)\]/.exec(src.slice(end));valid=refs.has(label(r&&r[1]?r[1]:bm[1]));}
  if(valid)masked.fill(1,bm.index,end);
 }

 const plainStop=/[\\`<\[!*_~\n&]/g;const hasAt=src.includes('@');const autoStarts=[];let autoIndex=0;
 for(const m of src.matchAll(hasAt?/(?:https?|ftp):\/\/|www\.|(?<![\w.+-])(?:(?:mailto|xmpp):)?[a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d-]+\.[a-z\d]/gi:/(?:https?|ftp):\/\/|www\./gi))autoStarts.push(m.index);

 function add(text,plain=false){nodes.push({text,plain});}
 while(i<src.length){let c=src[i],tail=src.slice(i),m;
 if(c==='\\'&&i+1<src.length){if(src[i+1]==='\n'){add('<br>');i+=2;while(src[i]===' ')i++;continue;}if(escapable.test(src[i+1])){add(escapeHTML(src[i+1],true),true);i+=2;continue;}}
 if(c==='`'){let n=1;while(src[i+n]==='`')n++;let end=i+n;let found=-1;while((end=src.indexOf('`',end))>=0){let k=1;while(src[end+k]==='`')k++;if(k===n){found=end;break;}end+=k;}if(found>=0){let t=src.slice(i+n,found).replace(/\n/g,' ');if(t.startsWith(' ')&&t.endsWith(' ')&&/[^ ]/.test(t))t=t.slice(1,-1);add('<code>'+escapeHTML(t,true)+'</code>');i=found+n;continue;}add('`'.repeat(n),true);i+=n;continue;}
 if(c==='<'&&(m=/^<([a-z][a-z\d+.-]{1,31}:[^\s<>]*)>/i.exec(tail))){let h;try{h=encodeURI(m[1]).replace(/%25/g,'%');}catch{h=m[1];}add('<a href="'+escapeHTML(h??m[1])+'">'+escapeHTML(m[1])+'</a>');i+=m[0].length;continue;}
 if(c==='<'&&(m=/^<([a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*)>/i.exec(tail))){add('<a href="mailto:'+escapeHTML(m[1])+'">'+escapeHTML(m[1])+'</a>');i+=m[0].length;continue;}
 if(c==='<'){
  m=/^<!--(?:-?>|[\s\S]*?-->)|^<\?[\s\S]*?\?>|^<![A-Z][\s\S]*?>|^<!\[CDATA\[[\s\S]*?\]\]>/.exec(tail)||tagRE.exec(tail);
  if(m&&(!/^<\//.test(m[0])||/^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/.test(m[0]))){add(m[0]);if(/^<a(?:\s|>)/i.test(m[0])){inLink=true;refs.rawLink=true;}else if(/^<\/a\s*>/i.test(m[0])){inLink=false;refs.rawLink=false;}if(/^<(pre|code|kbd|script)(?:\s|>)/i.test(m[0]))raw=true;else if(/^<\/(pre|code|kbd|script)\s*>/i.test(m[0]))raw=false;i+=m[0].length;continue;}
 }
 if(c==='['||c==='!'&&src[i+1]==='['){let image=c==='!',open=i+(image?1:0),j=open+1,depth=1;
  while(j<src.length){if(src[j]==='<'){let h=tagRE.exec(src.slice(j))||/^<[^<>\n]*>/.exec(src.slice(j));if(h){j+=h[0].length;continue;}}if(src[j]==='\\'){j+=2;continue;}if(src[j]==='`'){let n=1;while(src[j+n]==='`')n++;if(n>1&&src[j+n]===']'){j+=n;continue;}let e=src.indexOf('`',j+1);if(e>j+1){j=e+1;continue;}if(e<0){j=src.length;break;}j++;continue;}if(src[j]==='[')depth++;if(src[j]===']'&&!--depth)break; // bracket counter corrected below
   if(src[j]!==']'){}j++;
  }
  if(j<src.length){let text=src.slice(open+1,j),d=null,end=j+1;
   if(src[end]==='('){let x=destination(src,end+1);if(x&&src[x.end]===')'){d=x;end=x.end+1;}}
   if(!d){let ref=/^\[((?:\\.|[^\[\]\\])*)\]/.exec(src.slice(end));let key=label(ref&&ref[1]?ref[1]:text);if(refs.has(key)){d=refs.get(key);if(ref)end+=ref[0].length;}}
   if(d&&(image||!nestedLink)&& (image||!text.includes('[')||!/<a data-md href=/.test(inline(text,Object.assign(new Map(refs),{rawLink:refs.rawLink}),false,true)))){let href=url(d.href);if(href!==null){let title=d.title==null?'':' title="'+escapeHTML(unescape(d.title))+'"';if(image){let alt=inline(text,refs,false).replace(/<img [^>]*alt="([^"]*)"[^>]*>/g,'$1').replace(/<[^>]*>/g,'');add('<img src="'+escapeHTML(href)+'" alt="'+alt+'"'+title+'>');}else add('<a'+(probe?' data-md':'')+' href="'+escapeHTML(href)+'"'+title+'>'+inline(text,refs,true)+'</a>');i=end;continue;}}
  }
 }
 if(!inLink&&!raw){
  if(hasAt&&(m=/^(mailto:|xmpp:)([a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+)(?![\w-])/i.exec(tail))){let t=m[0];if(m[1].toLowerCase()==='xmpp:'){let r=/^\/[a-z\d@.]+/i.exec(src.slice(i+t.length));if(r)t+=r[0];}if(!/[-_]/.test(src[i+t.length]??'')){add('<a href="'+escapeHTML(t)+'">'+escapeHTML(t)+'</a>');i+=t.length;continue;}}

  m=/^(?:(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)[^\s<]+/.exec(tail);
  if(m){let t=m[0];let opens=[...t.matchAll(/\(/g)];if(opens.length>1)t=t.slice(0,opens[1].index);else if(opens.length===1&&!t.slice(opens[0].index).includes(')'))t=t.slice(0,opens[0].index);t=t.replace(/&(?:[a-z\d]+);$/i,'');let old;do{old=t;while(/[?!.,:;*_~]$/.test(t))t=t.slice(0,-1);while(t.endsWith(')')&&(t.slice(Math.max(0,t.indexOf('('))).match(/\)/g)||[]).length>(t.match(/\(/g)||[]).length)t=t.slice(0,-1);}while(old!==t);t=t.replace(/&(?:[a-z\d]+);$/i,'');if(t){let h=url(/^www\./i.test(t)?'http://'+t:t);add('<a href="'+escapeHTML(h??t)+'">'+escapeHTML(t)+'</a>');i+=t.length;continue;}}
  if(hasAt&&(i===0||!/[\w.+-]/.test(src[i-1]))&&(m=/^[a-z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+/i.exec(tail))&&!(src[i+m[0].length]==='-'||src[i+m[0].length]==='_'&&!delims.some(d=>d.c==='_'&&d.open&&d.n))){let t=m[0];add('<a href="mailto:'+escapeHTML(t)+'">'+escapeHTML(t)+'</a>');i+=t.length;continue;}
 }
 if(!raw&&!masked[i]&&(c==='*'||c==='_'||c==='~')){let n=1;while(src[i+n]===c)n++;if(c==='~'&&n>2){add(c.repeat(n),true);i+=n;continue;}
  let before=i?src[i-1]:'\n',after=src[i+n]??'\n',bw=/\s/.test(before),aw=/\s/.test(after),bp=punctuation.test(before),ap=punctuation.test(after);
  let left=!aw&&(!ap||bw||bp),right=!bw&&(!bp||aw||ap);
  let canOpen=c==='_'?left&&(!right||bp):left,canClose=c==='_'?right&&(!left||ap):right;
  let node={text:c.repeat(n),plain:true};nodes.push(node);delims.push({node,c,n,open:canOpen,close:canClose,index:nodes.length-1});i+=n;continue;
 }
 if(c==='\n'){let last=nodes.at(-1),hard=last&&/ {2,}$/.test(last.text);if(hard){last.text=last.text.replace(/ +$/,'');add('<br>');}else{add('\n',true);}i++;if(hard)while(src[i]===' ')i++;continue;}
 if(c==='&'&&(m=/^&#(?:x[\da-f]{1,6}|\d{1,7});/i.exec(tail))){add(escapeHTML(numeric(m[0])),true);i+=m[0].length;continue;}
 // Plain spans stop at inline syntax; preserving entity spellings is deliberate.
 plainStop.lastIndex=i+1;let stop=plainStop.exec(src);let j=stop?stop.index:src.length;
 if(!inLink){while(autoIndex<autoStarts.length&&autoStarts[autoIndex]<=i)autoIndex++;if(autoIndex<autoStarts.length&&autoStarts[autoIndex]<j)j=autoStarts[autoIndex];}
 if(c==='&'){m=/^&[a-z][a-z\d]*;/i.exec(tail);if(m){add(m[0],true);i+=m[0].length;continue;}}
 add(raw?src.slice(i,j):escapeHTML(src.slice(i,j)),true);i=j;
 }
 // Match from each opening run, tracking intervening delimiter balance.
 function resolve(lo,hi){
  for(let oi=lo;oi<=hi;oi++){
   let op=delims[oi];if(!op.open||!op.n)continue;
   let total=op.n,middle=0,matched=false;
   for(let ci=oi+1;ci<=hi;ci++){
    let close=delims[ci];if(close.c!==op.c&&close.open){let end=ci+1;while(end<=hi&&!(delims[end].c===close.c&&delims[end].close&&delims[end].n>=close.n))end++;if(end<=hi&&!delims.slice(ci+1,end).some(x=>x.c===op.c&&x.close)){ci=end;continue;}}if(close.c!==op.c||!close.n)continue;
    if(op.c==='~'&&close.n!==op.n)continue;
    if(close.open&&!close.close){total+=close.n;continue;}
    if(!close.close)continue;
    if(op.c==='~'&&close.n!==op.n)continue;
    if(op.c!=='~'&&close.open&&op.n%3&&(op.n+close.n)%3===0){middle+=close.n;continue;}
    total-=close.n;if(total>0)continue;
    let right=Math.min(close.n,close.n+total+middle);
    let n=op.c==='~'?op.n:Math.min(op.n,right)%2?1:2;
    let tag=op.c==='~'?'del':n===2?'strong':'em';
    op.n-=n;close.n-=n;
    op.node.suffix=(op.node.suffix??'')+'<'+tag+'>';
    close.node.prefix='</'+tag+'>'+(close.node.prefix??'');
    let remain=close.n;close.n=right-n;
    resolve(oi,ci);
    let consumed=right-n-close.n;
    if(middle&&close.n){close.node.prefix=op.c.repeat(close.n)+(close.node.prefix??'');remain-=close.n;}
    close.n=remain-consumed;
    matched=true;oi=ci-1;break;
   }
   if(!matched&&op.n>1&&op.c!=='~'){op.n--;op.literal=(op.literal??0)+1;oi--;}
  }
 }
 resolve(0,delims.length-1);
 for(const d of delims)d.node.text=(d.node.prefix??'')+d.c.repeat(d.n+(d.literal??0))+(d.node.suffix??'');
 return nodes.map(n=>n.text).join('');
}
function render(tokens,refs,tight=false){let html='';for(const t of tokens){switch(t.type){
 case 'paragraph':html+=(tight?'':'<p>')+inline(t.text,refs)+(tight?'':'</p>\n');break;
 case 'heading':html+='<h'+t.depth+'>'+inline(t.text,refs)+'</h'+t.depth+'>\n';break;
 case 'hr':html+='<hr>\n';break;
 case 'html':html+=t.text;break;
 case 'code':html+='<pre><code'+(t.lang?' class="language-'+escapeHTML(t.lang)+'"':'')+'>'+escapeHTML(t.text||t.nonempty?t.text+'\n':'',true)+'</code></pre>\n';break;
 case 'quote':html+='<blockquote>\n'+render(t.children,refs)+'</blockquote>\n';break;
 case 'list':{let tag=t.ordered?'ol':'ul';html+='<'+tag+(t.ordered&&t.start!==1?' start="'+t.start+'"':'')+'>\n';for(const item of t.items){let content=render(item.children,refs,!t.loose);if(item.task!==null){let box='<input '+(item.task?'checked="" ':'')+'disabled="" type="checkbox"> ';content=t.loose&&content.startsWith('<p>')?'<p>'+box+content.slice(3):box+content;}html+='<li>'+content+'</li>\n';}html+='</'+tag+'>\n';break;}
 case 'table':{html+='<table>\n<thead>\n<tr>\n';const row=(r,tag)=>t.head.map((_,j)=>'<'+tag+(t.align[j]?' align="'+t.align[j]+'"':'')+'>'+inline(r[j]??'',refs)+'</'+tag+'>\n').join('');html+=row(t.head,'th')+'</tr>\n</thead>\n';if(t.rows.length)html+='<tbody>'+t.rows.map(r=>'<tr>\n'+row(r,'td')+'</tr>\n').join('')+'</tbody>';html+='</table>\n';break;}
 }}return html;}
export function parse(markdown){const refs=new Map();let source=markdown.replace(/\r\n?/g,'\n');let lines=source.split('\n');lines.finalNewline=source.endsWith('\n');if(lines.finalNewline)lines.pop();let tokens=blocks(lines,refs);return render(tokens,refs);}
