import type { Page, Locator } from 'playwright';

type ScoutWindow = Window & {
  __scoutCursorInstalled?: boolean;
  __scoutMove?: (x: number, y: number, label: string) => void;
};

function injectVisualCursor() {
  const win = window as ScoutWindow;
  if (win.__scoutCursorInstalled) return;
  win.__scoutCursorInstalled = true;

  function setup() {
    if (document.getElementById('__scout_cursor')) return;

    const cursor = document.createElement('div');
    cursor.id = '__scout_cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = [
      'position:fixed', 'left:40px', 'top:100px',
      'width:20px', 'height:20px', 'background:#a78bfa',
      'border:3px solid white', 'border-radius:50%',
      'box-shadow:0 0 0 7px #8b5cf633,0 0 24px #a78bfa',
      'z-index:2147483647', 'pointer-events:none',
      'transform:translate(-50%,-50%)',
      'transition:left .24s ease,top .24s ease'
    ].join(';');

    const badge = document.createElement('div');
    badge.id = '__scout_badge';
    badge.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px',
      'padding:8px 12px', 'background:#17132be8',
      'color:#e9ddff', 'border:1px solid #8b5cf6',
      'border-radius:10px', 'font:12px system-ui',
      'z-index:2147483647', 'pointer-events:none'
    ].join(';');
    badge.textContent = '● SCOUT ACTIVE';

    document.documentElement.append(cursor, badge);

    win.__scoutMove = (x, y, label) => {
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
      badge.textContent = '● ' + label;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
}

export async function installCursor(page: Page) {
  await page.addInitScript(injectVisualCursor);
  await page.evaluate(injectVisualCursor).catch(() => {});
}

export async function point(page: Page, x: number, y: number, label: string) {
  await page.evaluate(
    ({ x, y, label }) => (window as ScoutWindow).__scoutMove?.(x, y, label),
    { x, y, label }
  ).catch(() => {});
  await page.mouse.move(x, y, { steps: 12 }).catch(() => {});
}

export async function pointAt(page: Page, locator: Locator, label: string) {
  const bounds = await locator.first().boundingBox().catch(() => null);
  if (bounds) {
    await point(
      page,
      Math.round(bounds.x + bounds.width / 2),
      Math.round(bounds.y + bounds.height / 2),
      label
    );
  }
}
