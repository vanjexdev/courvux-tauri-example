(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const u of document.querySelectorAll('link[rel="modulepreload"]'))v(u);new MutationObserver(u=>{for(const y of u)if(y.type==="childList")for(const n of y.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&v(n)}).observe(document,{childList:!0,subtree:!0});function r(u){const y={};return u.integrity&&(y.integrity=u.integrity),u.referrerPolicy&&(y.referrerPolicy=u.referrerPolicy),u.crossOrigin==="use-credentials"?y.credentials="include":u.crossOrigin==="anonymous"?y.credentials="omit":y.credentials="same-origin",y}function v(u){if(u.ep)return;u.ep=!0;const y=r(u);fetch(u.href,y)}})();var Qe=new Set(["push","pop","shift","unshift","splice","sort","reverse"]),Be=e=>e instanceof Date||e instanceof RegExp||e instanceof Map||e instanceof Set||e instanceof WeakMap||e instanceof WeakSet||ArrayBuffer.isView(e)||e instanceof ArrayBuffer,ge=new WeakSet,le=Symbol("raw"),he=e=>e===null||typeof e!="object"?e:e[le]??e,oe=0,ye=new Map,ee=null;function $e(e){const t=[],r=ee;ee=t;try{e()}finally{ee=r}return t}function et(e){oe++;try{e()}finally{if(oe--,oe===0){const t=[...ye.values()];ye.clear(),t.forEach(r=>r())}}}function Ve(e,t){return e===null||typeof e!="object"||ge.has(e)||Be(e)?e:new Proxy(e,{get(r,v){if(v===le)return r[le]??r;if(typeof v=="string"&&Array.isArray(r)&&Qe.has(v))return(...y)=>{const n=Array.prototype[v].apply(r,y);return t(),n};const u=r[v];return u!==null&&typeof u=="object"&&!ge.has(u)?Ve(u,t):u},set(r,v,u){return r[v]=u,t(),!0}})}function xe(){const e={},t=Math.random().toString(36).slice(2),r=(y,n)=>(e[y]||(e[y]=new Set),e[y].add(n),()=>{e[y]?.delete(n)}),v=y=>{oe>0?ye.set(`${t}:${y}`,()=>{(e[y]?[...e[y]]:[]).forEach(n=>n())}):(e[y]?[...e[y]]:[]).forEach(n=>n())},u={};return{subscribe:r,createReactiveState:y=>new Proxy(y,{get(n,w){if(w===le)return y;typeof w=="string"&&!w.startsWith("$")&&ee&&ee.push({sub:r,key:w});const O=n[w];return typeof w=="string"&&!w.startsWith("$")&&O!==null&&typeof O=="object"&&!ge.has(O)&&!Be(O)?Ve(O,()=>v(w)):O},set(n,w,O){if(u[w])return u[w](O),!0;const M=n[w];return n[w]=O,(M!==O||O!==null&&typeof O=="object")&&v(w),!0}}),registerSetInterceptor:(y,n)=>{u[y]=n},notifyAll:()=>{Object.keys(e).forEach(y=>v(y))}}}var ve=new WeakMap;function te(e,t,r){const v=t.indexOf(".");if(v>=0){const u=t.slice(0,v),y=t.slice(v+1),n=e[u];return n&&ve.has(n)?te(n,y,r):ve.get(e)?.(u,r)??(()=>{})}return ve.get(e)?.(t,r)??(()=>{})}var Ue=(e,t)=>e.split(".").reduce((r,v)=>r?.[v],t),Se=!1,ne=!1,Ae=()=>{if(Se)return ne;Se=!0;try{new Function("return 1")(),ne=!0}catch{console.warn("[courvux] CSP blocks eval. Falling back to a limited evaluator that handles property access and literals only. Add `vite-plugin-courvux-precompile` to your build for full template support under strict CSP."),ne=!1}return ne},Ce=new Map,ze=new Map,K=new WeakMap,tt=(e,t)=>{const r=K.get(e);r?Object.assign(r,t):K.set(e,{...t})},ie=(e,t)=>{const r=K.get(t);r&&K.set(e,r)},Ye=(e,t)=>{const r=e.trim();if(r==="true")return!0;if(r==="false")return!1;if(r==="null")return null;if(r!=="undefined")return/^-?\d+(\.\d+)?$/.test(r)?parseFloat(r):/^(['"`])(.*)\1$/s.test(r)?r.slice(1,-1):r.startsWith("!")?!Ye(r.slice(1).trim(),t):Ue(r,t)},j=(e,t)=>{const r=K.get(t)?.[e];if(r)try{return r(t)}catch{}if(!Ae())return Ye(e,t);try{let v=Ce.get(e);return v||(v=new Function("$data",`with($data) { return (${e}) }`),Ce.set(e,v)),v(t)}catch{return Ue(e,t)}},Ge=(e,t,r)=>e.startsWith("$store.")&&t.store?t.storeSubscribeOverride?t.storeSubscribeOverride(t.store,e.slice(7),r):te(t.store,e.slice(7),r):t.subscribe(e,r),P=(e,t,r)=>{const v=new Set(["true","false","null","undefined","in","of","typeof","instanceof"]),u=e.match(/\$?[a-zA-Z_][\w$]*(?:\.\$?[a-zA-Z_][\w$]*)*/g)??[],y=[...new Set(u.map(w=>w.startsWith("$store.")?w:w.split(".")[0]).filter(w=>!v.has(w)))];if(y.length===0)return()=>{};const n=y.map(w=>Ge(w,t,r));return()=>n.forEach(w=>w())},Oe=new Map,nt=e=>{const t=Oe.get(e);if(t)return t;const r=e.trim();let v=0,u=-1,y=null;for(let w=0;w<r.length;w++){const O=r[w];O==="["?(v===0&&(u=w,y="bracket"),v++):O==="]"?v--:O==="."&&v===0&&(u=w,y="dot")}let n;if(u<0)n={parent:"",keyExpr:JSON.stringify(r)};else if(y==="dot")n={parent:r.slice(0,u),keyExpr:JSON.stringify(r.slice(u+1))};else{const w=r.lastIndexOf("]");n=w>u?{parent:r.slice(0,u),keyExpr:r.slice(u+1,w)}:{parent:"",keyExpr:JSON.stringify(r)}}return Oe.set(e,n),n},X=(e,t,r)=>{if(Ae())try{const{parent:u,keyExpr:y}=nt(e),n=u?j(u,t):t,w=j(y,t);if(n==null)return;n[w]=r;return}catch(u){console.warn(`[courvux] setStateValue: write failed for "${e}":`,u);return}const v=e.split(".");if(v.length===1)t[v[0]]=r;else{const u=v.slice(0,-1).reduce((y,n)=>y?.[n],t);u&&(u[v[v.length-1]]=r)}},je=(e,t,r,v,u)=>{const y={};return Object.keys(e).forEach(n=>y[n]=e[n]),y[r]=t,u&&(y[u]=v),ie(y,e),y},we=e=>e?typeof e=="string"?e:Array.isArray(e)?e.map(we).filter(Boolean).join(" "):typeof e=="object"?Object.entries(e).filter(([,t])=>!!t).map(([t])=>t).join(" "):"":"",Te=(e,t,r)=>{if(!t){e.style.cssText=r;return}typeof t=="string"?e.style.cssText=r?`${r};${t}`:t:typeof t=="object"&&(r&&(e.style.cssText=r),Object.entries(t).forEach(([v,u])=>{e.style[v]=u??""}))},Me=(e,t,r)=>{const v=K.get(t)?.[e];if(v)try{v(new Proxy(t,{get(u,y){return y==="$event"?r:u[y]},set(u,y,n){return u[y]=n,!0},has(u,y){return!0}}));return}catch(u){console.warn(`[courvux] handler error "${e}":`,u);return}if(Ae())try{let u=ze.get(e);u||(u=new Function("__p__",`with(__p__){${e}}`),ze.set(e,u));const y=new Proxy({},{has:()=>!0,get:(n,w)=>w==="$event"?r:w in t?t[w]:globalThis[w],set:(n,w,O)=>(t[w]=O,!0)});u(y)}catch(u){console.warn(`[courvux] handler error "${e}":`,u)}},U=e=>{const t=getComputedStyle(e),r=Math.max(parseFloat(t.animationDuration)||0,parseFloat(t.transitionDuration)||0)*1e3;return r<=0?Promise.resolve():new Promise(v=>{const u=()=>v();e.addEventListener("animationend",u,{once:!0}),e.addEventListener("transitionend",u,{once:!0}),setTimeout(u,r+50)})},rt=`
.cv-t-wrap{overflow:hidden}
.fade-enter{animation:cvt-fade-in 0.25s forwards}
.fade-leave{animation:cvt-fade-out 0.25s forwards}
.slide-down-enter{animation:cvt-slide-down-in 0.25s forwards}
.slide-down-leave{animation:cvt-slide-down-out 0.25s forwards}
.slide-up-enter{animation:cvt-slide-up-in 0.2s forwards}
.slide-up-leave{animation:cvt-slide-up-out 0.2s forwards}
@keyframes cvt-fade-in{from{opacity:0}to{opacity:1}}
@keyframes cvt-fade-out{from{opacity:1}to{opacity:0}}
@keyframes cvt-slide-down-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes cvt-slide-down-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-8px)}}
@keyframes cvt-slide-up-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes cvt-slide-up-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(6px)}}
`,Ne=!1;function We(){if(Ne||typeof document>"u")return;Ne=!0;const e=document.createElement("style");e.id="cv-transitions-el",e.textContent=rt,document.head.appendChild(e)}var _e=!1;function at(){if(_e||typeof document>"u")return;_e=!0;const e=document.createElement("style");e.id="cv-cloak-style",e.textContent="[cv-cloak]{display:none!important}",document.head.appendChild(e)}function st(e){if(typeof window<"u"&&"Sanitizer"in window){const r=document.createElement("div");return r.setHTML(e,{sanitizer:new window.Sanitizer}),r.innerHTML}const t=new DOMParser().parseFromString(e,"text/html");return t.querySelectorAll("script,iframe,object,embed,form,meta,link,style").forEach(r=>r.remove()),t.querySelectorAll("*").forEach(r=>{Array.from(r.attributes).forEach(v=>{(v.name.startsWith("on")||v.value.trim().toLowerCase().startsWith("javascript:"))&&r.removeAttribute(v.name)})}),t.body.innerHTML}async function I(e,t,r){const v=Array.from(e.childNodes);let u=0;for(;u<v.length;){const y=v[u];if(y.nodeType===3){const i=y.textContent||"",s=i.match(/\{\{([\s\S]+?)\}\}/g);if(s){const a=i,o=()=>{let c=a;s.forEach(m=>{const d=m.replace(/^\{\{\s*/,"").replace(/\s*\}\}$/,"");c=c.replace(m,j(d,t)??"")}),y.textContent=c};s.forEach(c=>{P(c.replace(/^\{\{\s*/,"").replace(/\s*\}\}$/,""),r,o)}),o()}u++;continue}if(y.nodeType!==1){u++;continue}const n=y,w=n.tagName.toLowerCase();if(n.hasAttribute("cv-pre")){n.removeAttribute("cv-pre"),u++;continue}if(n.hasAttribute("cv-once")){n.removeAttribute("cv-once"),await I(n,t,{...r,subscribe:()=>()=>{},storeSubscribeOverride:()=>()=>{}}),u++;continue}if(n.hasAttribute("cv-cloak")&&n.removeAttribute("cv-cloak"),n.hasAttribute("cv-teleport")){const i=n.getAttribute("cv-teleport");n.removeAttribute("cv-teleport");const s=document.querySelector(i)??document.body,a=document.createComment(`cv-teleport: ${i}`);n.replaceWith(a),await I(n,t,r),s.appendChild(n),u++;continue}if(n.hasAttribute("cv-memo")){const i=n.getAttribute("cv-memo");n.removeAttribute("cv-memo");const s=()=>i.split(",").map(d=>j(d.trim(),t));let a=s();const o=[],c=d=>(o.push(d),()=>{const p=o.indexOf(d);p>-1&&o.splice(p,1)});await I(n,t,{...r,subscribe:(d,p)=>c(p),storeSubscribeOverride:(d,p,b)=>c(b)});const m=P(i,r,()=>{const d=s();d.some((p,b)=>p!==a[b])&&(a=d,[...o].forEach(p=>p()))});r.registerCleanup?.(()=>m()),u++;continue}if(n.hasAttribute("cv-data")){const i=n.getAttribute("cv-data").trim();n.removeAttribute("cv-data");let s={},a={};if(i.startsWith("{")){const o=j(i,t)??{};Object.entries(o).forEach(([c,m])=>{typeof m=="function"?a[c]=m:s[c]=m})}else if(i){const o=r.components?.[i];if(o){const c=typeof o.data=="function"?o.data():o.data??{};c instanceof Promise||Object.assign(s,c),Object.assign(a,o.methods??{})}}if(r.createChildScope){const o=r.createChildScope(s,a);r.registerCleanup?.(o.cleanup),ie(o.state,t),await I(n,o.state,{...r,subscribe:o.subscribe})}else{const o={...t,...s,...a};ie(o,t),await I(n,o,r)}u++;continue}if(n.hasAttribute("cv-for")){const i=n.getAttribute("cv-for");n.removeAttribute("cv-for");const s=i.match(/^\(?(\w+)(?:,\s*(\w+))?\)?\s+in\s+(.+)$/);if(s){const[,a,o,c]=s,m=n.getAttribute(":key")??null;m&&n.removeAttribute(":key");const d=n.getAttribute("cv-transition")??null;d&&n.removeAttribute("cv-transition");const p=document.createComment(`cv-for: ${c}`);n.replaceWith(p);let b=[],g=[];const l=new Map;let f=!1,$=!1;const h=async()=>{const k=j(c,t),S=k?typeof k=="number"?Array.from({length:k},(C,A)=>[A+1,A]):Array.isArray(k)?k.map((C,A)=>[C,A]):Object.entries(k).map(([C,A])=>[A,C]):[];if(m){const C=[],A=new Map,x=new Set;for(const[N,W]of S){const T=j(m,je(t,N,a,W,o));x.has(T)&&console.warn(`[courvux] cv-for: duplicate :key "${T}" in "${c}"`),x.add(T),C.push(T),A.set(T,[N,W])}const z=[];for(const[N,{el:W,destroy:T}]of l)A.has(N)||(d?(W.classList.add(`${d}-leave`),z.push(U(W).then(()=>{W.classList.remove(`${d}-leave`),T(),W.parentNode?.removeChild(W),l.delete(N)}))):(T(),W.parentNode?.removeChild(W),l.delete(N)));z.length&&await Promise.all(z);const _=p.parentNode,H=[];for(const N of C){const[W,T]=A.get(N);if(l.has(N)){const q=l.get(N);q.itemRef!==W&&(q.reactive[a]=W,q.itemRef=W),o&&(q.reactive[o]=T)}else{const q=n.cloneNode(!0),Z=[],{subscribe:ue,createReactiveState:Ke}=xe(),pe=Ke({[a]:W,...o?{[o]:T}:{}}),Le=new Proxy({},{has(Y,F){return!0},get(Y,F){return typeof F!="string"?t[F]:F===a||o&&F===o?pe[F]:t[F]},set(Y,F,G){return F===a||o&&F===o?(pe[F]=G,!0):(t[F]=G,!0)}});ie(Le,t);const Ze={...r,subscribe:(Y,F)=>{const G=Y.split(".")[0];let J;return G===a||o&&G===o?J=ue(G,F):J=r.subscribe(Y,F),Z.push(J),J},storeSubscribeOverride:(Y,F,G)=>{const J=te(Y,F,G);return Z.push(J),J}},fe=document.createDocumentFragment();fe.appendChild(q),await I(fe,Le,Ze);const me=fe.firstChild??q;d&&me.classList.add(`${d}-enter`),l.set(N,{el:me,reactive:pe,itemRef:W,destroy:()=>Z.forEach(Y=>Y())}),d&&H.push(me)}}let D=p.nextSibling,R=0;for(const N of C){const{el:W}=l.get(N);W!==D?R++:D=W.nextSibling}if(R>0)if(R>C.length>>1){const N=document.createDocumentFragment();for(const W of C)N.appendChild(l.get(W).el);_.insertBefore(N,p.nextSibling)}else{D=p.nextSibling;for(const N of C){const{el:W}=l.get(N);W!==D?_.insertBefore(W,D):D=W.nextSibling}}b=C.map(N=>l.get(N).el),H.length&&Promise.all(H.map(N=>U(N).then(()=>N.classList.remove(`${d}-enter`))))}else{if(g.forEach(z=>z()),g=[],b.forEach(z=>z.parentNode?.removeChild(z)),b=[],!S.length)return;const C=p.parentNode,A=p.nextSibling,x={...r,subscribe:(z,_)=>{const H=r.subscribe(z,_);return g.push(H),H},storeSubscribeOverride:(z,_,H)=>{const D=te(z,_,H);return g.push(D),D}};for(const[z,_]of S){const H=n.cloneNode(!0),D=document.createDocumentFragment();D.appendChild(H),await I(D,je(t,z,a,_,o),x);const R=D.firstChild??H;C.insertBefore(D,A),b.push(R)}}},E=async()=>{if(f){$=!0;return}f=!0;try{for(await h();$;)$=!1,await h()}finally{f=!1}};r.registerCleanup?.(()=>{l.forEach(({el:k,destroy:S})=>{S(),k.parentNode?.removeChild(k)}),l.clear(),g.forEach(k=>k()),b.forEach(k=>k.parentNode?.removeChild(k)),b=[]}),P(c,r,E),await E()}u++;continue}if(n.hasAttribute("cv-if")){const i=[],s=n.getAttribute("cv-if");n.removeAttribute("cv-if");const a=document.createComment("cv-if");n.replaceWith(a),i.push({condition:s,template:n,anchor:a});let o=u+1;for(;o<v.length;){const g=v[o];if(g.nodeType===3&&(g.textContent?.trim()??"")===""){o++;continue}if(g.nodeType!==1)break;const l=g;if(l.hasAttribute("cv-else-if")){const f=l.getAttribute("cv-else-if");l.removeAttribute("cv-else-if");const $=document.createComment("cv-else-if");l.replaceWith($),i.push({condition:f,template:l,anchor:$}),o++;continue}if(l.hasAttribute("cv-else")){l.removeAttribute("cv-else");const f=document.createComment("cv-else");l.replaceWith(f),i.push({condition:null,template:l,anchor:f}),o++;break}break}u=o;let c=null,m=-1,d=!1,p=!1;const b=async()=>{if(d){p=!0;return}d=!0;try{do{p=!1;let g=-1;for(let E=0;E<i.length;E++){const k=i[E];if(k.condition===null||j(k.condition,t)){g=E;break}}if(g===m&&c||(c&&(c.parentNode?.removeChild(c),c=null),m=g,g<0))continue;const l=i[g],f=l.template.cloneNode(!0),$=document.createDocumentFragment();$.appendChild(f),await I($,t,r);const h=$.firstChild??f;l.anchor.parentNode?.insertBefore($,l.anchor.nextSibling),c=h}while(p)}finally{d=!1}};i.filter(g=>g.condition).forEach(g=>{P(g.condition,r,b)}),await b();continue}if(n.hasAttribute("cv-show")){const i=n.getAttribute("cv-show");n.removeAttribute("cv-show");const s=Array.from(n.attributes).filter(a=>a.name==="cv-transition"||a.name.startsWith("cv-transition:")||a.name.startsWith("cv-transition."));if(s.length>0){const a=h=>(n.getAttribute(h)??"").split(" ").filter(Boolean),o=a("cv-transition:enter"),c=a("cv-transition:enter-start"),m=a("cv-transition:enter-end"),d=a("cv-transition:leave"),p=a("cv-transition:leave-start"),b=a("cv-transition:leave-end"),g=n.getAttribute("cv-transition")??"",l=new Set(g.split(".").slice(1)),f=[...l].find(h=>/^\d+$/.test(h)),$=f?parseInt(f):200;if(o.length||c.length||d.length||p.length){s.forEach(A=>n.removeAttribute(A.name));const h=()=>new Promise(A=>requestAnimationFrame(()=>requestAnimationFrame(()=>A())));let E=!!j(i,t),k=!1,S=null;const C=async A=>{if(k){S=A;return}k=!0;try{A?(n.style.display="",n.classList.add(...o,...c),await h(),n.classList.remove(...c),n.classList.add(...m),await U(n),n.classList.remove(...o,...m)):(n.classList.add(...d,...p),await h(),n.classList.remove(...p),n.classList.add(...b),await U(n),n.classList.remove(...d,...b),n.style.display="none"),E=A}finally{if(k=!1,S!==null&&S!==E){const x=S;S=null,C(x)}else S=null}};E||(n.style.display="none"),P(i,r,()=>{const A=!!j(i,t);A!==E&&C(A)})}else{const h=[...l].find(x=>x==="scale"||/^scale$/.test(x)),E=(()=>{const x=[...l].find(z=>/^\d+$/.test(z)&&z!==f);return x?parseInt(x)/100:.9})(),k=[];(!l.has("scale")||l.has("opacity"))&&k.push(`opacity ${$}ms ease`),h&&k.push(`transform ${$}ms ease`),k.length||k.push(`opacity ${$}ms ease`),n.style.transition=(n.style.transition?n.style.transition+", ":"")+k.join(", "),s.forEach(x=>n.removeAttribute(x.name));let S=!!j(i,t);const C=()=>new Promise(x=>requestAnimationFrame(()=>requestAnimationFrame(()=>x()))),A=async x=>{x?(n.style.display="",n.style.opacity="0",h&&(n.style.transform=`scale(${E})`),await C(),n.style.opacity="",h&&(n.style.transform=""),await U(n)):(n.style.opacity="0",h&&(n.style.transform=`scale(${E})`),await U(n),n.style.display="none",n.style.opacity="",h&&(n.style.transform="")),S=x};S||(n.style.display="none"),P(i,r,()=>{const x=!!j(i,t);x!==S&&A(x)})}}else{const a=n.getAttribute("cv-show-transition"),o=n.getAttribute(":transition");a&&n.removeAttribute("cv-show-transition"),o&&n.removeAttribute(":transition");const c=a??(o?String(j(o,t)):null);if(c){We();let m=!!j(i,t);m||(n.style.display="none");let d=!1,p=null;const b=async g=>{if(d){p=g;return}d=!0;try{g?(n.style.display="",n.classList.add(`${c}-enter`),await U(n),n.classList.remove(`${c}-enter`)):(n.classList.add(`${c}-leave`),await U(n),n.classList.remove(`${c}-leave`),n.style.display="none"),m=g}finally{if(d=!1,p!==null&&p!==m){const l=p;p=null,b(l)}else p=null}};P(i,r,()=>{const g=!!j(i,t);g!==m&&b(g)})}else{const m=()=>{n.style.display=j(i,t)?"":"none"};P(i,r,m),m()}}}if(n.hasAttribute("cv-focus")){const i=n.getAttribute("cv-focus")??"";if(n.removeAttribute("cv-focus"),!i)Promise.resolve().then(()=>n.focus());else{const s=()=>{j(i,t)&&Promise.resolve().then(()=>n.focus())};P(i,r,s),s()}}{const i=Array.from(n.attributes).filter(s=>s.name==="cv-intersect"||s.name.startsWith("cv-intersect:")||s.name.startsWith("cv-intersect."));if(i.length&&typeof IntersectionObserver<"u"){const s=i.find(h=>h.name==="cv-intersect"||h.name==="cv-intersect:enter"||h.name.startsWith("cv-intersect.")),a=i.find(h=>h.name==="cv-intersect:leave"),o=s?.value??"",c=a?.value??"",m=(s?.name??"cv-intersect").split("."),d=new Set(m.slice(1)),p=d.has("once");let b=0;if(d.has("half"))b=.5;else if(d.has("full"))b=1;else{const h=[...d].find(E=>E.startsWith("threshold-"));h&&(b=parseInt(h.replace("threshold-",""))/100)}const g=[...d].find(h=>h.startsWith("margin-")),l=g?`${g.replace("margin-","")}px`:void 0;i.forEach(h=>n.removeAttribute(h.name));const f=h=>{if(h)try{new Function("$data",`with($data){${h}}`)(t)}catch(E){console.warn(`[courvux] cv-intersect error "${h}":`,E)}},$=new IntersectionObserver(h=>{h.forEach(E=>{E.isIntersecting?(f(o),p&&$.disconnect()):f(c)})},{threshold:b,...l?{rootMargin:l}:{}});$.observe(n),r.registerCleanup?.(()=>$.disconnect())}}{const i=Array.from(n.attributes).find(s=>s.name==="cv-html"||s.name.startsWith("cv-html."));if(i){const s=i.value;n.removeAttribute(i.name);const a=!i.name.split(".").slice(1).includes("raw"),o=()=>{const c=String(j(s,t)??"");n.innerHTML=a?st(c):c};P(s,r,o),o(),u++;continue}}if(n.hasAttribute("cv-ref")&&!r.components?.[w]){const i=n.getAttribute("cv-ref");n.removeAttribute("cv-ref"),r.refs&&(r.refs[i]=n)}const O=!!r.components?.[w],M=Array.from(n.attributes).find(i=>i.name==="cv-model"||i.name.startsWith("cv-model."));if(M&&!O){const i=M.value;n.removeAttribute(M.name);const s=new Set(M.name.split(".").slice(1)),a=n,o=a.type?.toLowerCase(),c=m=>{if(s.has("number")){const d=parseFloat(m);return isNaN(d)?m:d}return s.has("trim")?m.trim():m};if(o==="checkbox"){const m=()=>{const d=j(i,t);a.checked=Array.isArray(d)?d.includes(a.value):!!d};P(i,r,m),m(),a.addEventListener("change",()=>{const d=j(i,t);if(Array.isArray(d)){const p=[...d];if(a.checked)p.includes(a.value)||p.push(a.value);else{const b=p.indexOf(a.value);b>-1&&p.splice(b,1)}X(i,t,p)}else X(i,t,a.checked)})}else if(o==="radio"){const m=()=>{a.checked=j(i,t)===a.value};P(i,r,m),m(),a.addEventListener("change",()=>{a.checked&&X(i,t,c(a.value))})}else if(n.hasAttribute("contenteditable")){const m=n,d=()=>{const p=String(j(i,t)??"");m.innerText!==p&&(m.innerText=p)};if(P(i,r,d),d(),s.has("debounce")){const p=[...s].find(l=>/^\d+$/.test(l)),b=p?parseInt(p):300;let g;m.addEventListener("input",()=>{clearTimeout(g),g=setTimeout(()=>X(i,t,c(m.innerText)),b)})}else{const p=s.has("lazy")?"blur":"input";m.addEventListener(p,()=>X(i,t,c(m.innerText)))}}else{const m=()=>{a.value=j(i,t)??""};if(P(i,r,m),m(),s.has("debounce")){const d=[...s].find(g=>/^\d+$/.test(g)),p=d?parseInt(d):300;let b;a.addEventListener("input",()=>{clearTimeout(b),b=setTimeout(()=>X(i,t,c(a.value)),p)})}else{const d=w==="select"||s.has("lazy")?"change":"input";a.addEventListener(d,()=>X(i,t,c(a.value)))}}}if(r.directives&&Array.from(n.attributes).forEach(i=>{if(!i.name.startsWith("cv-"))return;const s=i.name.slice(3).split("."),a=s[0],o=s.slice(1),c=a.indexOf(":"),m=c>=0?a.slice(0,c):a,d=c>=0?a.slice(c+1):void 0,p=r.directives[m];if(!p)return;const b=i.value;n.removeAttribute(i.name);const g=typeof p=="function"?{onMount:p}:p,l={value:b?j(b,t):void 0,arg:d,modifiers:Object.fromEntries(o.map(f=>[f,!0]))};g.onMount?.(n,l),g.onUpdate&&b&&P(b,r,()=>{l.value=j(b,t),g.onUpdate(n,l)}),g.onDestroy&&r.registerCleanup?.(()=>g.onDestroy(n,l))}),w==="slot"){const i=n.getAttribute("name")??"default",s=r.slots?.[i];if(s){const a={};Array.from(n.attributes).forEach(m=>{m.name.startsWith(":")&&(a[m.name.slice(1)]=j(m.value,t))});const o=await s(a),c=document.createDocumentFragment();o.forEach(m=>c.appendChild(m)),n.replaceWith(c)}else{const a=document.createDocumentFragment();for(;n.firstChild;)a.appendChild(n.firstChild);await I(a,t,r),n.replaceWith(a)}u++;continue}if(w==="cv-transition"){We();const i=n.getAttribute("name")??"fade",s=n.getAttribute(":show")??null;n.removeAttribute("name"),s&&n.removeAttribute(":show");const a=document.createElement("div");for(a.className="cv-t-wrap";n.firstChild;)a.appendChild(n.firstChild);if(n.replaceWith(a),await I(a,t,r),s){let o=!!j(s,t),c=!1,m=null;o||(a.style.display="none");const d=async p=>{if(c){m=p;return}c=!0;try{p?(a.style.display="",a.classList.add(`${i}-enter`),await U(a),a.classList.remove(`${i}-enter`)):(a.classList.add(`${i}-leave`),await U(a),a.classList.remove(`${i}-leave`),a.style.display="none"),o=p}finally{if(c=!1,m!==null&&m!==o){const b=m;m=null,d(b)}else m=null}};P(s,r,()=>{const p=!!j(s,t);p!==o&&d(p)})}u++;continue}if(w==="router-view"&&r.mountRouterView){const i=n.getAttribute("name")??void 0;n.setAttribute("aria-live","polite"),n.setAttribute("aria-atomic","true"),await r.mountRouterView(n,i),u++;continue}if(w==="router-link"){const i=n.getAttribute(":to"),s=n.getAttribute("to"),a=()=>i?String(j(i,t)??"/"):s||"/",o=h=>String(h).replace(/[&"<>]/g,E=>({"&":"&amp;",'"':"&quot;","<":"&lt;",">":"&gt;"})[E]);let c="";Array.from(n.attributes).forEach(h=>{h.name==="to"||h.name===":to"||(c+=` ${h.name}="${o(h.value)}"`)});const m=document.createElement("div");m.innerHTML=`<a${c}></a>`;const d=m.firstElementChild;for(;n.firstChild;)d.appendChild(n.firstChild);const p=r.router?.base??"",b=h=>p?h===p?"/":h.startsWith(p+"/")?h.slice(p.length)||"/":h||"/":h||"/",g=()=>r.router?.mode==="history"?b(window.location.pathname):window.location.hash.slice(1)||"/",l=()=>{const h=a(),E=g()===h;r.router?.mode==="history"?d.href=`${p}${h}`:d.href=`#${h}`,E?(d.setAttribute("aria-current","page"),d.classList.add("active")):(d.removeAttribute("aria-current"),d.classList.remove("active"))};r.router?.mode==="history"?(d.addEventListener("click",h=>{h.preventDefault(),r.router.navigate(a())}),window.addEventListener("popstate",l)):window.addEventListener("hashchange",l),i&&P(i,r,l),l();const f=document.createDocumentFragment();f.appendChild(d),await I(f,t,r);const $=f.firstChild??d;n.replaceWith($),u++;continue}if(w==="component"&&n.hasAttribute(":is")&&r.mountDynamic){const i=n.getAttribute(":is");n.removeAttribute(":is");const s=document.createComment("component:is");n.replaceWith(s),await r.mountDynamic(s,i,n,t,r),u++;continue}if(r.components?.[w]&&r.mountElement){await r.mountElement(n,w,t,r),u++;continue}{const i=Array.from(n.attributes).find(s=>s.name==="cv-intersect"||s.name.startsWith("cv-intersect."));if(i&&typeof IntersectionObserver<"u"){const s=new Set(i.name.split(".").slice(1));n.removeAttribute(i.name);const a=j(i.value,t);let o,c=0,m="0px",d=s.has("once");if(typeof a=="function"?o=p=>a.call(t,p):a&&typeof a=="object"&&(typeof a.handler=="function"&&(o=p=>a.handler.call(t,p)),a.threshold!==void 0&&(c=a.threshold),a.margin&&(m=a.margin),a.once&&(d=!0)),o){const p=new IntersectionObserver(b=>{const g=b[0];o(g),d&&g.isIntersecting&&p.disconnect()},{threshold:c,rootMargin:m});p.observe(n),r.registerCleanup?.(()=>p.disconnect())}}}if(n.hasAttribute("cv-resize")){const i=n.getAttribute("cv-resize");if(n.removeAttribute("cv-resize"),typeof ResizeObserver<"u"){const s=j(i,t);let a,o="content-box";if(typeof s=="function"?a=c=>s.call(t,c):s&&typeof s=="object"&&(typeof s.handler=="function"&&(a=c=>s.handler.call(t,c)),s.box&&(o=s.box)),a){const c=new ResizeObserver(m=>{m[0]&&a(m[0])});c.observe(n,{box:o}),r.registerCleanup?.(()=>c.disconnect())}}}if(n.hasAttribute("cv-scroll")){const i=n.getAttribute("cv-scroll");n.removeAttribute("cv-scroll");const s=j(i,t);let a,o=0;if(typeof s=="function"?a=c=>s.call(t,c):s&&typeof s=="object"&&(typeof s.handler=="function"&&(a=c=>s.handler.call(t,c)),s.throttle&&(o=s.throttle)),a){let c=0;const m=()=>{const d=Date.now();o>0&&d-c<o||(c=d,a({scrollTop:n.scrollTop,scrollLeft:n.scrollLeft,scrollHeight:n.scrollHeight,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,clientWidth:n.clientWidth}))};n.addEventListener("scroll",m,{passive:!0}),r.registerCleanup?.(()=>n.removeEventListener("scroll",m))}}if(n.hasAttribute("cv-clickoutside")){const i=n.getAttribute("cv-clickoutside");n.removeAttribute("cv-clickoutside");const s=a=>{n.contains(a.target)||(typeof t[i]=="function"?t[i].call(t,a):Me(i,t,a))};document.addEventListener("click",s,!0),r.registerCleanup?.(()=>document.removeEventListener("click",s,!0))}if(n.hasAttribute("cv-bind")){const i=n.getAttribute("cv-bind");n.removeAttribute("cv-bind");const s=n.getAttribute("class")??"",a=n.getAttribute("style")??"";let o=[];const c=()=>{const m=j(i,t)??{},d=Object.keys(m);for(const p of o)p in m||(p==="class"?n.className=s:p==="style"?n.style.cssText=a:n.removeAttribute(p));for(const[p,b]of Object.entries(m))if(p==="class")n.className=[s,we(b)].filter(Boolean).join(" ");else if(p==="style")Te(n,b,a);else if(b==null||b===!1)try{n.removeAttribute(p)}catch{}else try{n.setAttribute(p,b===!0?"":String(b))}catch(g){console.warn(`[courvux] cv-bind: skipping invalid attribute name "${p}":`,g)}o=d};P(i,r,c),c()}const L={enter:"Enter",esc:"Escape",escape:"Escape",space:" ",tab:"Tab",delete:"Delete",backspace:"Backspace",up:"ArrowUp",down:"ArrowDown",left:"ArrowLeft",right:"ArrowRight"};Array.from(n.attributes).forEach(i=>{if(i.name.startsWith("@")||i.name.startsWith("cv:on:")){const s=(i.name.startsWith("@")?i.name.substring(1):i.name.substring(6)).split("."),a=s[0],o=new Set(s.slice(1)),c=[...o].find(b=>b in L),m=i.value,d=b=>{o.has("prevent")&&b.preventDefault(),o.has("stop")&&b.stopPropagation(),!(o.has("self")&&b.target!==b.currentTarget)&&(c&&b.key!==L[c]||(typeof t[m]=="function"?t[m].call(t,b):Me(m,t,b)))},p={};o.has("once")&&(p.once=!0),o.has("passive")&&(p.passive=!0),o.has("capture")&&(p.capture=!0),n.addEventListener(a,d,Object.keys(p).length?p:void 0)}else if(i.name.startsWith(":")){const s=i.name.slice(1),a=i.value;if(s==="class"){const o=n.getAttribute("class")??"",c=()=>{n.className=[o,we(j(a,t))].filter(Boolean).join(" ")};P(a,r,c),c()}else if(s==="style"){const o=n.getAttribute("style")??"",c=()=>Te(n,j(a,t),o);P(a,r,c),c()}else if(s.includes("-")){const o=()=>{const c=j(a,t);c==null||c===!1?n.removeAttribute(s):n.setAttribute(s,c===!0?"":String(c))};P(a,r,o),o()}else{const o=()=>{n[s]=j(a,t)??""};P(a,r,o),o()}}}),y.hasChildNodes()&&await I(y,t,r),u++}}var ot=`
router-view.fade-leave{animation:cv-fade-out 0.25s forwards}
router-view.fade-enter{animation:cv-fade-in 0.25s forwards}
router-view.slide-up-leave{animation:cv-slide-up-out 0.25s forwards}
router-view.slide-up-enter{animation:cv-slide-up-in 0.25s forwards}
@keyframes cv-fade-out{to{opacity:0}}
@keyframes cv-fade-in{from{opacity:0}}
@keyframes cv-slide-up-out{to{opacity:0;transform:translateY(-12px)}}
@keyframes cv-slide-up-in{from{opacity:0;transform:translateY(12px)}}
`;function it(){if(document.getElementById("cv-transitions"))return;const e=document.createElement("style");e.id="cv-transitions",e.textContent=ot,document.head.appendChild(e)}async function re(e,t,r){e.classList.add(`${t}-${r}`);const v=getComputedStyle(e),u=Math.max(parseFloat(v.animationDuration)||0,parseFloat(v.transitionDuration)||0)*1e3;u>0&&await new Promise(y=>{const n=()=>y();e.addEventListener("animationend",n,{once:!0}),e.addEventListener("transitionend",n,{once:!0}),setTimeout(n,u+50)}),e.classList.remove(`${t}-${r}`)}var ce=new Map;async function ct(e){if(typeof e!="function")return e;if(ce.has(e))return ce.get(e);const t=await e();return ce.set(e,t.default),t.default}function De(e,t){if(e.components)return e.components[t];if(t==="default")return e.component}function Pe(e,t){if(e==="*")return{};const r=[],v=e.replace(/:(\w+)/g,(y,n)=>(r.push(n),"([^/]+)")),u=t.match(new RegExp(`^${v}$`));return u?Object.fromEntries(r.map((y,n)=>[y,u[n+1]])):null}function lt(e,t){if(e==="/")return{params:{},remaining:t};const r=[],v=e.replace(/:(\w+)/g,(y,n)=>(r.push(n),"([^/]+)")),u=t.match(new RegExp(`^${v}(/.+)?$`));return u?{params:Object.fromEntries(r.map((y,n)=>[y,u[n+1]])),remaining:u[r.length+1]||"/"}:null}var Q=(e,t)=>new Promise(r=>e(t,r)),He=(e,t)=>e?.beforeLeave?new Promise(r=>e.beforeLeave(t,r)):Promise.resolve(void 0);function dt(e,t){return t?e===t?"/":e.startsWith(t+"/")?e.slice(t.length)||"/":e||"/":e||"/"}function Re(e){if(!e)return{};const t=new URLSearchParams(e.startsWith("?")?e.slice(1):e),r={};return t.forEach((v,u)=>{r[u]=v}),r}function Fe(e,t,r,v="default",u){const y=t.base??"",n=g=>g.length>1&&g.endsWith("/")?g.slice(0,-1):g,w=()=>t.mode==="history"?n(dt(window.location.pathname,y)):n((window.location.hash.slice(1)||"/").split("?")[0]||"/"),O=()=>{if(t.mode==="history")return Re(window.location.search);const g=window.location.hash.slice(1)||"/",l=g.indexOf("?");return l>=0?Re(g.slice(l+1)):{}};t.transition&&it();let M=null,L=null,i=null,s=null,a=!1;const o=()=>{a||(a=!0,u?.())},c=new Map,m=g=>{if(g?.keepAlive&&i){i.deactivate?.();const l=document.createDocumentFragment();for(;e.firstChild;)l.appendChild(e.firstChild);c.set(M.path,{fragment:l,activation:i}),i=null}else i?.destroy(),i=null,e.innerHTML=""},d=async(g,l,f,$,h)=>{const E=typeof l=="function"&&!ce.has(l),k=E?l.__asyncOptions:void 0,S=g.loadingTemplate??k?.loadingTemplate;E&&S&&(e.innerHTML=S);let C;try{C=await ct(l)}catch(A){const x=k?.errorTemplate;if(x)return e.innerHTML=x,{destroy:()=>{e.innerHTML=""}};throw A}return E&&S&&(e.innerHTML=""),r(e,C,f,$,h)},p=async()=>{const g=w(),l=O();for(const f of t.routes){if(f.children?.length){const h=lt(f.path,g);if(h!==null)for(const E of f.children){const k=Pe(E.path,g);if(k!==null){const S={params:h.params,query:l,path:g,meta:f.meta};if(E.redirect){const z={params:k,query:l,path:g,meta:E.meta},_=typeof E.redirect=="function"?E.redirect(z):E.redirect;t.navigate(_);return}if(t.beforeEach){const z=await Q(t.beforeEach,S);if(z){t.navigate(z);return}}if(f.beforeEnter){const z=await Q(f.beforeEnter,S);if(z){t.navigate(z);return}}if(E.beforeEnter){const z={params:k,query:l,path:g,meta:E.meta},_=await Q(E.beforeEnter,z);if(_){t.navigate(_);return}}const C=`${f.path}::${JSON.stringify(h.params)}`;if(s!==C){const z=await He(i,S);if(z){t.navigate(z);return}const _=f.transition??t.transition;_&&e.hasChildNodes()&&await re(e,_,"leave"),m(L);const H=De(f,v);if(H){const D={routes:f.children,mode:t.mode,base:t.base,transition:f.transition??t.transition,beforeEach:t.beforeEach,afterEach:t.afterEach,scrollBehavior:t.scrollBehavior,navigate:(R,N)=>t.navigate(R,N),replace:(R,N)=>t.replace(R,N),back:()=>t.back(),forward:()=>t.forward()};i=await d(f,H,S,v==="default"?f.layout:void 0,v==="default"?D:void 0),i.enter?.(M)}else e.innerHTML="";s=C,_&&await re(e,_,"enter")}const A={params:{...h.params,...k},query:l,path:g,meta:E.meta??f.meta};t.afterEach?.(A,M);const x=t.scrollBehavior?.(A,M);x&&window.scrollTo(x.x??0,x.y??0),M=A,L=f,o();return}}}const $=Pe(f.path,g);if($!==null){s=null;const h={params:$,query:l,path:g,meta:f.meta};if(f.redirect){const A=typeof f.redirect=="function"?f.redirect(h):f.redirect;t.navigate(A);return}if(t.beforeEach){const A=await Q(t.beforeEach,h);if(A){t.navigate(A);return}}if(f.beforeEnter){const A=await Q(f.beforeEnter,h);if(A){t.navigate(A);return}}const E=await He(i,h);if(E){t.navigate(E);return}const k=f.transition??t.transition;k&&e.hasChildNodes()&&await re(e,k,"leave"),m(L);const S=De(f,v);if(S){const A=h.path;if(f.keepAlive&&c.has(A)){const x=c.get(A);e.appendChild(x.fragment),i=x.activation,i.activate?.(),c.delete(A)}else{const x=M;i=await d(f,S,h,v==="default"?f.layout:void 0),i.enter?.(x)}}else e.innerHTML="",i=null;k&&await re(e,k,"enter"),t.afterEach?.(h,M);const C=t.scrollBehavior?.(h,M);C&&window.scrollTo(C.x??0,C.y??0),M=h,L=f,o();return}}s=null,m(L),L=null,o()},b=t.mode==="history"?"popstate":"hashchange";return window.addEventListener(b,p),p(),()=>{window.removeEventListener(b,p),i?.destroy(),i=null,c.forEach(({activation:g})=>g.destroy()),c.clear()}}function ut(){if(typeof window>"u")return null;if(window.__COURVUX_DEVTOOLS__)return window.__COURVUX_DEVTOOLS__;const e=new Map,t={instances:[],stores:[],on(r,v){return e.has(r)||e.set(r,new Set),e.get(r).add(v),()=>e.get(r)?.delete(v)},_emit(r,v){e.get(r)?.forEach(u=>{try{u(v)}catch{}})},_registerInstance(r){this.instances.push(r),this._emit("mount",r)},_unregisterInstance(r){const v=this.instances.findIndex(u=>u.id===r);if(v!==-1){const u=this.instances[v];this.instances.splice(v,1),this._emit("destroy",u)}},_registerStore(r){this.stores.push(r),r.subscribe(()=>this._emit("store-update",r))}};return window.__COURVUX_DEVTOOLS__=t,t}var pt=0;function ft(){return++pt}var mt=`
#cvd{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:monospace;font-size:12px;line-height:1.4}
#cvd *{box-sizing:border-box;margin:0;padding:0}
#cvd-badge{background:#5b4cf5;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.5px;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,.4)}
#cvd-badge:hover{background:#7066f7}
#cvd-panel{background:#16161e;color:#c9c9d3;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.6);width:380px;max-height:70vh;display:flex;flex-direction:column;border:1px solid #2a2a3d;overflow:hidden}
#cvd-head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#1f1f30;cursor:move;border-bottom:1px solid #2a2a3d}
#cvd-title{flex:1;font-weight:700;font-size:11px;color:#7066f7;letter-spacing:.8px}
#cvd-tabs{display:flex;gap:2px}
.cvd-tab{background:none;border:none;color:#888;padding:3px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:11px}
.cvd-tab.active,.cvd-tab:hover{background:#2a2a3d;color:#c9c9d3}
#cvd-close{background:none;border:none;color:#666;cursor:pointer;font-size:14px;line-height:1;padding:0 2px}
#cvd-close:hover{color:#e06c75}
#cvd-body{overflow-y:auto;flex:1;padding:6px}
#cvd-body::-webkit-scrollbar{width:4px}
#cvd-body::-webkit-scrollbar-track{background:#1a1a28}
#cvd-body::-webkit-scrollbar-thumb{background:#3a3a52;border-radius:2px}
.cvd-inst{border:1px solid #2a2a3d;border-radius:6px;margin-bottom:6px;overflow:hidden}
.cvd-inst-head{display:flex;align-items:center;gap:6px;padding:5px 8px;background:#1f1f30;cursor:pointer}
.cvd-inst-head:hover{background:#252538}
.cvd-inst-name{font-weight:700;color:#82aaff;flex:1}
.cvd-inst-id{color:#555;font-size:10px}
.cvd-arrow{color:#555;font-size:10px;transition:transform .15s}
.cvd-inst.open .cvd-arrow{transform:rotate(90deg)}
.cvd-kv{display:none;padding:6px 8px;background:#16161e;border-top:1px solid #2a2a3d}
.cvd-inst.open .cvd-kv{display:block}
.cvd-row{display:flex;align-items:baseline;gap:6px;padding:2px 0;border-bottom:1px solid #1e1e2a}
.cvd-row:last-child{border-bottom:none}
.cvd-key{color:#c792ea;min-width:90px;flex-shrink:0}
.cvd-val{color:#c3e88d;flex:1;word-break:break-all;cursor:pointer;padding:1px 4px;border-radius:3px}
.cvd-val:hover{background:#252538}
.cvd-val.editing{background:transparent;padding:0}
.cvd-edit{background:#252538;border:1px solid #5b4cf5;color:#c3e88d;font:inherit;width:100%;border-radius:3px;padding:1px 4px;outline:none}
.cvd-store-key{color:#ffcb6b}
.cvd-empty{color:#555;text-align:center;padding:20px;font-style:italic}
.cvd-badge-dot{display:inline-block;width:6px;height:6px;background:#61d46a;border-radius:50%;margin-right:5px;animation:cvd-pulse 2s infinite}
@keyframes cvd-pulse{0%,100%{opacity:1}50%{opacity:.4}}
.cvd-count{color:#888;font-size:10px}
`;function ht(){if(document.getElementById("cvd-styles"))return;const e=document.createElement("style");e.id="cvd-styles",e.textContent=mt,document.head.appendChild(e)}function ae(e){return e===null?"null":e===void 0?"undefined":typeof e=="string"?`"${e}"`:typeof e=="object"?JSON.stringify(e):String(e)}function Ie(e){try{return JSON.parse(e)}catch{return e}}function vt(e){if(typeof document>"u")return;ht();const t=document.createElement("div");t.id="cvd",document.body.appendChild(t);let r=!1,v="components",u=new Set;const y=document.createElement("div");y.id="cvd-badge",y.innerHTML='<span class="cvd-badge-dot"></span>COURVUX',t.appendChild(y);const n=document.createElement("div");n.id="cvd-panel",n.style.display="none",t.appendChild(n),n.innerHTML=`
        <div id="cvd-head">
            <span id="cvd-title">⚡ COURVUX DEVTOOLS</span>
            <div id="cvd-tabs">
                <button class="cvd-tab active" data-tab="components">Components</button>
                <button class="cvd-tab" data-tab="store">Store</button>
            </div>
            <button id="cvd-close">✕</button>
        </div>
        <div id="cvd-body"></div>
    `;const w=n.querySelector("#cvd-body");y.addEventListener("click",()=>{r=!0,y.style.display="none",n.style.display="flex",i()}),n.querySelector("#cvd-close").addEventListener("click",()=>{r=!1,n.style.display="none",y.style.display=""}),n.querySelectorAll(".cvd-tab").forEach(s=>{s.addEventListener("click",()=>{v=s.dataset.tab,n.querySelectorAll(".cvd-tab").forEach(a=>a.classList.remove("active")),s.classList.add("active"),i()})});const O=n.querySelector("#cvd-head");O.addEventListener("pointerdown",s=>{if(s.target.closest("button"))return;O.setPointerCapture(s.pointerId);const a=s.clientX,o=s.clientY,c=t.offsetLeft,m=t.offsetTop,d=b=>{t.style.right="auto",t.style.bottom="auto",t.style.left=`${c+(b.clientX-a)}px`,t.style.top=`${m+(b.clientY-o)}px`},p=b=>{O.releasePointerCapture(b.pointerId),O.removeEventListener("pointermove",d),O.removeEventListener("pointerup",p),O.removeEventListener("pointercancel",p)};O.addEventListener("pointermove",d),O.addEventListener("pointerup",p),O.addEventListener("pointercancel",p)});function M(){const s=e.instances;if(!s.length){w.innerHTML='<div class="cvd-empty">No hay componentes montados</div>';return}w.innerHTML=s.map(a=>{const o=a.getState(),c=Object.keys(o);return`
                <div class="cvd-inst${u.has(a.id)?" open":""}" data-id="${a.id}">
                    <div class="cvd-inst-head">
                        <span class="cvd-arrow">▶</span>
                        <span class="cvd-inst-name">&lt;${a.name}&gt;</span>
                        <span class="cvd-count">${c.length} keys</span>
                        <span class="cvd-inst-id">#${a.id}</span>
                    </div>
                    <div class="cvd-kv">
                        ${c.length?c.map(m=>`
                            <div class="cvd-row">
                                <span class="cvd-key">${m}</span>
                                <span class="cvd-val" data-inst="${a.id}" data-key="${m}" title="click to edit">${ae(o[m])}</span>
                            </div>
                        `).join(""):'<span style="color:#555">— sin datos reactivos —</span>'}
                    </div>
                </div>
            `}).join(""),w.querySelectorAll(".cvd-inst-head").forEach(a=>{a.addEventListener("click",()=>{const o=a.closest(".cvd-inst"),c=parseInt(o.dataset.id);u.has(c)?u.delete(c):u.add(c),o.classList.toggle("open")})}),w.querySelectorAll(".cvd-val").forEach(a=>{a.addEventListener("click",o=>{o.stopPropagation();const c=a;if(c.querySelector("input"))return;const m=parseInt(c.dataset.inst),d=c.dataset.key,p=e.instances.find(f=>f.id===m);if(!p)return;const b=ae(p.getState()[d]);c.classList.add("editing"),c.innerHTML=`<input class="cvd-edit" value='${b.replace(/'/g,"&#39;")}'>`;const g=c.querySelector("input");g.focus(),g.select();const l=()=>{p.setState(d,Ie(g.value)),c.classList.remove("editing")};g.addEventListener("blur",l),g.addEventListener("keydown",f=>{f.key==="Enter"&&(f.preventDefault(),l()),f.key==="Escape"&&(c.classList.remove("editing"),i())})})})}function L(){if(!e.stores.length){w.innerHTML='<div class="cvd-empty">No hay store registrado</div>';return}w.innerHTML=e.stores.map((s,a)=>{const o=s.getState(),c=Object.keys(o);return`
                <div class="cvd-inst open" data-store="${a}">
                    <div class="cvd-inst-head">
                        <span class="cvd-arrow" style="transform:rotate(90deg)">▶</span>
                        <span class="cvd-inst-name" style="color:#ffcb6b">Store</span>
                        <span class="cvd-count">${c.length} keys</span>
                    </div>
                    <div class="cvd-kv">
                        ${c.map(m=>`
                            <div class="cvd-row">
                                <span class="cvd-key cvd-store-key">${m}</span>
                                <span class="cvd-val" data-store="${a}" data-key="${m}" title="click to edit">${ae(o[m])}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `}).join(""),w.querySelectorAll(".cvd-inst-head").forEach(s=>{s.addEventListener("click",()=>s.closest(".cvd-inst").classList.toggle("open"))}),w.querySelectorAll("[data-store][data-key]").forEach(s=>{s.addEventListener("click",a=>{a.stopPropagation();const o=s;if(o.querySelector("input"))return;const c=parseInt(o.dataset.store),m=o.dataset.key,d=e.stores[c];if(!d)return;const p=ae(d.getState()[m]);o.classList.add("editing"),o.innerHTML=`<input class="cvd-edit" value='${p.replace(/'/g,"&#39;")}'>`;const b=o.querySelector("input");b.focus(),b.select();const g=()=>{d.setState(m,Ie(b.value)),o.classList.remove("editing")};b.addEventListener("blur",g),b.addEventListener("keydown",l=>{l.key==="Enter"&&(l.preventDefault(),g()),l.key==="Escape"&&(o.classList.remove("editing"),i())})})})}function i(){r&&(v==="components"?M():L())}e.on("mount",()=>i()),e.on("update",()=>i()),e.on("destroy",()=>i()),e.on("store-update",()=>i())}var be="data-courvux-ssr",bt=e=>e?Promise.resolve().then(e):Promise.resolve();function qe(e,t){const r=e.trim();if(r.startsWith("{")){const v=r.replace(/[{}]/g,"").split(",").map(u=>u.trim()).filter(Boolean);return Object.fromEntries(v.map(u=>[u,t[u]]))}return{[r]:t}}var se=e=>{if(e===null||typeof e!="object")return e;try{return structuredClone(e)}catch{return e}};async function V(e,t,r){const v={},{subscribe:u,createReactiveState:y,registerSetInterceptor:n,notifyAll:w}=xe();let O;if(typeof t.data=="function"?(t.loadingTemplate&&(e.innerHTML=t.loadingTemplate),O=await t.data()):O=t.data??{},t.templateUrl){const l=r.baseUrl?new URL(t.templateUrl,r.baseUrl).href:t.templateUrl,f=await fetch(l);if(!f.ok)throw new Error(`Failed to load template: ${l} (${f.status})`);e.innerHTML=await f.text()}else t.template&&(e.innerHTML=t.template);e.removeAttribute(be),e.querySelector(`[${be}]`)?.removeAttribute(be);const M={};if(t.inject&&r.provided){const l=Array.isArray(t.inject)?Object.fromEntries(t.inject.map(f=>[f,f])):t.inject;Object.entries(l).forEach(([f,$])=>{r.provided&&$ in r.provided&&(M[f]=r.provided[$])})}const L=y({...r.globalProperties??{},...O,...M,...t.methods,$refs:v,$el:e,...r.slots?{$slots:Object.fromEntries(Object.keys(r.slots).map(l=>[l,!0]))}:{},...r.store?{$store:r.store}:{},...r.currentRoute?{$route:r.currentRoute}:{},...r.router?{$router:r.router}:{}});t.exprs&&typeof t.exprs=="object"&&tt(L,t.exprs),L.$watch=(l,f,$)=>{const h=$?.deep??!1,E=$?.immediate??!1;let k=h?se(L[l]):L[l];const S=u(l,()=>{const C=L[l];f.call(L,C,k),k=h?se(C):C});return E&&f.call(L,L[l],void 0),S},L.$batch=et,L.$nextTick=l=>bt(l),L.$dispatch=(l,f,$)=>{e.dispatchEvent(new CustomEvent(l,{bubbles:!0,composed:!0,...$??{},detail:f}))},r.magics&&Object.entries(r.magics).forEach(([l,f])=>{L[l]=f(L)}),L.$forceUpdate=()=>w();const i=[];L.$watchEffect=l=>{let f=[];const $=()=>{f.forEach(S=>S()),f=[];const E=$e(()=>{try{l()}catch{}}),k=new Map;for(const{sub:S,key:C}of E)k.has(S)||k.set(S,new Set),!k.get(S).has(C)&&(k.get(S).add(C),f.push(S(C,$)))};$();const h=()=>{f.forEach(k=>k()),f=[];const E=i.indexOf(h);E>-1&&i.splice(E,1)};return i.push(h),h};const s=[];t.computed&&Object.entries(t.computed).forEach(([l,f])=>{const $=typeof f=="function"?f:f.get,h=typeof f!="function"?f.set:void 0;let E=[];const k=()=>{E.forEach(x=>x()),E=[];let S;const C=$e(()=>{try{S=$.call(L)}catch(x){(t.debug??r.debug)&&console.warn("[courvux] computed error:",x)}});L[l]=S;const A=new Map;for(const{sub:x,key:z}of C)A.has(x)||A.set(x,new Set),!A.get(x).has(z)&&(A.get(x).add(z),E.push(x(z,k)))};k(),s.push(()=>E.forEach(S=>S())),h&&n(l,S=>h.call(L,S))});const a=[];t.watch&&Object.entries(t.watch).forEach(([l,f])=>{const $=typeof f=="object"&&f!==null&&"handler"in f,h=$?f.handler:f,E=$?f.immediate??!1:!1,k=$?f.deep??!1:!1;let S=k?se(L[l]):L[l];const C=u(l,()=>{const A=L[l];h.call(L,A,S),S=k?se(A):A});a.push(C),E&&h.call(L,L[l],void 0)});const o={...r.provided??{}};if(t.provide){const l=typeof t.provide=="function"?t.provide.call(L):t.provide;Object.assign(o,l)}const c={...r,provided:o,components:{...r.components,...t.components}};c.mountElement=de(c),c.createChildScope=(l,f)=>{const $=new Set(Object.keys(l)),h=new Set(Object.keys(f)),{subscribe:E,createReactiveState:k}=xe(),S=k(l);let C;return C=new Proxy({},{get(A,x){return typeof x!="string"?L[x]:$.has(x)?S[x]:h.has(x)?f[x].bind(C):L[x]},set(A,x,z){return typeof x!="string"?!1:$.has(x)?(S[x]=z,!0):(L[x]=z,!0)},has(A,x){return $.has(x)||h.has(x)||x in L},ownKeys(){return[...$,...h,...Object.keys(L)]},getOwnPropertyDescriptor(A,x){return $.has(x)||h.has(x)||x in L?{configurable:!0,enumerable:!0,writable:!0}:void 0}}),{state:C,subscribe:(A,x)=>$.has(A)?E(A,x):p(A,x),cleanup:()=>{}}},c.mountDynamic=async(l,f,$,h,E)=>{let k=null,S=null;const C=$.getAttribute("loading-template")??"",A=async()=>{S?.(),S=null,k?.parentNode&&(k.parentNode.removeChild(k),k=null);const x=j(f,h);if(!x)return;let z;if(typeof x=="function"){if(C){const T=document.createElement("div");T.innerHTML=C,l.parentNode?.insertBefore(T,l.nextSibling),k=T}z=(await x()).default,k?.parentNode&&(k.parentNode.removeChild(k),k=null)}else typeof x=="string"?z=c.components?.[x]:x&&typeof x=="object"&&(z=x);if(!z)return;const _=document.createElement("div"),H=T=>T.startsWith("@")||T.startsWith("cv:on:")||T.startsWith(":")||T.startsWith("cv-")||T.startsWith("v-slot");Array.from($.attributes).forEach(T=>{H(T.name)||_.setAttribute(T.name,T.value)}),_.innerHTML=$.innerHTML;const D={},R={};Array.from($.attributes).forEach(T=>{if(T.name.startsWith(":"))D[T.name.slice(1)]=j(T.value,h);else if(T.name.startsWith("@")||T.name.startsWith("cv:on:")){const q=T.value,Z=T.name.startsWith("@")?T.name.slice(1):T.name.slice(6);R[Z]=(...ue)=>{typeof h[q]=="function"&&h[q].call(h,...ue)}}});const N={...z,data:{...z.data,...D},methods:{...z.methods,$emit(T,...q){Xe(z,T,q),R[T]?.(...q)}}},W={...c,components:{...c.components,...z.components}};W.mountElement=de(W),S=(await V(_,N,W)).destroy,l.parentNode?.insertBefore(_,l.nextSibling),k=_};P(f,E,A),await A()};const m=[];L.$addCleanup=l=>{m.push(l)};let d=!1;const p=(l,f)=>!t.onBeforeUpdate&&!t.onUpdated?u(l,f):u(l,()=>{d||(d=!0,t.onBeforeUpdate?.call(L),Promise.resolve().then(()=>{d=!1,t.onUpdated?.call(L)})),f()});try{t.onBeforeMount?.call(L),await I(e,L,{subscribe:p,refs:v,...c,registerCleanup:l=>m.push(l)}),e.removeAttribute("cv-cloak"),t.onMount?.call(L)}catch(l){if(t.onError)e.removeAttribute("cv-cloak"),t.onError.call(L,l);else if(r.errorHandler)e.removeAttribute("cv-cloak"),r.errorHandler(l,L,t.name??e.tagName.toLowerCase());else throw l}const b=typeof window<"u"?window.__COURVUX_DEVTOOLS__:void 0,g=b?ft():0;if(b){const l=L,f=new Set,$={id:g,name:t.name??e.tagName.toLowerCase(),el:e,getState:()=>{const h={};for(const E of Object.keys(l))if(!(E.startsWith("$")||typeof l[E]=="function"))try{h[E]=l[E]}catch{}return h},setState:(h,E)=>{l[h]=E},subscribe:h=>(f.add(h),()=>f.delete(h)),children:[]};Object.keys(l).filter(h=>!h.startsWith("$")&&typeof l[h]!="function").forEach(h=>{u(h,()=>{b._emit("update",$),f.forEach(E=>E())})}),b._registerInstance($),m.push(()=>b._unregisterInstance(g))}return{state:L,destroy:()=>{t.onBeforeUnmount?.call(L),s.forEach(l=>l()),a.forEach(l=>l()),i.forEach(l=>l()),m.forEach(l=>l()),t.onDestroy?.call(L)},activate:()=>{t.onActivated?.call(L)},deactivate:()=>{t.onDeactivated?.call(L)},beforeLeave:t.onBeforeRouteLeave?(l,f)=>t.onBeforeRouteLeave.call(L,l,f):void 0,enter:t.onBeforeRouteEnter?l=>t.onBeforeRouteEnter.call(L,l):void 0}}function Xe(e,t,r){if(!e.emits||Array.isArray(e.emits))return;const v=e.emits[t];typeof v=="function"&&!v(...r)&&console.warn(`[courvux] emit "${t}": validator returned false`)}function de(e){return async(t,r,v,u)=>{const y=e.components[r],n=t.getAttribute("cv-ref");n&&t.removeAttribute("cv-ref");const w={},O=[],M={};Array.from(t.attributes).filter(d=>d.name==="cv-model"||d.name.startsWith("cv-model.")||d.name.startsWith("cv-model:")).forEach(d=>{t.removeAttribute(d.name);const p=d.value,b=d.name.indexOf(":"),g=b>=0?d.name.slice(b+1).split(".")[0]:"modelValue",l=g==="modelValue"?"update:modelValue":`update:${g}`;w[g]=he(j(p,v)),O.push({propName:g,expr:p}),M[l]=f=>{X(p,v,f)}});const L={};Array.from(t.attributes).forEach(d=>{const p=d.name.startsWith(":"),b=d.name.startsWith("@")||d.name.startsWith("cv:on:"),g=d.name==="cv-model"||d.name.startsWith("cv-model.")||d.name.startsWith("cv-model:"),l=d.name.startsWith("v-slot"),f=d.name==="slot";!p&&!b&&!g&&!l&&!f&&(L[d.name]=d.value)}),y.inheritAttrs===!1&&Object.keys(L).forEach(d=>t.removeAttribute(d)),Array.from(t.attributes).forEach(d=>{if(d.name.startsWith(":")){const p=d.name.slice(1),b=d.value;w[p]=he(j(b,v)),O.push({propName:p,expr:b})}else if(d.name.startsWith("@")||d.name.startsWith("cv:on:")){const p=d.name.startsWith("@")?d.name.slice(1):d.name.slice(6),b=d.value;M[p]=(...g)=>{typeof v[b]=="function"&&v[b].call(v,...g)}}});const i=t.getAttribute("v-slot")??t.getAttribute("v-slot:default");i&&(t.removeAttribute("v-slot"),t.removeAttribute("v-slot:default"));const s=new Map,a=[];Array.from(t.childNodes).forEach(d=>{const p=d.nodeType===1?d.getAttribute("slot"):null;if(p){if(!s.has(p)){const b=t.getAttribute(`v-slot:${p}`)??null;b&&t.removeAttribute(`v-slot:${p}`),s.set(p,{nodes:[],vSlot:b})}s.get(p).nodes.push(d.cloneNode(!0))}else a.push(d.cloneNode(!0))});const o={};a.some(d=>d.nodeType===1||d.nodeType===3&&(d.textContent?.trim()??"")!=="")&&(o.default=async d=>{const p=i?{...v,...qe(i,d)}:v,b=document.createDocumentFragment();return a.forEach(g=>b.appendChild(g.cloneNode(!0))),await I(b,p,u),Array.from(b.childNodes)});for(const[d,{nodes:p,vSlot:b}]of s)o[d]=async g=>{const l=b?{...v,...qe(b,g)}:v,f=document.createDocumentFragment();return p.forEach($=>f.appendChild($.cloneNode(!0))),await I(f,l,u),Array.from(f.childNodes)};const c={...e,components:{...e.components,...y.components},slots:o};c.mountElement=de(c);const{state:m}=await V(t,{...y,data:{...y.data,...w,$attrs:L,$parent:v},methods:{...y.methods,$emit(d,...p){Xe(y,d,p),M[d]?.(...p)}}},c);m&&(O.forEach(({propName:d,expr:p})=>{Ge(p,{...u,subscribe:u.subscribe},()=>{m[d]=he(j(p,v))})}),n&&u.refs&&(u.refs[n]=m))}}function gt(e){at();const t=typeof window<"u"?ut():void 0,r=[],v={...e.directives},u={...e.components??{}},y=[],n=new Map,w={},O=new Map;if(e.debug&&t&&vt(t),t&&e.store){const s=e.store,a=Object.keys(s).filter(o=>typeof s[o]!="function");t._registerStore({getState(){const o={};return a.forEach(c=>{try{o[c]=s[c]}catch{}}),o},setState(o,c){s[o]=c},subscribe(o){const c=a.map(m=>{try{return te(s,m,o)}catch{return()=>{}}});return()=>c.forEach(m=>m())}})}const M={router:e.router,use(s){return r.includes(s)||(r.push(s),s.install(M)),M},directive(s,a){return v[s]=a,M},component(s,a){return u[s]=a,M},provide(s,a){return typeof s=="string"?w[s]=a:Object.assign(w,s),M},magic(s,a){return O.set(`$${s}`,a),M},mount:async s=>(await i(s),M),mountAll:async(s="[data-courvux]")=>{const a=Array.from(document.querySelectorAll(s));return await Promise.all(a.map(o=>L(o))),M},mountEl:async s=>L(s),unmount(s){if(!s)y.forEach(a=>a()),y.length=0,n.clear();else{const a=document.querySelector(s);if(a){const o=n.get(a);if(o){o(),n.delete(a);const c=y.indexOf(o);c>-1&&y.splice(c,1)}}}return M},destroy(){y.forEach(s=>s()),y.length=0,n.clear()}},L=async s=>{const a=new URL(".",document.baseURI).href,o={components:u,router:e.router,store:e.store,directives:v,baseUrl:a,provided:{...w},errorHandler:e.errorHandler,globalProperties:e.globalProperties,magics:O.size?Object.fromEntries(O):void 0};if(o.mountElement=de(o),e.router){const m=e.router;o.mountRouterView=async(d,p)=>{await new Promise(b=>{Fe(d,m,async(g,l,f,$,h)=>{const E={...o,currentRoute:f};if(h){let k=null;const S={...E,mountRouterView:async(C,A)=>{k=Fe(C,h,async(x,z,_,H)=>{const D={...E,currentRoute:_};if(H){let R=null;const N={...D,mountRouterView:async(T,q)=>{R=await V(T,z,D)}},{destroy:W}=await V(x,{template:H},N);return{destroy:()=>{R?.destroy(),W()},activate:()=>R?.activate(),deactivate:()=>R?.deactivate()}}else return await V(x,z,D)},A)}};if($){let C=null;const A={...S,mountRouterView:async(z,_)=>{C=await V(z,l,S)}},{destroy:x}=await V(g,{template:$},A);return{destroy:()=>{k?.(),C?.destroy(),x()},activate:()=>C?.activate(),deactivate:()=>C?.deactivate()}}else{const C=await V(g,l,S);return{destroy:()=>{k?.(),C.destroy()},activate:()=>C.activate(),deactivate:()=>C.deactivate()}}}else if($){let k=null;const S={...E,mountRouterView:async(A,x)=>{k=await V(A,l,E)}},{destroy:C}=await V(g,{template:$},S);return{destroy:()=>{k?.destroy(),C()},activate:()=>k?.activate(),deactivate:()=>k?.deactivate()}}else return await V(g,l,E)},p,b)})}}const c=await V(s,e,o);return y.push(c.destroy),n.set(s,c.destroy),c.state},i=async s=>{const a=document.querySelector(s);if(a)return L(a)};return M}/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const yt=[["path",{d:"M20 6 9 17l-5-5"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xt=[["path",{d:"m6 9 6 6 6-6"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const wt=[["path",{d:"M12 15V3"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{d:"m7 10 5 5 5-5"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const kt=[["path",{d:"M15 3h6v6"}],["path",{d:"M10 14 21 3"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Et=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{d:"M10 9H8"}],["path",{d:"M16 13H8"}],["path",{d:"M16 17H8"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const At=[["path",{d:"M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"}],["path",{d:"M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"}],["path",{d:"M3 5a2 2 0 0 0 2 2h3"}],["path",{d:"M3 3v13a2 2 0 0 0 2 2h3"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Lt=[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}],["circle",{cx:"9",cy:"9",r:"2"}],["path",{d:"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $t=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const St=[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ct=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const zt=[["path",{d:"M4 5h16"}],["path",{d:"M4 12h16"}],["path",{d:"M4 19h16"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ot=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const jt=[["path",{d:"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{d:"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{d:"M7 3v4a1 1 0 0 0 1 1h7"}]];/**
 * @license lucide v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Tt=[["path",{d:"m21 21-4.34-4.34"}],["circle",{cx:"11",cy:"11",r:"8"}]],Mt='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';function B(e,t=16,r=2){const u=Object.entries({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",width:t,height:t,fill:"none",stroke:"currentColor","stroke-width":r,"stroke-linecap":"round","stroke-linejoin":"round"}).map(([n,w])=>`${n}="${w}"`).join(" "),y=e.map(([n,w])=>`<${n} ${Object.entries(w).map(([O,M])=>`${O}="${M}"`).join(" ")}/>`).join("");return`<svg ${u}>${y}</svg>`}const Je={github:Mt,download:B(wt),externalLink:B(kt),folderTree:B(At),menu:B(zt),file:B(Et),lock:B(Ct),image:B(Lt),link:B(St),layers:B($t),chevronDown:B(xt),check:B(yt),search:B(Tt),save:B(jt),plus:B(Ot)},Nt=Object.fromEntries(Object.entries(Je).map(([e,t])=>[e,t.replace(/width="\d+"/,'width="22"').replace(/height="\d+"/,'height="22"')])),ke="https://github.com/vanjexdev/courvux-tauri-example",Ee="0.9.3",Wt=`${ke}/releases/tag/v${Ee}`;gt({template:`
        <div cv-cloak class="min-h-screen flex flex-col">

            <!-- ── Header ────────────────────────────────────────────── -->
            <header class="sticky top-0 z-30 bg-zinc-950/85 backdrop-blur border-b border-zinc-800/80">
                <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    <a href="#main"
                       class="flex items-center gap-2.5 shrink-0"
                       aria-label="Courvux Notepad — home">
                        <img src="./logo.png" alt="" width="28" height="28" class="shrink-0" aria-hidden="true" />
                        <span class="font-semibold text-sm text-zinc-100 hidden xs:inline">Courvux Notepad</span>
                    </a>

                    <nav aria-label="Primary"
                         class="hidden md:flex items-center gap-1 text-xs text-zinc-400">
                        <a href="#features" class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Features</a>
                        <a href="#stack"    class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Stack</a>
                        <a href="#install"  class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Install</a>
                    </nav>

                    <div class="flex items-center gap-2">
                        <a :href="repo"
                           target="_blank" rel="noopener"
                           class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900"
                           aria-label="View source on GitHub">
                            <span cv-html.raw="icons.github" aria-hidden="true"></span>
                            <span>GitHub</span>
                        </a>
                        <button
                            @click="mobileNavOpen = !mobileNavOpen"
                            :aria-expanded="mobileNavOpen ? 'true' : 'false'"
                            aria-controls="mobile-nav"
                            aria-label="Toggle navigation"
                            class="md:hidden p-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900">
                            <span cv-html.raw="icons.menu" aria-hidden="true"></span>
                        </button>
                    </div>
                </div>

                <nav id="mobile-nav"
                     cv-show="mobileNavOpen"
                     aria-label="Mobile"
                     class="md:hidden border-t border-zinc-800/80 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 py-2 flex flex-col text-sm">
                        <a href="#features" @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Features</a>
                        <a href="#stack"    @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Stack</a>
                        <a href="#install"  @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Install</a>
                        <a :href="repo" target="_blank" rel="noopener"
                           class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300 inline-flex items-center gap-1.5">
                            <span cv-html.raw="icons.github" aria-hidden="true"></span>
                            <span>GitHub</span>
                        </a>
                    </div>
                </nav>
            </header>

            <main id="main" class="flex-1">

                <!-- ── Hero ──────────────────────────────────────────── -->
                <section class="hero-glow relative">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-12 items-center">

                        <div class="space-y-6">
                            <div class="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider">
                                <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">v{{ version }}</span>
                                <span class="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">MIT</span>
                                <span class="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">Linux · macOS · Windows</span>
                            </div>

                            <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-zinc-100 leading-tight tracking-tight">
                                A native Markdown notepad,<br/>
                                <span class="text-emerald-400">strict CSP</span> by default.
                            </h1>

                            <p class="text-base md:text-lg text-zinc-400 leading-relaxed max-w-xl">
                                Built on <a :href="links.courvux" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Courvux</a> + <a :href="links.tauri" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Tauri 2</a>. Edit a flat library or open any folder as a project — your files stay in plain Markdown, on your disk, in your git.
                            </p>

                            <div class="flex flex-wrap items-center gap-3">
                                <a :href="release"
                                   target="_blank" rel="noopener"
                                   class="inline-flex items-center gap-2 px-5 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm">
                                    <span cv-html.raw="iconsLg.download" aria-hidden="true"></span>
                                    <span>Download v{{ version }}</span>
                                </a>
                                <a :href="repo"
                                   target="_blank" rel="noopener"
                                   class="inline-flex items-center gap-2 px-5 py-3 rounded border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white font-semibold text-sm">
                                    <span cv-html.raw="iconsLg.github" aria-hidden="true"></span>
                                    <span>View on GitHub</span>
                                </a>
                            </div>

                            <p class="text-xs text-zinc-500 pt-2">
                                One Markdown file per note, atomic writes, no proprietary store. Sync with Dropbox / Syncthing / git.
                            </p>
                        </div>

                        <!-- Hero mockup — HTML/CSS recreation of the live UI. -->
                        <div class="mockup-window rounded-lg overflow-hidden bg-zinc-950 text-xs select-none"
                             role="img"
                             aria-label="Screenshot of the Courvux Notepad UI showing a project sidebar, a Markdown editor with a code block, and a rendered preview pane.">
                            <!-- Title bar -->
                            <div class="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/80">
                                <span class="w-2.5 h-2.5 rounded-full bg-red-500/70" aria-hidden="true"></span>
                                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/70" aria-hidden="true"></span>
                                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/70" aria-hidden="true"></span>
                                <span class="ml-2 text-[10px] text-zinc-500">Courvux Notepad</span>
                            </div>

                            <div class="grid grid-cols-[34%_1fr] min-h-[320px]">
                                <!-- Sidebar -->
                                <aside class="border-r border-zinc-800 p-2 space-y-0.5 bg-zinc-900/40">
                                    <div class="flex items-center justify-between mb-2 px-1">
                                        <span class="font-semibold text-[11px] text-zinc-300 truncate">notes-project</span>
                                        <span cv-html.raw="icons.plus" class="text-emerald-400" aria-hidden="true"></span>
                                    </div>
                                    <div cv-for="entry in mockTree"
                                         :key="entry.name"
                                         :style="'padding-left:' + (entry.depth * 12 + 8) + 'px'"
                                         :class="entry.active ? 'bg-emerald-500/10 border-l-2 border-emerald-500 -ml-px' : ''"
                                         class="py-1 pr-2 flex items-center gap-1.5 text-[11px] text-zinc-300 rounded">
                                        <span cv-html.raw="iconForKind(entry.kind)"
                                              :class="entry.kind === 'dir' ? 'text-amber-500/80' : entry.kind === 'image' ? 'text-blue-400' : 'text-zinc-400'"
                                              aria-hidden="true"></span>
                                        <span class="truncate">{{ entry.name }}</span>
                                    </div>
                                </aside>

                                <!-- Main: editor + preview -->
                                <div class="grid grid-rows-[auto_1fr] min-w-0">
                                    <div class="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2 bg-zinc-900/40">
                                        <span class="text-zinc-100 text-xs font-semibold truncate">intro.md</span>
                                        <div class="flex items-center gap-1.5 shrink-0">
                                            <span class="px-1.5 py-0.5 rounded text-[9px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 inline-flex items-center gap-0.5">
                                                <span cv-html.raw="icons.check" aria-hidden="true"></span>
                                                <span>Saved</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 min-h-0">
                                        <pre class="px-3 py-2 text-[10px] text-zinc-300 leading-relaxed border-r border-zinc-800 overflow-hidden whitespace-pre-wrap font-mono"># Hello, project mode

Drop a folder, edit in place.
Images render via &lt;code&gt;asset://&lt;/code&gt;.

\`\`\`js
import { createApp } from 'courvux';
createApp({ ... }).mount('#app');
\`\`\`</pre>
                                        <div class="px-3 py-2 text-[10px] leading-relaxed overflow-hidden">
                                            <h1 class="text-zinc-100 font-bold text-sm mb-1">Hello, project mode</h1>
                                            <p class="text-zinc-300 mb-1.5">Drop a folder, edit in place. Images render via <code class="bg-zinc-900 px-1 rounded text-fuchsia-300 text-[9px]">asset://</code>.</p>
                                            <pre class="bg-zinc-900 border border-zinc-800 rounded p-1.5 text-[9px] text-zinc-200 leading-tight overflow-hidden"><span class="text-purple-400">import</span> { createApp } <span class="text-purple-400">from</span> <span class="text-emerald-300">'courvux'</span>;
createApp({ ... }).mount(<span class="text-emerald-300">'#app'</span>);</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── Features ──────────────────────────────────────── -->
                <section id="features" class="border-t border-zinc-900 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
                        <header class="mb-10 md:mb-14 max-w-2xl">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Features</p>
                            <h2 class="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">Everything a writing app needs, nothing it doesn't.</h2>
                            <p class="text-zinc-400 text-sm md:text-base leading-relaxed">
                                A flat notes library for quick capture. A project mode for serious work. Native menus, file associations, and a real PDF export with clickable links.
                            </p>
                        </header>

                        <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            <li cv-for="f in features" :key="f.title"
                                class="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors">
                                <div class="w-9 h-9 rounded-md bg-emerald-500/10 text-emerald-300 inline-flex items-center justify-center mb-3"
                                     :aria-hidden="true">
                                    <span cv-html.raw="iconsLg[f.icon]"></span>
                                </div>
                                <h3 class="text-zinc-100 font-semibold mb-1.5">{{ f.title }}</h3>
                                <p class="text-zinc-400 text-sm leading-relaxed">{{ f.body }}</p>
                            </li>
                        </ul>
                    </div>
                </section>

                <!-- ── Stack strip ───────────────────────────────────── -->
                <section id="stack" class="border-t border-zinc-900 bg-zinc-900/30">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
                        <header class="text-center mb-8">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Stack</p>
                            <h2 class="text-xl md:text-2xl font-bold text-zinc-100">Composed of small, sharp pieces.</h2>
                        </header>
                        <ul class="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-xs">
                            <li cv-for="s in stack" :key="s.name"
                                class="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300">
                                <a :href="s.url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 hover:text-zinc-100">
                                    <span class="text-emerald-400">{{ s.name }}</span>
                                    <span class="text-zinc-500">{{ s.version }}</span>
                                </a>
                            </li>
                        </ul>
                    </div>
                </section>

                <!-- ── Install ───────────────────────────────────────── -->
                <section id="install" class="border-t border-zinc-900 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
                        <header class="mb-10 md:mb-14 max-w-2xl">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Install</p>
                            <h2 class="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">Grab a build, or compile from source.</h2>
                            <p class="text-zinc-400 text-sm md:text-base leading-relaxed">
                                Each release ships native bundles for the major desktops. Tauri can't cross-compile the bundled webview, so each platform's artifact is built on its own host.
                            </p>
                        </header>

                        <div class="grid gap-5 md:grid-cols-3">
                            <article cv-for="p in platforms" :key="p.name"
                                     class="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex flex-col">
                                <header class="flex items-center justify-between mb-4">
                                    <h3 class="text-zinc-100 font-semibold">{{ p.name }}</h3>
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider">{{ p.formats }}</span>
                                </header>
                                <pre class="text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded p-3 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all flex-1">{{ p.cmd }}</pre>
                                <footer class="mt-4 flex items-center justify-between text-xs">
                                    <a :href="release" target="_blank" rel="noopener"
                                       class="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                                        <span>Download</span>
                                        <span cv-html.raw="icons.externalLink" aria-hidden="true"></span>
                                    </a>
                                    <span class="text-zinc-500">{{ p.note }}</span>
                                </footer>
                            </article>
                        </div>

                        <p class="mt-8 text-xs text-zinc-500 max-w-3xl">
                            Or build from source — clone the repo, install your platform's Tauri prerequisites, then run <code class="px-1 rounded bg-zinc-900 text-zinc-300">pnpm tauri build</code>. See the <a :href="readme" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">README</a> for the per-OS dependency list.
                        </p>
                    </div>
                </section>
            </main>

            <!-- ── Footer ────────────────────────────────────────────── -->
            <footer class="border-t border-zinc-900 bg-zinc-950">
                <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 justify-between text-xs text-zinc-500">
                    <div class="flex items-center gap-2">
                        <img src="./logo.png" alt="" width="20" height="20" aria-hidden="true" />
                        <span>© {{ year }} Vanjex · MIT</span>
                    </div>
                    <nav aria-label="Footer" class="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <a :href="repo" target="_blank" rel="noopener" class="hover:text-zinc-300">Repository</a>
                        <a :href="readme" target="_blank" rel="noopener" class="hover:text-zinc-300">README</a>
                        <a :href="release" target="_blank" rel="noopener" class="hover:text-zinc-300">Releases</a>
                        <a :href="links.courvux" target="_blank" rel="noopener" class="hover:text-zinc-300">Courvux</a>
                    </nav>
                </div>
            </footer>
        </div>
    `,exprs:{version:(e=>e.version),"entry.name":(e=>e.entry.name),"f.title":(e=>e.f.title),"f.body":(e=>e.f.body),"s.name":(e=>e.s.name),"s.version":(e=>e.s.version),"p.name":(e=>e.p.name),"p.formats":(e=>e.p.formats),"p.cmd":(e=>e.p.cmd),"p.note":(e=>e.p.note),year:(e=>e.year),repo:(e=>e.repo),"icons.github":(e=>e.icons.github),"mobileNavOpen = !mobileNavOpen":(e=>e.mobileNavOpen=!e.mobileNavOpen),"mobileNavOpen ? 'true' : 'false'":(e=>e.mobileNavOpen?"true":"false"),"icons.menu":(e=>e.icons.menu),mobileNavOpen:(e=>e.mobileNavOpen),"mobileNavOpen = false":(e=>e.mobileNavOpen=!1),"links.courvux":(e=>e.links.courvux),"links.tauri":(e=>e.links.tauri),release:(e=>e.release),"iconsLg.download":(e=>e.iconsLg.download),"iconsLg.github":(e=>e.iconsLg.github),"icons.plus":(e=>e.icons.plus),mockTree:(e=>e.mockTree),"'padding-left:' + (entry.depth * 12 + 8) + 'px'":(e=>"padding-left:"+(e.entry.depth*12+8)+"px"),"entry.active ? 'bg-emerald-500/10 border-l-2 border-emerald-500 -ml-px' : ''":(e=>e.entry.active?"bg-emerald-500/10 border-l-2 border-emerald-500 -ml-px":""),"iconForKind(entry.kind)":(e=>e.iconForKind(e.entry.kind)),"entry.kind === 'dir' ? 'text-amber-500/80' : entry.kind === 'image' ? 'text-blue-400' : 'text-zinc-400'":(e=>e.entry.kind==="dir"?"text-amber-500/80":e.entry.kind==="image"?"text-blue-400":"text-zinc-400"),"icons.check":(e=>e.icons.check),features:(e=>e.features),true:(e=>!0),"iconsLg[f.icon]":(e=>e.iconsLg[e.f.icon]),stack:(e=>e.stack),"s.url":(e=>e.s.url),platforms:(e=>e.platforms),"icons.externalLink":(e=>e.icons.externalLink),readme:(e=>e.readme)},data:{version:Ee,repo:ke,release:Wt,readme:`${ke}/blob/main/README.md`,year:new Date().getFullYear(),mobileNavOpen:!1,icons:Je,iconsLg:Nt,links:{courvux:"https://github.com/vanjexdev/courvux",tauri:"https://tauri.app/"},mockTree:[{name:"docs",kind:"dir",depth:0,active:!1},{name:"intro.md",kind:"md",depth:1,active:!0},{name:"setup.md",kind:"md",depth:1,active:!1},{name:"images",kind:"dir",depth:0,active:!1},{name:"logo.png",kind:"image",depth:1,active:!1},{name:"README.md",kind:"md",depth:0,active:!1},{name:"CHANGELOG.md",kind:"md",depth:0,active:!1}],features:[{icon:"layers",title:"Library + Project modes",body:"Quick-capture flat notes folder owned by the app, or open any directory as a project and edit its files in place — no copy, no slug rename, no frontmatter."},{icon:"menu",title:"Native menu bar",body:"Real File / Edit submenus with platform-native cut / copy / paste / undo / redo. Accelerators for new note, save as, open folder, export PDF."},{icon:"file",title:".md file association",body:"Double-click any Markdown file in the file manager — the running notepad imports it. Single-instance plugin keeps everything in one window."},{icon:"link",title:"Live PDF link export",body:"Bundle every .md in the project into a single PDF with real link annotations. Cross-doc references jump to the right page; URLs stay clickable."},{icon:"lock",title:"Strict CSP",body:"script-src 'self', no unsafe-eval. Build-time precompiler turns every Courvux template expression into a JS function — runtime never calls new Function."},{icon:"image",title:"Inline images + preview",body:"Markdown image links resolve via Tauri's asset:// protocol from each file's parent directory. Click any image in the tree for a full-screen preview."}],stack:[{name:"Tauri",version:"2",url:"https://tauri.app/"},{name:"Courvux",version:"0.7.1",url:"https://github.com/vanjexdev/courvux"},{name:"Tailwind",version:"4",url:"https://tailwindcss.com/"},{name:"jsPDF",version:"4",url:"https://github.com/parallax/jsPDF"},{name:"marked",version:"18",url:"https://marked.js.org/"},{name:"Prism",version:"1",url:"https://prismjs.com/"},{name:"Lucide",version:"1",url:"https://lucide.dev/"}],platforms:[{name:"Linux",formats:"rpm · deb · AppImage",cmd:`sudo dnf install ./Courvux\\ Notepad-${Ee}-1.x86_64.rpm`,note:"Fedora 40+"},{name:"macOS",formats:"dmg · app",cmd:'mv "Courvux Notepad.app" /Applications/',note:"Apple Silicon"},{name:"Windows",formats:"msi · nsis",cmd:`# build locally with:
pnpm tauri build`,note:"WebView2"}]},methods:{iconForKind(e){return e==="dir"?this.icons.folderTree:e==="image"?this.icons.image:this.icons.file}}}).mount("#app");
