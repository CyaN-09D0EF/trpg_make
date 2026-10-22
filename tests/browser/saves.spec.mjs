import { test, expect } from '@playwright/test';

test('main screen selects saved campaigns, refreshes authenticated summaries, explains missing saves and resumes on mobile', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button',{name:'저장된 게임 이어하기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'저장된 게임 선택'})).toBeVisible();
  await expect(page.locator('#saved-game-list')).toContainText('저장된 게임이 없습니다');
  await expect(page.locator('#saved-game-detail').getByRole('button',{name:'기록 불러오기'})).toBeVisible();
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  const first=await (await request.post('/api/rooms',{data:{name:'첫 번째 세계',playerName:'GM'}})).json();
  const second=await (await request.post('/api/rooms',{data:{name:'계속할 세계',playerName:'GM'}})).json();
  await request.post(`/api/rooms/${second.id}/actions`,{headers:{Authorization:`Bearer ${second.token}`},data:{type:'advance',hours:744}});
  const saved=[
    {id:first.id,token:first.token,role:'gm',name:'예전 표시 이름'},
    {id:second.id,token:second.token,role:'gm',name:'계속할 세계'},
    {id:first.id,token:'expired-token',role:'priest',name:'권한이 바뀐 세계'},
    ...Array.from({length:6},(_,i)=>({id:`ZZZZZ${i}`,token:'missing-token',role:'gm',name:`이전 서버 세계 ${i+1}`})),
  ];
  await page.evaluate(values=>localStorage.setItem('civilization.sessions',JSON.stringify(values)),saved);
  await page.reload();
  await page.getByRole('button',{name:'저장된 게임 이어하기',exact:true}).click();
  await expect(page.locator('.saved-game-option')).toHaveCount(9);
  await expect(page.locator('.saved-game-option').first()).toContainText('첫 번째 세계');
  await expect(page.locator('#saved-game-detail')).toContainText('60 × 38');
  await expect(page.getByRole('button',{name:'선택한 세계 이어하기'})).toBeEnabled();
  await page.locator('.saved-game-option').filter({hasText:'이전 서버 세계 6'}).click();
  await expect(page.locator('#saved-game-detail')).toContainText('이 서버에 저장된 세계가 없습니다');
  await expect(page.getByRole('button',{name:'선택한 세계 이어하기'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'기록 JSON으로 복원'})).toBeVisible();
  await page.locator('.saved-game-option').filter({hasText:'권한이 바뀐 세계'}).click();
  await expect(page.locator('#saved-game-detail')).toContainText('새 초대 링크');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.saved-game-option').filter({hasText:'계속할 세계'}).click();
  await expect(page.locator('#saved-game-detail')).toContainText('2개월 차 · 2일');
  await expect(page.locator('#saved-game-detail')).toContainText('마지막 자동 저장');
  await expect(page.getByRole('button',{name:'선택한 세계 이어하기'})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('saved-game-picker-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'선택한 세계 이어하기'}).click();
  await expect(page).toHaveURL(new RegExp(`/r/${second.id}$`));
  await expect(page.locator('.room-label')).toContainText('계속할 세계');
  await expect(page.locator('.date-badge')).toContainText('2개월 차');
  await page.reload();
  await expect(page.locator('.room-label')).toContainText('계속할 세계');
  await page.getByRole('button',{name:'시작 화면으로'}).click();
  await page.getByRole('button',{name:'저장된 게임 이어하기',exact:true}).click();
  await expect(page.locator('.saved-game-option').first()).toContainText('계속할 세계');
  await expect(page.locator('.saved-game-option')).toHaveCount(9);
});
