// Resolution-independent button drawings. No screenshots, raster textures or image loads.
const svg=(name:string,content:string)=>`<span class="booster-art ${name}-art"><svg viewBox="0 0 128 94" aria-hidden="true" focusable="false">${content}</svg></span>`;

export const vipIcon=svg('vip',`
<defs>
 <linearGradient id="vip-gold" x2=".25" y2="1"><stop stop-color="#fff48a"/><stop offset=".42" stop-color="#ffc038"/><stop offset="1" stop-color="#eb7c0d"/></linearGradient>
 <linearGradient id="vip-paint" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#ffdc5c"/><stop offset=".5" stop-color="#ff9417"/><stop offset="1" stop-color="#db5a0c"/></linearGradient>
 <linearGradient id="vip-glass" x2=".7" y2="1"><stop stop-color="#86451f"/><stop offset=".4" stop-color="#572917"/><stop offset="1" stop-color="#bb7134"/></linearGradient>
 <linearGradient id="vip-silver" x2="0" y2="1"><stop stop-color="white"/><stop offset=".5" stop-color="#e8f4fa"/><stop offset="1" stop-color="#8ea8b5"/></linearGradient>
</defs>
<ellipse cx="65" cy="78" rx="45" ry="8" fill="#315675" opacity=".15"/>
<g transform="translate(96 23) rotate(15)">
 <ellipse cy="4" rx="22" ry="13" fill="#ce7714"/>
 <ellipse rx="22" ry="13" fill="url(#vip-gold)" stroke="#ffe293" stroke-width="1.5"/>
 <ellipse rx="16" ry="8.5" fill="#81939c" stroke="url(#vip-silver)" stroke-width="3"/>
 <path d="M-3-1-10-5-6-7 3-2 12-4 14 0 4 2 7 6 2 7-3 2-13 3-14-1Z" fill="url(#vip-silver)"/>
 <ellipse rx="3.5" ry="2.8" fill="#fff5b5"/>
</g>
<path d="m39 48 35-16 34 26-30 25-41-24Z" fill="#b9540b"/>
<ellipse cx="49" cy="65" rx="7" ry="10" transform="rotate(-22 49 65)" fill="#354454"/>
<ellipse cx="94" cy="68" rx="7" ry="10" transform="rotate(-22 94 68)" fill="#354454"/>
<ellipse cx="96" cy="68" rx="3" ry="5" transform="rotate(-22 96 68)" fill="url(#vip-silver)"/>
<path d="M35 38 62 25Q67 23 73 28L100 49Q111 57 108 66L86 81Q81 85 75 80L36 56Z" fill="url(#vip-paint)" stroke="#e88413" stroke-width="1.4"/>
<path d="m37 39 9-20 22-10 24 18 4 20-25 17Z" fill="url(#vip-paint)" stroke="#ffca55" stroke-width="1.5"/>
<path d="m47 21 20-8 19 14-19 10Z" fill="#ffc250"/>
<path d="m45 24-5 14 13 10 2-18Z" fill="url(#vip-glass)" stroke="#f6bd5b" stroke-width="2"/>
<path d="m59 31 8 9-1 17-10-7Z" fill="url(#vip-glass)" stroke="#ffbf51" stroke-width="2"/>
<path d="m70 40 17-10 5 15-20 12Z" fill="url(#vip-glass)" stroke="#ffd376" stroke-width="2.5"/>
<path d="m76 60 18-11 12 10-19 13Z" fill="#ffa824"/>
<path d="m80 78 26-15" fill="none" stroke="#c16410" stroke-width="5" stroke-linecap="round"/>
<path d="m82 79 23-13" fill="none" stroke="url(#vip-silver)" stroke-width="3.5" stroke-linecap="round"/>
<path d="m81 68 6 4-1 7-7-4Z" fill="#fff8cd"/><path d="m101 57 6 4-1 5-6-3Z" fill="#fff8cd"/>
<path d="m45 20 22-9 22 16" fill="none" stroke="#fff19a" stroke-width="2" stroke-linecap="round"/>
<g transform="translate(27 63) rotate(-10)">
 <ellipse cy="4" rx="23" ry="15" fill="#d47b15"/>
 <ellipse rx="23" ry="15" fill="url(#vip-gold)" stroke="#fff09b" stroke-width="1.5"/>
 <ellipse rx="17" ry="10" fill="#7b959f" stroke="url(#vip-silver)" stroke-width="3"/>
 <path d="M-3-2-12-6-7-9 3-3 12-6 15-1 4 2 8 7 3 9-3 3-14 5-15 0Z" fill="url(#vip-silver)"/>
 <ellipse rx="4" ry="3.2" fill="#fff4bd"/>
</g>`);

