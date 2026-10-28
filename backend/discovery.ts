import {chromium,type Browser,type Page} from 'playwright';
import {db,log} from './db.js';import {config} from './config.js';import {classify,RateLimitedError,aiRateLimitStatus} from './ai.js';import {installCursor,point,pointAt} from './cursor.js';
let browser:Browser|null=null;let running=false;let stop=false;let timer:NodeJS.Timeout|null=null;let lastError='';let completed=0;let activeQuery='';let nextQueryIndex=0;let xCooldownUntil=0;let xRateLimited=false;
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const xStatus=()=>({xCooldownUntil,aiCooldownUntil:aiRateLimitStatus().aiCooldownUntil});
const blocked=new Set(['home','search','explore','notifications','messages','settings','compose','i','intent','share','login','signup','hashtag','privacy','tos','help','about']);
export function extractHandle(path:string){const match=path.match(/^\/?([A-Za-z0-9_]{1,15})(?:\/?|\/status\/\d+)/);return match&&!blocked.has(match[1].toLowerCase())?match[1]:null}
async function connect(){if(!browser||!browser.isConnected())browser=await chromium.connectOverCDP(process.env.CDP_URL||'http://127.0.0.1:9222');return browser}
async function newPage(){const b=await connect();const context=b.contexts()[0];if(!context)throw new Error('No Chrome context; start Chrome with --remote-debugging-port=9222');const p=await context.newPage();p.setDefaultTimeout(12000);if(config().ui.visualCursor)await installCursor(p);return p}
async function profile(page:Page,handle:string,source:string){await page.goto('https://x.com/'+handle,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1500);const data=await page.evaluate(()=>{const primary=document.querySelector('[data-testid="primaryColumn"]')||document.body;const name=primary.querySelector('[data-testid="UserName"]')?.textContent||'';const bio=primary.querySelector('[data-testid="UserDescription"]')?.textContent||'';const followers=primary.querySelector('a[href$="/verified_followers"],a[href$="/followers"]')?.textContent||'';const following=primary.querySelector('a[href$="/following"]')?.textContent||'';const website=(primary.querySelector('[data-testid="UserUrl"] a') as HTMLAnchorElement|null)?.href||'';const posts=[...primary.querySelectorAll('article[data-testid="tweet"]')].slice(0,5).map(x=>(x.querySelector('[data-testid="tweetText"]') as HTMLElement|null)?.innerText||'').filter(Boolean);return {name,bio,followers,following,website,posts}});if(!data.name&&!data.bio&&!data.posts.length)throw new Error('Profile inaccessible or login required');const parsed=(v:string)=>{const m=v.replace(/,/g,'').match(/([\d.]+)\s*([KMB]?)/i);return m?Math.round(Number(m[1])*({K:1000,M:1000000,B:1000000000}[m[2].toUpperCase()]||1)):null};let classification={category:'uncertain',chain:'Unknown',confidence:0,reason:'AI unavailable'};try{classification=await classify({handle,...data})}catch(e){if(e instanceof RateLimitedError){classification.reason='OpenRouter rate limit: classification deferred';log('OpenRouter cooldown active until '+new Date(e.until).toLocaleTimeString(),'warn')}else log('Classification skipped for @'+handle+': '+String(e),'warn')};db.prepare(`INSERT INTO accounts(username,display_name,bio,followers,following,website,category,chain,confidence,reason,source_url,profile_url,recent_posts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,followers=excluded.followers,following=excluded.following,website=excluded.website,category=excluded.category,chain=excluded.chain,confidence=excluded.confidence,reason=excluded.reason,source_url=excluded.source_url,recent_posts=excluded.recent_posts,updated_at=CURRENT_TIMESTAMP`).run(handle,data.name,data.bio,parsed(data.followers),parsed(data.following),data.website,classification.category,classification.chain,classification.confidence,classification.reason,source,'https://x.com/'+handle,JSON.stringify(data.posts));}
export function status(){return {running,stopRequested:stop,completed,activeQuery,lastError,...xStatus()}}
export function requestStop(){stop=true;if(timer){clearTimeout(timer);timer=null}}
export async function runCycle(){
  if(running)throw new Error('Crawler already running');
  if(Date.now()<xCooldownUntil)throw new Error('X rate-limit cooldown active until '+new Date(xCooldownUntil).toLocaleTimeString());
  running=true;stop=false;lastError='';xRateLimited=false;
  const c=config();let page:Page|null=null;
  try {
    page=await newPage();
    page.on('response',response=>{
      if(response.status()===429&&/^https:\/\/(?:[^/]+\.)?(?:x|twitter)\.com\//i.test(response.url())){
        xRateLimited=true;
        xCooldownUntil=Math.max(xCooldownUntil,Date.now()+30*60*1000);
        log('X returned HTTP 429. Pausing discovery for at least 30 minutes.','warn');
      }
    });
    const seen=new Map<string,string>();
    // Spread the configured queries across cycles instead of running every query at once.
    const queries=c.discovery.queries;
    const queryBudget=Math.min(2,queries.length);
    for(let qi=0;qi<queryBudget&&!stop&&!xRateLimited;qi++){
      const query=queries[(nextQueryIndex++)%queries.length];
      activeQuery=query;
      log('Searching X: '+query);
      const response=await page.goto('https://x.com/search?q='+encodeURIComponent(query)+'&f=live',{waitUntil:'domcontentloaded',timeout:30000});
      if(response?.status()===429){xRateLimited=true;break}
      await pause(3000);
      if(xRateLimited)break;
      if(await page.locator('text=/rate limit exceeded|too many requests|try again later/i').first().isVisible().catch(()=>false)){
        xRateLimited=true;xCooldownUntil=Date.now()+30*60*1000;break
      }
      for(let n=0;n<Math.min(2,c.discovery.scrollRounds)&&!stop&&!xRateLimited;n++){
        const posts=page.locator('article[data-testid="tweet"]');
        const count=Math.min(await posts.count(),15);
        for(let i=0;i<count;i++){
          if(xRateLimited||stop)break;
          const post=posts.nth(i);
          if(i%5===0)await pointAt(page,post,'INSPECTING POSTS');
          const links=await post.locator('a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href')||''));
          const source=links.find(l=>/\/status\/\d+/.test(l))||'';
          for(const href of links){
            const handle=extractHandle(href);
            if(handle&&!seen.has(handle.toLowerCase()))seen.set(handle.toLowerCase(),source?'https://x.com'+source:'https://x.com/'+handle);
          }
        }
        if(xRateLimited||stop)break;
        await point(page,Math.round((page.viewportSize()?.width||1200)*.75),Math.round((page.viewportSize()?.height||800)*.75),'SCROLLING');
        await page.mouse.wheel(0,850);
        await pause(2400);
      }
      await pause(4000);
    }
    log('Found '+seen.size+' candidate handles');
    let processed=0;
    for(const [handle,source] of seen){
      if(stop||xRateLimited||processed>=Math.min(8,c.discovery.maxProfilesPerCycle))break;
      const existing=db.prepare('SELECT updated_at FROM accounts WHERE lower(username)=?').get(handle) as {updated_at:string}|undefined;
      if(existing&&Date.now()-new Date(existing.updated_at+'Z').getTime()<24*3600000)continue;
      try{
        await profile(page,handle,source);
        processed++;completed++;log('Saved @'+handle);
      }catch(e){log('Skipping @'+handle+': '+String(e),'warn')}
      await pause(4500);
    }
    if(xRateLimited){lastError='X rate limited; cooldown active until '+new Date(xCooldownUntil).toLocaleTimeString();log(lastError,'warn')}
  }catch(e){lastError=String(e);log(lastError,'error');throw e}
  finally{activeQuery='';running=false;await page?.close().catch(()=>{})}
}
export function startSchedule(){
  if(timer||running)return;
  const delay=Math.max(15,config().discovery.intervalMinutes)*60000;
  if(Date.now()<xCooldownUntil){
    timer=setTimeout(()=>{timer=null;if(!stop)startSchedule()},Math.max(1000,xCooldownUntil-Date.now()));
    return;
  }
  void runCycle().catch(()=>{}).finally(()=>{
    if(!stop)timer=setTimeout(()=>{timer=null;startSchedule()},Math.max(delay,xCooldownUntil-Date.now(),1000))
  });
}
