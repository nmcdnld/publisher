import{j as T,B as ae,a as p,P as ue,p as me,u as be,J as ye,h as pe,i as K,k as fe,_ as ie,l as ge,I as ve,E as we,m as ke,$ as ne}from"./index-DFgHJzmQ.js";const v="publisher-drill";function xe(e,t){const r=new Set;let o;try{o=e.getMetadata()?.getAllFields()??[]}catch{return r}const l=new Set;for(const a of o)!a||t(a)||a.tag?.tag("hidden")===void 0&&l.add(a.tag?.text("label")??a.name);for(const a of o){if(!a||!t(a))continue;const n=a.tag?.text("label")??a.name;l.has(n)||r.add(n)}return r}function B(e){const t=/^\s*(\d+)/.exec(e.style?.gridColumn??"");return t?t[1]:void 0}function Ce(e,t){if(t.size!==0)for(const r of e.querySelectorAll(".malloy-table")){const o=n=>n.closest(".malloy-table")===r,l=new Set;for(const n of r.querySelectorAll(".column-cell.th")){if(!o(n))continue;const i=(n.textContent??"").replace(/\u200b/g,"").trim(),b=B(n);b&&t.has(i)&&l.add(b)}if(l.size===0)continue;const a=new Set;for(const n of r.querySelectorAll(`.${v}[tabindex="0"]`)){if(!o(n))continue;const i=B(n);i&&(a.has(i)?n.tabIndex=-1:a.add(i))}for(const n of r.querySelectorAll(".column-cell.td")){if(!o(n))continue;const i=B(n),b=!n.querySelector(".value-null")&&(n.textContent??"").trim()!=="";if(i&&b&&l.has(i)&&!n.querySelector(".malloy-table")){if(n.classList.add(v),n.tabIndex===0)a.add(i);else{const f=a.has(i);f||a.add(i),n.tabIndex=f?-1:0}n.setAttribute("role","button")}}}}function Ae(e){const t=e.closest(".malloy-table"),r=B(e);return!t||!r?[]:Array.from(t.querySelectorAll(`.${v}`)).filter(o=>o.closest(".malloy-table")===t&&B(o)===r)}function le(e,t){const r=Ae(e),o=r.indexOf(e);if(o===-1)return;const l=t==="first"?r[0]:t==="last"?r[r.length-1]:r[Math.min(Math.max(o+t,0),r.length-1)];if(l){for(const a of r)a.tabIndex=a===l?0:-1;return l}}function Ee(e){return{background:e.dashboardRoot,tableBackground:e.tableBackground,tableHeaderColor:e.tableHeader,tableBodyColor:e.tableBody,tableBorder:e.border,tablePinnedBackground:e.tableHeaderBackground,tablePinnedBorder:e.pinnedBorder,tableFontSize:`${e.font.size}px`,fontFamily:e.font.family,mapColor:e.mapColor}}function Se(e){const{foreground:t,axisFaint:r,font:o}=e,l={background:e.background,font:o.family,title:{color:t,font:o.family},axis:{labelColor:t,titleColor:t,domainColor:r,tickColor:r,gridColor:r,labelFont:o.family,titleFont:o.family},legend:{labelColor:t,titleColor:t,labelFont:o.family,titleFont:o.family},header:{labelColor:t,titleColor:t},range:{category:e.series}};return a=>l}function Re(e){if(!e)return;const t=e.tag("theme");if(!t)return;const r={},o=t.tag("palette");if(o){const a={},n=o.textArray("series");n&&n.length>0&&(a.series=n);for(const i of ue){const b=o.tag(i);if(!b)continue;const f={},x=b.text("light"),w=b.text("dark");x&&(f.light=x),w&&(f.dark=w),Object.keys(f).length>0&&(a[i]=f)}Object.keys(a).length>0&&(r.palette=a)}const l=t.tag("font");if(l){const a={},n=l.text("family");n&&(a.family=n);const i=l.numeric("size");typeof i=="number"&&Number.isFinite(i)&&(a.size=i),Object.keys(a).length>0&&(r.font=a)}return Object.keys(r).length>0?r:void 0}const $="data-publisher-fill",_e=async(e,t)=>{if(typeof window>"u")throw new Error("MalloyRenderer can only be used in browser environment");const{MalloyRenderer:r}=await ie(async()=>{const{MalloyRenderer:o}=await import("./index-ireHUsv_.js");return{MalloyRenderer:o}},[]);return new r({onClick:t,vegaConfigOverride:Se(e),theme:Ee(e),onError:o=>{console.error("Error rendering visualization:",typeof o,o)}}).createViz()};typeof window<"u"&&ie(()=>import("./index-ireHUsv_.js"),[]);async function ze(e){if(!e||typeof e!="object")return;const t=e,r=[...Array.isArray(t.model_annotations)?t.model_annotations:[],...Array.isArray(t.source_annotations)?t.source_annotations:[],...Array.isArray(t.annotations)?t.annotations:[]].map(l=>typeof l?.value=="string"?l.value:void 0).filter(l=>!!l);if(r.length===0)return;let o;try{({parseAnnotation:o}=await fe())}catch{return}try{const{tag:l}=o(r);return Re(l)}catch(l){console.warn("Failed to parse # theme.* annotations; chart will render with the shell theme.",{error:l,lines:r});return}}function Fe(e,t,r){const o=ge(t,r);for(const[l,a]of Object.entries(o))e.style.setProperty(l,a)}const Oe=`
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
/* !important because the malloy-explorer stylesheet pins these same properties with it. */
[${$}] .malloy-table.root {
   height: 100% !important;
   align-content: start !important;
   grid-template-columns: repeat(var(--total-header-size), minmax(max-content, 1fr)) !important;
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
.malloy-render .${v} {
   cursor: pointer;
}
.malloy-render .${v}:hover > .cell-content {
   color: var(--publisher-drill-link) !important;
   text-decoration: underline;
}
/* Keyboard focus reads the same as hover, plus a ring: a hover colour is not
   something a keyboard user can produce, and a focus ring is not something a
   mouse user sees. focus-visible rather than focus, so a click does not leave a
   ring behind it. (No backticks in here: this is inside a template literal.) */
.malloy-render .${v}:focus-visible {
   outline: 2px solid var(--publisher-drill-link);
   outline-offset: -2px;
}
.malloy-render .${v}:focus-visible > .cell-content {
   color: var(--publisher-drill-link) !important;
   text-decoration: underline;
}
`,se="publisher-malloy-renderer-overrides";function je(){if(typeof document>"u"||document.getElementById(se))return;const e=document.createElement("style");e.id=se,e.textContent=Oe,document.head.appendChild(e)}function Me({result:e,height:t,drill:r,onSizeChange:o,onSizing:l,fill:a}){const n=p.useRef(null),i=p.useRef(r);i.current=r;const b=p.useCallback(c=>{i.current?.onClick(c)},[]),f=r!==void 0,x=p.useRef(!1),w=p.useRef(null),N=p.useRef(0),{theme:U,layers:W,mode:X}=me(),Y=be().shape.borderRadius,G=p.useMemo(()=>({radius:`${Y}px`,padding:`${ye}px`}),[Y]);return p.useEffect(()=>()=>{N.current+=1;const c=w.current;c?.viz.remove(),c?.node.remove(),w.current=null},[]),p.useLayoutEffect(()=>{if(!n.current||!e)return;je();const c=n.current,de=N.current+=1;let q=!1;const V=()=>!q&&de===N.current;let d,m,D=null,H=0,I=null,L=null,P=null,z=null,F=null,O=null,Q=null,Z=0,A=null;x.current=!1;let g,E;const J=k=>{if(q||!k.firstElementChild||K(g,E)==="container")return;const j=ve(g,E);if(x.current&&!j)return;const M=c.hasAttribute($);M&&c.removeAttribute($);const S=we(k,ne(g));M&&c.setAttribute($,""),S>0&&(x.current=!0,o&&S!==Z&&(Z=S,o(S)));const h=ke(k,ne(g));j&&h&&Q!==h&&(Q=h,O?.disconnect(),O=new ResizeObserver(()=>J(k)),O.observe(h))};return(async()=>{let k;try{k=JSON.parse(e)}catch(y){console.error("Error parsing visualization result:",y);return}const j=await ze(k),M=j?pe([...W,j],X):U;if(!V())return;try{m=await _e(M,b)}catch(y){console.error("Failed to create renderer:",y);return}if(!V()){m.remove(),m=void 0;return}const S=w.current;d=document.createElement("div"),d.style.width="100%",d.style.height="100%",Fe(d,M,G),c.childElementCount>0&&(c.style.position="relative",d.style.position="absolute",d.style.inset="0",d.style.visibility="hidden"),c.appendChild(d);const h=d;z=new MutationObserver(()=>{F&&clearTimeout(F),F=setTimeout(()=>{J(h),x.current&&z?.disconnect()},100)}),z.observe(d,{childList:!0,subtree:!0,attributes:!0});const ce=m;let ee=!1;const te=()=>{if(!(ee||!V())){ee=!0,A&&(clearTimeout(A),A=null),S?.viz.remove();for(const y of Array.from(c.children))y!==h&&c.removeChild(y);h.style.position="",h.style.inset="",h.style.visibility="",c.style.position="",w.current={viz:ce,node:h},J(h)}};try{m.setResult(k);try{const C=m.getMetadata(),R=C?.getRootField();g=R?.renderAs(),E=R?C?.getPluginsForField(R.key)?.[0]?.sizingStrategy:void 0}catch{g=void 0,E=void 0}l?.(K(g,E)),d.dataset.malloyRenderAs=g??"unknown",d.dataset.malloySizing=K(g,E),m.render(d);const y=i.current;try{if(y){const C=xe(m,y.canDrill),R=()=>{try{Ce(h,C)}catch(s){console.warn("Drill affordance skipped:",s)}};R();const re=s=>{const u=s.querySelector(".cell-content")??s,_=u.getBoundingClientRect();u.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:u.ownerDocument.defaultView,clientX:Math.round(_.left+_.width/2),clientY:Math.round(_.bottom)}))},oe=s=>s.target?.closest?.(`.${v}`)??null,he=(s,u)=>{le(s,u)?.focus()};I=s=>{const u=oe(s);if(!u)return;const _=s.key==="ArrowDown"?1:s.key==="ArrowUp"?-1:s.key==="Home"?"first":s.key==="End"?"last":void 0;if(_!==void 0){s.preventDefault(),he(u,_);return}s.key==="Enter"?(s.preventDefault(),re(u)):s.key===" "&&s.preventDefault()},L=s=>{if(s.key!==" ")return;const u=oe(s);u&&(s.preventDefault(),re(u))},P=s=>{const u=s.target?.closest?.(`.${v}`);u&&le(u,0)},h.addEventListener("keydown",I),h.addEventListener("keyup",L),h.addEventListener("focusin",P),C.size>0&&typeof MutationObserver<"u"&&(D=new MutationObserver(()=>{cancelAnimationFrame(H),H=requestAnimationFrame(R)}),D.observe(h,{childList:!0,subtree:!0}))}}catch(C){console.warn("Drill affordance skipped:",C)}m.onReady(te),A=setTimeout(te,1e4)}catch(y){console.error("Error rendering visualization:",y),z?.disconnect(),O?.disconnect(),D?.disconnect(),m.remove(),m=void 0,h.parentNode===c&&c.removeChild(h)}})(),()=>{q=!0,z?.disconnect(),O?.disconnect(),F&&clearTimeout(F),A&&clearTimeout(A),d&&w.current?.node!==d&&(I&&d.removeEventListener("keydown",I),L&&d.removeEventListener("keyup",L),P&&d.removeEventListener("focusin",P),D?.disconnect(),cancelAnimationFrame(H),m?.remove(),d.parentNode===c&&c.removeChild(d),c.style.position="")}},[e,b,f,o,l,U,W,X,G]),T.jsx("div",{ref:n,...a?{[$]:""}:{},style:{width:"100%",height:t?`${t}px`:"400px"}})}function Te(e){return typeof window>"u"?T.jsx(ae,{sx:{width:"100%",height:e.height?`${e.height}px`:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"text.secondary"},children:"Loading..."}):T.jsx(p.Suspense,{fallback:T.jsx(ae,{sx:{width:"100%",height:e.height?`${e.height}px`:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"text.secondary"},children:"Loading visualization..."}),children:T.jsx(Me,{...e})})}const Be=Object.freeze(Object.defineProperty({__proto__:null,default:Te},Symbol.toStringTag,{value:"Module"}));export{v as D,Te as R,Se as a,Ee as b,Be as c,xe as d,Ce as m,Re as r};