const person=(x:number,y:number,color:string)=>`<g transform="translate(${x} ${y})"><ellipse cy="10" rx="5" ry="2" fill="#315675" opacity=".18"/><path d="M-2 5-3 10M2 5 3 10" stroke="${color}" stroke-width="3" stroke-linecap="round"/><rect x="-4" y="-1" width="8" height="8" rx="3" fill="${color}"/><circle cy="-4" r="4.5" fill="${color}"/><path d="M-2-6 0-7" stroke="white" stroke-width="1.6" opacity=".45" stroke-linecap="round"/></g>`;
export const arrangeIcon=svg('arrange',`
<defs>
 <linearGradient id="arrange-roof" x2=".4" y2="1"><stop stop-color="#fff678"/><stop offset=".5" stop-color="#ffd039"/><stop offset="1" stop-color="#ed960b"/></linearGradient>
 <linearGradient id="arrange-side" x2="0" y2="1"><stop stop-color="#ffce36"/><stop offset="1" stop-color="#e7980c"/></linearGradient>
 <linearGradient id="arrange-glass" x2=".5" y2="1"><stop stop-color="#678275"/><stop offset=".35" stop-color="#314c49"/><stop offset="1" stop-color="#20353d"/></linearGradient>
 <linearGradient id="arrange-front" x2="1" y2="1"><stop stop-color="#ffe34b"/><stop offset="1" stop-color="#f4a711"/></linearGradient>
</defs>
<ellipse cx="69" cy="79" rx="43" ry="8" fill="#315675" opacity=".15"/>
<path d="m27 20 23-12 54 20 9 38-23 17-61-27Z" fill="#c68109"/>
<path d="m28 22 59 24 4 34-60-26Z" fill="url(#arrange-side)" stroke="#e5a115" stroke-width="1.5"/>
<path d="m87 43 17-12 9 35-22 14Z" fill="url(#arrange-front)" stroke="#d7940d" stroke-width="1.5"/>
<path d="m27 20 22-13 56 20-18 18Z" fill="url(#arrange-roof)" stroke="#ffd858" stroke-width="2" stroke-linejoin="round"/>
<path d="m30 19 20-10 50 18" fill="none" stroke="#fff198" stroke-width="2.5" stroke-linecap="round"/>
<path d="m33 28 12 5 1 17-12-5ZM49 34l12 5 1 17-12-5ZM65 40l13 5 2 17-14-6Z" fill="url(#arrange-glass)" stroke="#fff084" stroke-width="1.5"/>
<path d="m91 45 11-8 5 21-14 10Z" fill="url(#arrange-glass)" stroke="#ffe178" stroke-width="2"/>
<path d="m46 47 16 7 1 18-17-7Z" fill="#6c622b"/><path d="m49 51 10 4 1 13-11-5Z" fill="#304851"/>
<path d="m47 65 13 5-3 4-14-5Z" fill="#ffe066"/>
<ellipse cx="38" cy="60" rx="6" ry="9" transform="rotate(-16 38 60)" fill="#344754"/><ellipse cx="38" cy="60" rx="3" ry="5" fill="#c4d8df"/>
<ellipse cx="81" cy="77" rx="6" ry="9" transform="rotate(-16 81 77)" fill="#344754"/><ellipse cx="81" cy="77" rx="3" ry="5" fill="#c4d8df"/>
<path d="m95 73 14-9" stroke="#d4e1dd" stroke-width="3" stroke-linecap="round"/>
<path d="m95 65 4-2 1 5-4 2ZM106 58l4-2 1 4-4 3Z" fill="#fffce1"/>
${person(42,58,'#ef42ae')}${person(53,64,'#44cf32')}${person(31,66,'#209eea')}${person(41,73,'#ef42ae')}${person(21,76,'#ed479e')}${person(30,83,'#ffc32a')}${person(14,84,'#25aef1')}`);

export const changerIcon=svg('changer',`
<defs><linearGradient id="changer-gold" x2=".2" y2="1"><stop stop-color="#fff27b"/><stop offset=".45" stop-color="#ffd135"/><stop offset="1" stop-color="#f5a612"/></linearGradient></defs>
<ellipse cx="64" cy="82" rx="35" ry="6" fill="#315675" opacity=".15"/>
<g stroke-linejoin="round">
 <path d="M24 37h57V24l24 22-24 22V55H24Z" fill="#c17b0d" stroke="#c17b0d" stroke-width="4" transform="translate(0 4)"/>
 <path d="M24 33h57V20l24 22-24 22V51H24Z" fill="url(#changer-gold)" stroke="#e9a322" stroke-width="1.5"/>
 <path d="M26 35h57V24l18 16" fill="none" stroke="#fff6ac" stroke-width="2.5"/>
 <path d="M104 62H47V49L23 71l24 22V80h57Z" fill="#bd760c" stroke="#bd760c" stroke-width="3"/>
 <path d="M104 57H47V44L23 66l24 22V75h57Z" fill="url(#changer-gold)" stroke="#e9a322" stroke-width="1.5"/>
 <path d="M102 59H45V49L27 66" fill="none" stroke="#fff6ac" stroke-width="2.5"/>
</g>`);
