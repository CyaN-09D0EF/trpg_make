const chapters=[...document.querySelectorAll('.rulebook-chapter')];
const links=[...document.querySelectorAll('[data-chapter-link]')];
const input=document.querySelector('#rulebook-search');
const status=document.querySelector('#rulebook-results');
const text=new Map(chapters.map(chapter=>[chapter.id,chapter.textContent.normalize('NFKC').toLocaleLowerCase('ko-KR')]));
function setActive(id){for(const link of links)if(link.dataset.chapterLink===id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
function search(){
  const query=input.value.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  const terms=query.split(/\s+/).filter(Boolean);
  let count=0;
  for(const chapter of chapters){chapter.hidden=!terms.every(term=>text.get(chapter.id).includes(term));if(!chapter.hidden)count++;}
  for(const link of links)link.hidden=document.getElementById(link.dataset.chapterLink).hidden;
  document.querySelector('.rulebook-introduction').hidden=!!query;
  document.querySelector('#rulebook-empty').hidden=count>0;
  status.textContent=query?`검색 결과 ${count}개 장`:`전체 ${chapters.length}개 장`;
  updateActive();
}
function updateActive(){
  const visible=chapters.filter(chapter=>!chapter.hidden);
  const current=[...visible].reverse().find(chapter=>chapter.getBoundingClientRect().top<=130) || visible[0];
  setActive(current?.id);
}
input.addEventListener('input',search);
document.querySelector('#rulebook-clear').addEventListener('click',()=>{input.value='';search();input.focus();});
let scheduled=false;
window.addEventListener('scroll',()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{updateActive();scheduled=false;});},{passive:true});
window.addEventListener('hashchange',updateActive);
document.querySelector('.rulebook-hero-actions a').addEventListener('click',()=>{if(input.value){input.value='';search();}});
for(const link of links)link.addEventListener('click',()=>setActive(link.dataset.chapterLink));
window.addEventListener('pageshow',search);
search();
