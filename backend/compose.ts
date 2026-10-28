import {chromium,type Page} from 'playwright';
import {db,log} from './db.js';
let active:Page|null=null;
export async function prepareDraft(kind:'post'|'reply',text:string,source:string){
  if(!text.trim()||text.length>280)throw new Error('Draft must be 1-280 characters');
  const m=source.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/?#]+\/status\/(\d+)/i);
  if(kind==='reply'&&!m)throw new Error('Reply requires an X post URL');
  const browser=await chromium.connectOverCDP(process.env.CDP_URL||'http://127.0.0.1:9222');
  const context=browser.contexts()[0];if(!context)throw new Error('No Chrome context available');
  // Do not close the tab automatically: final submission belongs to the user.
  const page=await context.newPage();active=page;page.setDefaultTimeout(12000);
  const target=kind==='reply'?source:'https://x.com/compose/post';
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
  const candidates=kind==='reply'?
    ['[data-testid="tweetTextarea_0"]','[role="textbox"][data-testid^="tweetTextarea"]','[contenteditable="true"][role="textbox"]']:
    ['[data-testid="tweetTextarea_0"]','[role="textbox"][data-testid^="tweetTextarea"]','[contenteditable="true"][role="textbox"]'];
  let editor;
  for(const selector of candidates){const loc=page.locator(selector).first();if(await loc.isVisible().catch(()=>false)){editor=loc;break}}
  if(!editor){await page.waitForTimeout(1800);for(const selector of candidates){const loc=page.locator(selector).first();if(await loc.isVisible().catch(()=>false)){editor=loc;break}}}
  if(!editor){await page.close().catch(()=>{});throw new Error('Could not find X composer. Check login and X UI.')}
  await editor.click();
  await editor.fill(text);
  db.prepare('INSERT INTO publications(kind,text,reply_to,status) VALUES(?,?,?,?)').run(kind,text,kind==='reply'?source:null,'prepared');
  log('Draft handed to Chromium for manual publication');
  return {prepared:true,composerUrl:page.url(),message:'Draft inserted in Chromium. Review and click Post/Reply in X. No content has been submitted.'};
}
export function recordPublished(id:number,url:string){const parsed=url.match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:i\/web\/|[A-Za-z0-9_]+\/)status\/(\d+)(?:[/?#]|$)/);if(!parsed)throw new Error('Please provide the published post URL');const row=db.prepare("SELECT id FROM publications WHERE id=? AND status='prepared'").get(id);if(!row)throw new Error('Prepared draft not found');db.prepare("UPDATE publications SET status='published',url=?,x_post_id=? WHERE id=?").run(url,parsed[1],id);return {id,url}}
