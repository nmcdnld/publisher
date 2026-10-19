const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-Dm_wkiOm.js","assets/index-CNjLaYz0.js","assets/index-XU7dcohb.css","assets/index-lBxJKuoE.js"])))=>i.map(i=>d[i]);
import{l as O,c as C,_ as U}from"./index-CNjLaYz0.js";import{B as se,P as me,p as be,u as ye,m as fe,J as pe,n as J,c as ge,r as ve,s as we,f as ke,o as ie}from"./workspace-content-DlDDQGGy.js";const A="publisher-drill";function xe(e,t){var l,n,i,f;const r=new Set;let o;try{o=((l=e.getMetadata())==null?void 0:l.getAllFields())??[]}catch{return r}const a=new Set;for(const d of o)!d||t(d)||((n=d.tag)==null?void 0:n.tag("hidden"))===void 0&&a.add(((i=d.tag)==null?void 0:i.text("label"))??d.name);for(const d of o){if(!d||!t(d))continue;const p=((f=d.tag)==null?void 0:f.text("label"))??d.name;a.has(p)||r.add(p)}return r}function $(e){var r;const t=/^\s*(\d+)/.exec(((r=e.style)==null?void 0:r.gridColumn)??"");return t?t[1]:void 0}function Ce(e,t){if(t.size!==0)for(const r of e.querySelectorAll(".malloy-table")){const o=n=>n.closest(".malloy-table")===r,a=new Set;for(const n of r.querySelectorAll(".column-cell.th")){if(!o(n))continue;const i=(n.textContent??"").replace(/\u200b/g,"").trim(),f=$(n);f&&t.has(i)&&a.add(f)}if(a.size===0)continue;const l=new Set;for(const n of r.querySelectorAll(`.${A}[tabindex="0"]`)){if(!o(n))continue;const i=$(n);i&&(l.has(i)?n.tabIndex=-1:l.add(i))}for(const n of r.querySelectorAll(".column-cell.td")){if(!o(n))continue;const i=$(n),f=!n.querySelector(".value-null")&&(n.textContent??"").trim()!=="";if(i&&f&&a.has(i)&&!n.querySelector(".malloy-table")){if(n.classList.add(A),n.tabIndex===0)l.add(i);else{const d=l.has(i);d||l.add(i),n.tabIndex=d?-1:0}n.setAttribute("role","button")}}}}function Ee(e){const t=e.closest(".malloy-table"),r=$(e);return!t||!r?[]:Array.from(t.querySelectorAll(`.${A}`)).filter(o=>o.closest(".malloy-table")===t&&$(o)===r)}function de(e,t){const r=Ee(e),o=r.indexOf(e);if(o===-1)return;const a=t==="first"?r[0]:t==="last"?r[r.length-1]:r[Math.min(Math.max(o+t,0),r.length-1)];if(a){for(const l of r)l.tabIndex=l===a?0:-1;return a}}function Ae(e){return{background:e.dashboardRoot,tableBackground:e.tableBackground,tableHeaderColor:e.tableHeader,tableBodyColor:e.tableBody,tableBorder:e.border,tablePinnedBackground:e.tableHeaderBackground,tablePinnedBorder:e.pinnedBorder,tableFontSize:`${e.font.size}px`,fontFamily:e.font.family,mapColor:e.mapColor}}function Se(e){const{foreground:t,axisFaint:r,font:o}=e,a={background:e.background,font:o.family,title:{color:t,font:o.family},axis:{labelColor:t,titleColor:t,domainColor:r,tickColor:r,gridColor:r,labelFont:o.family,titleFont:o.family},legend:{labelColor:t,titleColor:t,labelFont:o.family,titleFont:o.family},header:{labelColor:t,titleColor:t},range:{category:e.series}};return l=>a}function _e(e){if(!e)return;const t=e.tag("theme");if(!t)return;const r={},o=t.tag("palette");if(o){const l={},n=o.textArray("series");n&&n.length>0&&(l.series=n);for(const i of me){const f=o.tag(i);if(!f)continue;const d={},p=f.text("light"),T=f.text("dark");p&&(d.light=p),T&&(d.dark=T),Object.keys(d).length>0&&(l[i]=d)}Object.keys(l).length>0&&(r.palette=l)}const a=t.tag("font");if(a){const l={},n=a.text("family");n&&(l.family=n);const i=a.numeric("size");typeof i=="number"&&Number.isFinite(i)&&(l.size=i),Object.keys(l).length>0&&(r.font=l)}return Object.keys(r).length>0?r:void 0}const Re=async(e,t)=>{if(typeof window>"u")throw new Error("MalloyRenderer can only be used in browser environment");const{MalloyRenderer:r}=await U(async()=>{const{MalloyRenderer:o}=await import("./index-HhufbiXX.js");return{MalloyRenderer:o}},[]);return new r({onClick:t,vegaConfigOverride:Se(e),theme:Ae(e),onError:o=>{console.error("Error rendering visualization:",typeof o,o)}}).createViz()};typeof window<"u"&&U(()=>import("./index-HhufbiXX.js"),[]);async function ze(e){if(!e||typeof e!="object")return;const t=e,r=[...Array.isArray(t.model_annotations)?t.model_annotations:[],...Array.isArray(t.source_annotations)?t.source_annotations:[],...Array.isArray(t.annotations)?t.annotations:[]].map(a=>typeof(a==null?void 0:a.value)=="string"?a.value:void 0).filter(a=>!!a);if(r.length===0)return;let o;try{({parseAnnotation:o}=await U(()=>import("./index-Dm_wkiOm.js").then(a=>a.i),__vite__mapDeps([0,1,2,3])))}catch{return}try{const{tag:a}=o(r);return _e(a)}catch(a){console.warn("Failed to parse # theme.* annotations; chart will render with the shell theme.",{error:a,lines:r});return}}function Te(e,t,r){const o=ge(t,r);for(const[a,l]of Object.entries(o))e.style.setProperty(a,l)}const je=`
/* Card geometry, through the renderer's OWN theme vars rather than over the top
   of them. It declares --malloy-theme--dashboard-* on .malloy-render itself and
   passes each through to the --malloy-render--* the card CSS reads, so a value
   inherited from our wrapper loses to that declaration however early it is set:
   this has to be a rule on the same element, at higher specificity. Doubling the
   class does that, and then no !important is needed — which matters, because
   !important here also lands on .dashboard-item-borderless and repaints a card
   the author asked to have no card. */
.malloy-render.malloy-render {
   --malloy-theme--dashboard-card-radius: var(--publisher-dashboard-card-radius);
   --malloy-theme--dashboard-card-padding: var(--publisher-dashboard-card-padding);
}
/* dashboard.css hardcodes background: #f7f9fc on .malloy-dashboard
   and .dashboard-row-header, which would paint light grey in dark
   mode and also bleed an operator-picked palette.background across
   the panel chrome in light. Both surfaces use
   --malloy-render--background here, which buildMalloyExplicitTheme
   wires to dashboardRoot: a mode-keyed neutral that stays decoupled
   from palette.background (the chart canvas) on purpose. Selectors
   are duplicated at higher specificity to beat the renderer s own
   scoped rules. */
.malloy-render .malloy-dashboard,
.malloy-render.malloy-render .malloy-dashboard,
div.malloy-render .malloy-dashboard {
   /* --publisher-dashboard-root is set on the outer Publisher wrapper
      (see buildTableCssVars) and stays decoupled from
      --malloy-render--background, which gets shadowed inside the
      renderer when a theme.background annotation is present. The
      dedicated var means the panel between tiles always paints the
      operator neutral dashboardRoot regardless of annotations. */
   background: var(--publisher-dashboard-root) !important;
   background-color: var(--publisher-dashboard-root) !important;
   color: var(--malloy-render--table-body-color) !important;
}
.malloy-render .malloy-dashboard .dashboard-row,
.malloy-render .malloy-dashboard .dashboard-row-body,
.malloy-render .malloy-dashboard .dashboard-row-header,
.malloy-render.malloy-render .malloy-dashboard .dashboard-row-header,
div.malloy-render .malloy-dashboard .dashboard-row-header {
   /* Belt + suspenders: dashboard.css hardcodes .dashboard-row-header
      to #f7f9fc, and row / row-body have no explicit background but
      get caught in any annotation-driven inline writes. Force all of
      them to the neutral panel colour. */
   background: var(--publisher-dashboard-root) !important;
   background-color: var(--publisher-dashboard-root) !important;
}
.malloy-render .malloy-dashboard .dashboard-item:not(.dashboard-item-borderless) {
   /* Tile padding around each chart / table. Uses our custom
      --malloy-render--tile-background so the operator can theme the
      tile separately from the table header row (which paints from
      --malloy-render--table-pinned-background below).

      A flat bordered card rather than the renderer's shadow ring, which is what
      makes it match the composite tile's Paper. :not(borderless) because
      # borderless asks for no card at all, and an !important background and
      border drew one anyway. */
   background: var(--malloy-render--tile-background) !important;
   color: var(--malloy-render--table-body-color) !important;
   box-shadow: none !important;
   /* The card edge, not the table gridline: --publisher-dashboard-card-border,
      the same value TileCard paints, so the renderer's card and the composite
      one are outlined identically. */
   border: var(--publisher-dashboard-card-border) !important;
}
/* The renderer's big-value card — the small card a "# big_value" measure sits
   in, several to a row inside one tile. (No backticks in here: this is inside
   a template literal.) Its own CSS gives it a 0.55px edge in
   #e5e7eb: a sub-pixel width, and a grey off the slate ramp everything else on
   the page is on. It is a dashboard card like any other, so it takes the card
   edge and stops being the one card outlined in a hairline nobody can see. */
.malloy-render .malloy-big-value-card {
   border: var(--publisher-dashboard-card-border) !important;
   /* Its shadow is a four-layer Tailwind stack, and only two of those layers
      are a shadow: the other is "0 0 0 1px #e5e7eb", a spread ring drawn as a
      second border OVER the real one. So the border above was landing
      underneath a ring in the renderer's own grey, and the card kept both a
      lifted look the flat cards around it do not have and an edge we did not
      pick. Dropped whole rather than rebuilt layer by layer: the ring's job is
      the border's job, and the border is already doing it. */
   box-shadow: none !important;
}
.malloy-render .malloy-dashboard .dashboard-row-header-separator {
   background: var(--malloy-render--table-border) !important;
}
.malloy-render .malloy-table .th.column-cell {
   /* Non-pinned tables have no header background in the renderer's
      own CSS (only pinned scrolled tables paint the pinned-header
      with this var). Force the same value here so every table has a
      visible header band reflecting the operator's choice. */
   background: var(--malloy-render--table-pinned-background) !important;
}
.malloy-render .dashboard-item-title,
.malloy-render .dashboard-dimension-name {
   color: var(--malloy-render--label-color) !important;
}
.malloy-render .dashboard-item-value,
.malloy-render .dashboard-item-value-measure,
.malloy-render .dashboard-dimension-value {
   color: var(--malloy-render--value-color) !important;
}
.malloy-render .malloy-table,
.malloy-render .malloy-list {
   color: var(--malloy-render--table-body-color) !important;
}
.malloy-render .column-cell.th,
.malloy-render .cell-content.header {
   color: var(--malloy-render--table-header-color) !important;
}
/* A cell whose column declares a "# drill" this surface can honor, marked
   by markDrillableCells. Ordinary text with a pointer cursor until hovered,
   then it reads as a link: the same affordance Malloyyo gives the same tag,
   and the only thing that tells a reader a cell navigates. Kept off the
   resting state deliberately: a column painted blue competes with the data.
   (No backticks in here: this is inside a template literal.) */
.malloy-render .${A} {
   cursor: pointer;
}
.malloy-render .${A}:hover > .cell-content {
   color: var(--publisher-drill-link) !important;
   text-decoration: underline;
}
/* Keyboard focus reads the same as hover, plus a ring: a hover colour is not
   something a keyboard user can produce, and a focus ring is not something a
   mouse user sees. focus-visible rather than focus, so a click does not leave a
   ring behind it. (No backticks in here: this is inside a template literal.) */
.malloy-render .${A}:focus-visible {
   outline: 2px solid var(--publisher-drill-link);
   outline-offset: -2px;
}
.malloy-render .${A}:focus-visible > .cell-content {
   color: var(--publisher-drill-link) !important;
   text-decoration: underline;
}
`,ce="publisher-malloy-renderer-overrides";function De(){if(typeof document>"u"||document.getElementById(ce))return;const e=document.createElement("style");e.id=ce,e.textContent=je,document.head.appendChild(e)}function Me({result:e,height:t,drill:r,onSizeChange:o,onSizing:a}){const l=C.useRef(null),n=C.useRef(r);n.current=r;const i=C.useCallback(c=>{var F;(F=n.current)==null||F.onClick(c)},[]),f=r!==void 0,d=C.useRef(!1),p=C.useRef(null),T=C.useRef(0),{theme:K,layers:W,mode:X}=be(),Y=ye().shape.borderRadius,G=C.useMemo(()=>({radius:`${Y}px`,padding:`${fe}px`}),[Y]);return C.useEffect(()=>()=>{T.current+=1;const c=p.current;c==null||c.viz.remove(),c==null||c.node.remove(),p.current=null},[]),C.useLayoutEffect(()=>{if(!l.current||!e)return;De();const c=l.current,F=T.current+=1;let q=!1;const N=()=>!q&&F===T.current;let h,b,S=null,V=0,I=null,P=null,B=null,g=null,M=null,v=null,Q=null,Z=0,j=null;d.current=!1;let E,D;const H=w=>{if(q||!w.firstElementChild||J(E,D)==="container")return;const L=ve(E,D);if(d.current&&!L)return;const z=we(w,ie(E));z>0&&(d.current=!0,o&&z!==Z&&(Z=z,o(z)));const _=ke(w,ie(E));L&&_&&Q!==_&&(Q=_,v==null||v.disconnect(),v=new ResizeObserver(()=>H(w)),v.observe(_))};return(async()=>{var te,oe;let w;try{w=JSON.parse(e)}catch(k){console.error("Error parsing visualization result:",k);return}const L=await ze(w),z=L?pe([...W,L],X):K;if(!N())return;try{b=await Re(z,i)}catch(k){console.error("Failed to create renderer:",k);return}if(!N()){b.remove(),b=void 0;return}const _=p.current;h=document.createElement("div"),h.style.width="100%",h.style.height="100%",Te(h,z,G),c.childElementCount>0&&(c.style.position="relative",h.style.position="absolute",h.style.inset="0",h.style.visibility="hidden"),c.appendChild(h);const y=h;g=new MutationObserver(()=>{M&&clearTimeout(M),M=setTimeout(()=>{H(y),d.current&&(g==null||g.disconnect())},100)}),g.observe(h,{childList:!0,subtree:!0,attributes:!0});const he=b;let ee=!1;const re=()=>{if(!(ee||!N())){ee=!0,j&&(clearTimeout(j),j=null),_==null||_.viz.remove();for(const k of Array.from(c.children))k!==y&&c.removeChild(k);y.style.position="",y.style.inset="",y.style.visibility="",c.style.position="",p.current={viz:he,node:y},H(y)}};try{b.setResult(w);try{const x=b.getMetadata(),R=x==null?void 0:x.getRootField();E=R==null?void 0:R.renderAs(),D=R?(oe=(te=x==null?void 0:x.getPluginsForField(R.key))==null?void 0:te[0])==null?void 0:oe.sizingStrategy:void 0}catch{E=void 0,D=void 0}a==null||a(J(E,D)),h.dataset.malloyRenderAs=E??"unknown",h.dataset.malloySizing=J(E,D),b.render(h);const k=n.current;try{if(k){const x=xe(b,k.canDrill),R=()=>{try{Ce(y,x)}catch(s){console.warn("Drill affordance skipped:",s)}};R();const ae=s=>{const u=s.querySelector(".cell-content")??s,m=u.getBoundingClientRect();u.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:u.ownerDocument.defaultView,clientX:Math.round(m.left+m.width/2),clientY:Math.round(m.bottom)}))},ne=s=>{var u,m;return((m=(u=s.target)==null?void 0:u.closest)==null?void 0:m.call(u,`.${A}`))??null},ue=(s,u)=>{var m;(m=de(s,u))==null||m.focus()};I=s=>{const u=ne(s);if(!u)return;const m=s.key==="ArrowDown"?1:s.key==="ArrowUp"?-1:s.key==="Home"?"first":s.key==="End"?"last":void 0;if(m!==void 0){s.preventDefault(),ue(u,m);return}s.key==="Enter"?(s.preventDefault(),ae(u)):s.key===" "&&s.preventDefault()},P=s=>{if(s.key!==" ")return;const u=ne(s);u&&(s.preventDefault(),ae(u))},B=s=>{var m,le;const u=(le=(m=s.target)==null?void 0:m.closest)==null?void 0:le.call(m,`.${A}`);u&&de(u,0)},y.addEventListener("keydown",I),y.addEventListener("keyup",P),y.addEventListener("focusin",B),x.size>0&&typeof MutationObserver<"u"&&(S=new MutationObserver(()=>{cancelAnimationFrame(V),V=requestAnimationFrame(R)}),S.observe(y,{childList:!0,subtree:!0}))}}catch(x){console.warn("Drill affordance skipped:",x)}b.onReady(re),j=setTimeout(re,1e4)}catch(k){console.error("Error rendering visualization:",k),g==null||g.disconnect(),v==null||v.disconnect(),S==null||S.disconnect(),b.remove(),b=void 0,y.parentNode===c&&c.removeChild(y)}})(),()=>{var w;q=!0,g==null||g.disconnect(),v==null||v.disconnect(),M&&clearTimeout(M),j&&clearTimeout(j),h&&((w=p.current)==null?void 0:w.node)!==h&&(I&&h.removeEventListener("keydown",I),P&&h.removeEventListener("keyup",P),B&&h.removeEventListener("focusin",B),S==null||S.disconnect(),cancelAnimationFrame(V),b==null||b.remove(),h.parentNode===c&&c.removeChild(h),c.style.position="")}},[e,i,f,o,a,K,W,X,G]),O.jsx("div",{ref:l,style:{width:"100%",height:t?`${t}px`:"400px"}})}function Le(e){return typeof window>"u"?O.jsx(se,{sx:{width:"100%",height:e.height?`${e.height}px`:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"text.secondary"},children:"Loading..."}):O.jsx(C.Suspense,{fallback:O.jsx(se,{sx:{width:"100%",height:e.height?`${e.height}px`:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"text.secondary"},children:"Loading visualization..."}),children:O.jsx(Me,{...e})})}const Fe=Object.freeze(Object.defineProperty({__proto__:null,default:Le},Symbol.toStringTag,{value:"Module"}));export{A as D,Le as R,Se as a,Ae as b,Fe as c,xe as d,Ce as m,_e as r};
