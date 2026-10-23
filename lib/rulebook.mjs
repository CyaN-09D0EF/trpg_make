import { Marked, Renderer } from 'marked';
import katex from 'katex';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validLink=href=>/^(https?:\/\/|mailto:|#|\/(?!\/))/.test(href);
const originalTable=new Renderer().table;
const markdown=new Marked({gfm:true,renderer:{
  html({text}){return escape(text);},
  heading({depth,text,tokens}){
    const level=Math.max(3,Math.min(6,depth));
    const section=text.match(/^(\d+)\.(\d+)/);
    return `<h${level}${section?` id="section-${section[1]}-${section[2]}"`:''}>${this.parser.parseInline(tokens)}</h${level}>`;
  },
  link({href,tokens}){
    const text=this.parser.parseInline(tokens);
    return validLink(href)?`<a href="${escape(href)}"${/^https?:/.test(href)?' target="_blank" rel="noopener noreferrer"':''}>${text}</a>`:text;
  },
  image({href,text}){return validLink(href)?`<a href="${escape(href)}" rel="noopener noreferrer">${escape(text)}</a>`:escape(text);},
  table(token){return `<div class="rulebook-table" tabindex="0" role="region" aria-label="규칙 표">${originalTable.call(this,token)}</div>`;},
},extensions:[{
  name:'rulebookMath',level:'block',
  start(src){return src.search(/\\{1,2}\[/);},
  tokenizer(src){const match=/^\\{1,2}\[\s*([\s\S]*?)\s*\\{1,2}\](?:\n|$)/.exec(src);if(match)return {type:'rulebookMath',raw:match[0],text:match[1]};},
  renderer(token){return `<div class="rulebook-formula">${katex.renderToString(token.text,{displayMode:true,throwOnError:false,trust:false,output:'htmlAndMathml'})}</div>`;},
}]});

export function renderRulebook(source){
  const text=source.replace(/\r\n/g,'\n');
  const title=text.match(/^# (.+)/)?.[1] || '신들의 문명 · 통합 룰북';
  const version=title.match(/v[\d.]+/)?.[0] || '';
  const headings=[...text.matchAll(/^## (제(\d+)장\.?\s*(.+))$/gm)];
  const opening=text.slice(text.indexOf('\n')+1,headings[0]?.index).trim().split(/\n\s*\n/);
  const subtitle=opening.shift() || '';
  const chapters=headings.map((match,index)=>{
    let body=text.slice(match.index+match[0].length,headings[index+1]?.index).trim();
    // The source uses large headings for three initial values. Present the same
    // labels and values in a compact table, without changing the source file.
    body=body.replace(/신성 레벨\s*\n\s*# (\S+)\s*\n\s*초기 신앙\s*\n\s*# (\S+)\s*\n\s*초기 소영역\s*\n\s*# (\S+)/,(_,level,faith,realm)=>`| 신성 레벨 | 초기 신앙 | 초기 소영역 |\n| --- | --- | --- |\n| ${level} | ${faith} | ${realm} |`);
    return {id:`chapter-${match[2]}`,number:match[2].padStart(2,'0'),title:match[1],label:match[3],body:markdown.parse(body)};
  });
  const contents=chapters.map(c=>`<a href="#${c.id}" data-chapter-link="${c.id}"><span>${c.number}</span>${escape(c.label)}</a>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#151c25"><meta name="description" content="신들의 문명 TRPG 통합 룰북. 신과 신관, 세계와 부족, 문명의 성장에 관한 열네 개의 장."><title>${escape(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/katex/katex.min.css"><link rel="stylesheet" href="/rulebook.css"><script type="module" src="/rulebook.js"></script></head>
<body class="rulebook-page"><a class="rulebook-skip" href="#rulebook-content">본문으로 건너뛰기</a>
<div class="rulebook-cover"><header class="landing-header rulebook-header"><a href="/" class="brand"><span class="brand-mark">✧</span><span>신들의 문명<small>CHRONICLES OF DIVINITY</small></span></a><div class="rulebook-header-links"><span>RULEBOOK ${escape(version)}</span><a href="/" class="text-button">시작 화면으로 <span aria-hidden="true">↗</span></a></div></header>
<section class="rulebook-hero" aria-labelledby="rulebook-title"><div><p class="eyebrow">THE CHRONICLES <span> / </span> RULEBOOK</p><h1 id="rulebook-title">신들의 문명<span>통합 룰북<em>${escape(version)}</em></span></h1><p class="rulebook-subtitle">${escape(subtitle)}</p><div class="rulebook-hero-actions"><a href="#chapter-1" class="button gold">첫 장 펼치기 <span aria-hidden="true">↓</span></a><a href="/rulebook.md?raw=1" download="rulebook.md" class="text-button">원문 내려받기 <span aria-hidden="true">↓</span></a></div></div><div class="rulebook-cover-art" aria-hidden="true"><div class="rulebook-orbit"></div><div class="rulebook-orbit second"></div><span>✧</span><small>THREE VOICES.<br>ONE CIVILIZATION.</small></div></section>
<div class="rulebook-cover-meta"><span>THE BOOK OF OUR WORLD</span><span>${chapters.length}개의 장 <i>·</i> 함께 만드는 문명의 규칙</span></div></div>
<main class="rulebook-layout" id="rulebook-content"><aside class="rulebook-sidebar"><div class="rulebook-toc-heading"><span class="eyebrow">CONTENTS</span><h2>세계의 차례</h2></div><label class="rulebook-search"><span>룰북 검색</span><input type="search" id="rulebook-search" placeholder="찾고 싶은 규칙은?" aria-controls="rulebook-chapters" autocomplete="off"></label><nav class="rulebook-toc" aria-label="룰북 목차">${contents}</nav><a class="rulebook-top-link" href="#rulebook-title">맨 위로 돌아가기 ↑</a></aside>
<div class="rulebook-reading"><div class="rulebook-reading-bar"><span>통합 룰북 <b>${escape(version)}</b></span><span id="rulebook-results" role="status" aria-live="polite">전체 ${chapters.length}개 장</span></div><div class="rulebook-introduction">${markdown.parse(opening.join('\n\n'))}</div><div id="rulebook-chapters">${chapters.map(c=>`<section class="rulebook-chapter" id="${c.id}" aria-labelledby="${c.id}-title"><div class="rulebook-chapter-kicker">CHAPTER ${c.number}<span></span></div><h2 id="${c.id}-title">${escape(c.title)}</h2>${c.body}</section>`).join('')}</div><div id="rulebook-empty" class="rulebook-empty" hidden><span aria-hidden="true">✧</span><h2>찾는 규칙이 없습니다</h2><p>다른 검색어로 찾아보세요.</p><button class="button outline" id="rulebook-clear">전체 룰북 보기</button></div></div></main>
<a class="rulebook-mobile-toc" href="#rulebook-content">목차 ↑</a><footer class="rulebook-footer"><a href="/">✧ 신들의 문명 TRPG</a><span>함께 만든 선택이, 함께 기억할 역사가 됩니다.</span><a href="/rulebook.md?raw=1" download="rulebook.md">원문 MD ↓</a></footer></body></html>`;
}
