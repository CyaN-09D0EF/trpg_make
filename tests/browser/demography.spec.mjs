import { test, expect } from '@playwright/test';
import { applyAction } from '../../lib/game.mjs';
import { createClassicGame as createGame, classicWorld as generateWorld } from '../fixtures.mjs';

test('birth reference, GM rates and housing policies drive monthly births and survive export',async({page,browser,request},testInfo)=>{
  const campaign=createGame({id:'BIR123',name:'출생 기록',seed:'birth-ui',gmName:'GM',gmHash:'old',invite:'old'});
  campaign.world=generateWorld(campaign.seed,{width:22,height:14});campaign.knowledge={god:{},priest:{}};
  applyAction(campaign,'god',{type:'create-god',name:'신',realm:'숲'});applyAction(campaign,'god',{type:'select-tribe',tribeId:'dawn'});
  applyAction(campaign,'gm',{type:'population',groups:[{race:'인간',population:1000,consumption:30}],reason:'시험 인구'});
  campaign.world.tribes[0].food.fruit=1e7;
  campaign.world.tribes[0].mortalityModifier=0; // This scenario isolates the housing/birth policy; mortality is covered separately.
  const restored=await (await request.post('/api/rooms/import',{data:{campaign,playerName:'GM'}})).json();
  const {id,token,state}=restored;
  await page.goto('/');await page.evaluate(s=>localStorage.setItem('civilization.sessions',JSON.stringify([{id:s.id,role:'gm',token:s.token}])),restored);
  await page.goto(`/r/${id}`);await page.getByRole('button',{name:'문명 관리',exact:true}).click();
  await expect(page.locator('.birth-forecast')).toContainText('월 기대 2.000명');
  await page.getByText('17종족 인구 특성 비교 · v0.3',{exact:true}).click();
  await expect(page.locator('.fertility-row')).toHaveCount(17);
  await expect(page.locator('.fertility-row').filter({hasText:'코볼트'})).toContainText('2.50');
  await page.getByRole('button',{name:'세계 지도',exact:true}).click();
  await page.getByRole('button',{name:'시험 규칙 설정'}).click();
  await expect(page.getByLabel('인간 기준 월간 출생률')).toHaveValue('0.2');
  await page.getByLabel('인간 기준 월간 출생률').fill('0.1');
  await page.getByRole('button',{name:'이 세계의 시험 설정 저장'}).click();
  await page.getByRole('button',{name:'문명 관리',exact:true}).click();
  await expect(page.locator('.birth-forecast')).toContainText('월 기대 1.000명');
  await page.getByRole('button',{name:'출생 환경 관리'}).click();
  await page.getByLabel('주거 인구 한도').fill('1001');
  await page.getByLabel('출생 환경 변경 사유').fill('주거 여유 한 명');
  await page.getByRole('button',{name:'출생 환경 저장'}).click();
  for(let month=0;month<2;month++){
    await page.getByRole('button',{name:'세계 지도',exact:true}).click();
    await page.getByRole('button',{name:/시간 진행/}).click();
    await page.getByRole('button',{name:'시간 진행 확정'}).click();
    await page.getByRole('button',{name:'문명 관리',exact:true}).click();
    await expect(page.locator('.last-births')).toContainText(`${month+1}개월 차 출생: ${month===0?1:0}명`);
  }
  await expect(page.locator('.population-composition')).toContainText('인간 1,001명');
  await expect(page.locator('.last-births')).toContainText('한도 도달');
  await page.getByRole('button',{name:'출생 환경 관리'}).click();
  await page.getByLabel('생활환경 출생 배율').fill('0');
  await page.getByLabel('주거 인구 한도').fill('');
  await page.getByLabel('출생 환경 변경 사유').fill('전쟁 중 출생 중지');
  await page.getByRole('button',{name:'출생 환경 저장'}).click();
  await expect(page.locator('.birth-forecast')).toContainText('월 기대 0.000명');
  const joined=await (await request.post(`/api/rooms/${id}/join`,{data:{role:'god',name:'신 플레이어',invite:state.invite}})).json();
  const context=await browser.newContext(),god=await context.newPage();
  await god.goto('/');await god.evaluate(s=>localStorage.setItem('civilization.sessions',JSON.stringify([{id:s.id,role:s.role,token:s.token}])),joined);
  await god.goto(`/r/${id}`);await god.getByRole('button',{name:'문명 관리',exact:true}).click();
  await expect(god.locator('.last-births')).toContainText('0명');await expect(god.getByRole('button',{name:'출생 환경 관리'})).toHaveCount(0);
  await context.close();
  await page.setViewportSize({width:390,height:844});
  await page.getByText('17종족 인구 특성 비교 · v0.3',{exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.demography-panel').screenshot({path:testInfo.outputPath('birth-reference-mobile.png')});
  const exported=await (await request.get(`/api/rooms/${id}/export`,{headers:{Authorization:`Bearer ${token}`}})).json();
  expect(exported.settings.humanBirthRate).toBe(.001);expect(exported.world.tribes[0].birthModifier).toBe(0);expect(exported.world.tribes[0].housingLimit).toBeNull();
  const reimport=await request.post('/api/rooms/import',{data:{campaign:exported,playerName:'복원 GM'}});expect(reimport.status()).toBe(201);
});
