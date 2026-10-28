import { chromium, type Page, type Locator, type Response } from 'playwright';
import { db, log } from './db.js';
import { installCursor, pointAt } from './cursor.js';

type Kind = 'post' | 'reply';
type Result = { status: 'published' | 'unconfirmed'; id: number; postId?: string; url?: string; message: string };
let busy = false;

function postIdFromResponse(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const create = obj.data && typeof obj.data === 'object'
    ? (obj.data as Record<string, unknown>).create_tweet : undefined;
  const node = create && typeof create === 'object'
    ? (create as Record<string, unknown>).tweet_results : undefined;
  const result = node && typeof node === 'object'
    ? (node as Record<string, unknown>).result : undefined;
  if (result && typeof result === 'object') {
    const id = (result as Record<string, unknown>).rest_id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return id;
  }
  return null;
}

function replyIdFromUrl(url: string): string | undefined {
  const match = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/?#]+\/status\/(\d+)(?:[/?#]|$)/i.exec(url);
  return match?.[1];
}

async function visible(page: Page, selectors: string[]): Promise<Locator> {
  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) return el;
  }
  throw new Error('X composer or button unavailable. Check that Chromium is signed into X.');
}

function persist(kind: Kind, text: string, source: string | null, status: string, error: string | null = null, postId: string | null = null) {
  const url = postId ? 'https://x.com/i/web/status/' + postId : null;
  const row = db.prepare(
    'INSERT INTO publications(kind,text,reply_to,x_post_id,url,status,error) VALUES(?,?,?,?,?,?,?)'
  ).run(kind, text, source, postId, url, status, error);
  return { id: Number(row.lastInsertRowid), url };
}

/**
 * Called ONLY by a user-confirmed dashboard action.
 * Each invocation submits ONE post/reply, not a background engagement loop.
 */
export async function publishApproved(kind: Kind, text: string, source = ''): Promise<Result> {
  if (busy) throw new Error('A publication is already in progress.');
  if (!text.trim() || text.trim().length > 280) throw new Error('Content must contain 1–280 characters.');
  const parentId = kind === 'reply' ? replyIdFromUrl(source) : undefined;
  if (kind === 'reply' && !parentId) throw new Error('A valid X post URL is required for replies.');

  busy = true;
  let page: Page | undefined;
  let attemptedSubmit = false;
  let recorded = false;
  try {
    const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    if (!context) throw new Error('No Chromium context found. Start Chrome with remote debugging.');
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await installCursor(page);
    await page.goto(kind === 'reply' ? source : 'https://x.com/compose/post', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    // For replies opened on a status page, target the inline reply form, not the main composer.
    const editorSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[role="textbox"][data-testid^="tweetTextarea"]',
      '[contenteditable="true"][role="textbox"]'
    ];
    let editor: Locator | undefined;
    for (let tries = 0; tries < 6 && !editor; tries++) {
      for (const s of editorSelectors) {
        const el = page.locator(s).first();
        if (await el.isVisible().catch(() => false)) { editor = el; break; }
      }
      if (!editor) await page.waitForTimeout(600);
    }
    if (!editor) throw new Error('X editor not found. Is the account logged in?');
    await pointAt(page, editor, 'WRITING APPROVED ' + kind.toUpperCase());
    await editor.click();
    await editor.fill(text.trim());
    const button = await visible(page, kind === 'reply'
      ? ['[data-testid="tweetButtonInline"]', '[data-testid="tweetButton"]']
      : ['[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]']);
    await pointAt(page, button, 'SUBMITTING APPROVED ' + kind.toUpperCase());

    // Observe the browser's response after the user's explicit approval, without extracting cookies.
    const created: string[] = [];
    const responseHandler = async (response: Response) => {
      if (!/\/CreateTweet(?:\?|$)|\/2\/tweets(?:\?|$)/.test(response.url())) return;
      try {
        const data = await response.json() as unknown;
        const id = postIdFromResponse(data);
        if (id) created.push(id);
      } catch { /* non-JSON, network failures or changed X response shape */ }
    };
    page.on('response', responseHandler);
    await button.click({ timeout: 12000 });
    attemptedSubmit = true;
    // X may finish its GraphQL response asynchronously after the click.
    for (let i = 0; i < 14 && created.length === 0; i++) await page.waitForTimeout(500);
    page.off('response', responseHandler);

    const id = created[0];
    if (id) {
      const row = persist(kind, text.trim(), kind === 'reply' ? source : null, 'published', null, id);
      recorded = true;
      log('Published approved ' + kind + ': ' + row.url);
      await page.close().catch(() => {});
      return { status: 'published', id: row.id, postId: id, url: row.url || undefined, message: 'Posted and confirmed on X.' };
    }

    const row = persist(kind, text.trim(), kind === 'reply' ? source : null,
      'unconfirmed', 'Clicked submit but could not verify X post ID. Check account before retrying.');
    recorded = true;
    log('Submitted ' + kind + ' but could not confirm post ID. Leaving tab open for review.', 'warn');
    return { status: 'unconfirmed', id: row.id,
      message: 'Submission clicked, but X did not return a verifiable post ID. Inspect the open X tab before retrying.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!recorded) persist(kind, text.trim(), kind === 'reply' ? source : null,
      attemptedSubmit ? 'unconfirmed' : 'failed', message);
    log('X publication error: ' + message, 'error');
    // When submission may have happened, preserve the page to prevent blind duplicate retries.
    if (!attemptedSubmit) await page?.close().catch(() => {});
    throw new Error((attemptedSubmit ? 'Submission may have succeeded; verify on X before retrying. ' : '') + message);
  } finally {
    busy = false;
  }
}
