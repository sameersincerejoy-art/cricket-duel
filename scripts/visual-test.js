// ============================================================
// CRICKET DUEL — Visual verification
// Plays a full 2-over match with a real headless Chrome (player A)
// and a socket.io client (player B), screenshots every screen,
// and asserts there is NO horizontal overflow and NO overlapping
// option cards (the "nothing out of alignment" requirement).
//
// Usage:  node scripts/visual-test.js
// Output: scripts/shots/*.png
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, 'shots');
const PORT = 3012;
const URL = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Chrome discovery (Windows / macOS / Linux) ----
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function main() {
  return new Promise(async (resolve, reject) => {
    const chromePath = findChrome();
    if (!chromePath) {
      console.error('✖ Chrome not found — set CHROME_PATH to your Chrome executable');
      process.exit(1);
    }
    console.log(`Chrome: ${chromePath}`);

    // Start the production server on PORT
    const server = spawn(process.execPath, ['server/index.js'], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
    server.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));

    const waitForServer = async (tries = 40) => {
      while (tries-- > 0) {
        try {
          const res = await fetch(`${URL}/api/games`);
          if (res.ok) return true;
        } catch { /* not up yet */ }
        await sleep(300);
      }
      return false;
    };

    if (!(await waitForServer())) {
      console.error('✖ Server did not start');
      server.kill();
      process.exit(1);
    }
    console.log('✓ server up');

    fs.mkdirSync(SHOTS_DIR, { recursive: true });

    const { default: puppeteer } = await import(path.join(__dirname, '../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).catch(() =>
      import('puppeteer-core')
    );

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'],
      defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    });

    const page = await browser.newPage();
    const issues = [];

    // Horizontal overflow check — the "no misalignment" gate.
    // Only flags elements that escape the viewport AND are not inside an
    // intentional horizontal scroll container (preset chips, balls strip).
    const checkedLabels = new Set();
    async function checkOverflow(label) {
      if (checkedLabels.has(label)) return;
      checkedLabels.add(label);
      const result = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth - doc.clientWidth;
        const inScroller = (el) => {
          let n = el.parentElement;
          while (n) {
            const s = getComputedStyle(n);
            if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
            n = n.parentElement;
          }
          return false;
        };
        const bad = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          if (r.right > window.innerWidth + 1 || r.left < -1) {
            const cls = el.className || '';
            if (typeof cls === 'string' && /action-bar|over-balls|error-banner/.test(cls)) return;
            if (inScroller(el)) return;
            bad.push(`${el.tagName.toLowerCase()}.${String(cls).split(' ')[0]} x:${Math.round(r.left)}-${Math.round(r.right)}`);
          }
        });
        return { overflowX, bad: bad.slice(0, 8) };
      });
      if (result.overflowX > 0 || result.bad.length > 0) {
        issues.push(`[${label}] horizontal overflow ${result.overflowX}px | ${result.bad.join(', ')}`);
        console.error(`✖ OVERFLOW @ ${label}:`, JSON.stringify(result));
      } else {
        console.log(`✓ no overflow @ ${label}`);
      }
    }

    // Check option cards don't overlap each other
    async function checkCards(label) {
      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.option-card')];
        const bad = [];
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const a = cards[i].getBoundingClientRect();
            const b = cards[j].getBoundingClientRect();
            const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
            if (overlap && a.width > 0 && b.width > 0) bad.push(`${i}×${j}`);
          }
        }
        return bad;
      });
      if (result.length > 0) {
        issues.push(`[${label}] overlapping option-cards: ${result.join(', ')}`);
        console.error(`✖ CARD OVERLAP @ ${label}:`, result);
      } else {
        console.log(`✓ cards distinct @ ${label}`);
      }
    }

    const shot = async (name) => {
      await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
      console.log(`📸 ${name}.png`);
    };

    const waitForSel = async (sel, timeout = 25000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await page.$(sel)) return true;
        await sleep(150);
      }
      return false;
    };

    const waitForText = async (text, timeout = 25000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const has = await page.evaluate((t) => document.body.innerText.includes(t), text);
        if (has) return true;
        await sleep(150);
      }
      return false;
    };

    const click = async (sel) => {
      await page.waitForSelector(sel, { timeout: 10000 });
      await page.click(sel);
      await sleep(250);
    };

    try {
      // ---------- LOBBY ----------
      await page.goto(URL, { waitUntil: 'networkidle0', timeout: 20000 });
      await waitForSel('.lobby-title');
      await sleep(500);
      await shot('01-lobby');
      await checkOverflow('lobby');

      // ---------- CREATE ----------
      await click('.btn-primary');
      await waitForSel('.overs-grid');
      await sleep(300);
      await shot('02-create');
      await checkOverflow('create');

      // Debug: verify chips are present before clicking
      const chipDebug = await page.evaluate(() => ({
        url: location.href,
        chips: document.querySelectorAll('.overs-chip').length,
        grid: !!document.querySelector('.overs-grid'),
        text: document.body.innerText.slice(0, 200),
      }));
      console.log('chip debug:', JSON.stringify(chipDebug));
      await click('.overs-chip');
      await click('.btn-pair .btn-primary');
      await waitForSel('.match-code');
      const code = (await page.$eval('.match-code', (el) => el.textContent.trim())).replace(/\s/g, '');
      console.log(`Match code: ${code}`);

      // ---------- MATCH LOBBY ----------
      await sleep(600);
      await shot('03-match-lobby');
      await checkOverflow('match-lobby');

      // Player B joins via socket
      const ioMod = path.join(__dirname, '../client/node_modules/socket.io-client');
      const { io } = require(ioMod);
      const socketB = io(URL, { transports: ['websocket'], reconnection: false });

      const phaseLog = [];
      const bTeamIndex = 1;
      let lastOverForSelect = -1;

      const selectBowlerIfBowling = (ms) => {
        const bBowling = ms.battingTeamIndex !== undefined && ms.battingTeamIndex !== bTeamIndex;
        if (bBowling && ms.currentOver !== lastOverForSelect) {
          lastOverForSelect = ms.currentOver;
          phaseLog.push('B:select_bowler');
          socketB.emit('get_bowling_options', code, (res) => {
            if (res?.success) {
              const b = res.bowlers.find((x) => !x.exhausted);
              if (b) socketB.emit('select_bowler', code, b.index);
            }
          });
        }
      };

      socketB.on('match_state', selectBowlerIfBowling);
      socketB.on('bowler_choose_delivery', (data) => {
        phaseLog.push('B:bowler_choose');
        // B is bowling — pick the first option
        if (data.options && data.options[0]) {
          socketB.emit('choose_delivery', code, data.options[0]);
        }
      });
      socketB.on('batsman_choose_shot', (data) => {
        phaseLog.push('B:batsman_choose');
        if (data.options && data.options[0]) {
          socketB.emit('choose_shot', code, data.options[0]);
        }
      });
      socketB.on('toss_result', (data) => {
        phaseLog.push('B:toss_result');
        if (data.winnerSocketId === socketB.id) {
          setTimeout(() => socketB.emit('toss_decision', code, 'bat'), 600);
        }
      });

      await new Promise((resolve, reject) => {
        socketB.on('connect', resolve);
        socketB.on('connect_error', reject);
        setTimeout(() => reject(new Error('B connect timeout')), 8000);
      });
      socketB.emit('join_game', code, (res) => {
        if (!res?.success) {
          console.error('B join failed', res?.error);
          process.exit(1);
        }
        console.log('✓ B joined');
      });

      // Host sees opponent
      await waitForText('ready to start', 15000);
      await sleep(400);
      await shot('04-match-lobby-ready');
      await checkOverflow('match-lobby-ready');

      // ---------- TOSS ----------
      await click('.match-code-card + * button, .btn-primary');
      await waitForSel('.coin');
      await sleep(400);
      await shot('05-toss');
      await checkOverflow('toss');

      await click('.btn-pair .btn-primary'); // Heads
      await waitForSel('.toss-result-card', 15000);
      await sleep(1200);
      await shot('06-toss-result');
      await checkOverflow('toss-result');

      // If host won the toss, a decision card appears ~2s later — pick Bat.
      // If host lost, B decides and the match screen appears directly.
      const afterToss = await Promise.race([
        waitForSel('.toss-result-card .btn-pair', 8000).then((ok) => (ok ? 'decision' : null)),
        waitForSel('.match-screen', 8000).then((ok) => (ok ? 'match' : null)),
      ]);
      if (afterToss === 'decision') {
        await click('.toss-result-card .btn-primary');
        await sleep(500);
        await shot('07-toss-decision');
        await waitForSel('.match-screen', 15000);
      } else if (afterToss !== 'match') {
        throw new Error('Toss did not resolve');
      }

      // ---------- MATCH ----------
      await sleep(800);

      let finished = false;
      const shotOnce = {};
      const snap = async (name) => {
        if (shotOnce[name]) return;
        shotOnce[name] = true;
        await shot(name);
        await checkOverflow(name);
        await checkCards(name);
      };

      // Drive the browser player: whenever a decision panel is visible, act
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline && !finished) {
        await sleep(300);

        // Scorecard reached?
        if (await page.$('.result-hero-card')) {
          finished = true;
          break;
        }

        const state = await page.evaluate(() => {
          const title = document.querySelector('.panel-title')?.textContent || '';
          const actionBtn = document.querySelector('.action-bar .btn');
          const optionCards = [...document.querySelectorAll('.option-card')].filter(
            (c) => !c.classList.contains('exhausted')
          );
          return {
            title,
            hasOption: optionCards.length > 0,
            actionDisabled: actionBtn ? actionBtn.disabled : true,
            waiting: !!document.querySelector('.waiting-card'),
            inningsBreak: !!document.querySelector('.innings-break'),
            ballResult: !!document.querySelector('.ball-result'),
          };
        });

        if (state.inningsBreak) {
          await snap('12-innings-break');
          continue;
        }

        if (state.ballResult) {
          await snap('11-ball-result');
          continue;
        }

        // Field editing: the captain can reposition fielders at any point
        // (the field card is always visible). Tap one, screenshot the picker,
        // then move it to a new position.
        if (!shotOnce['15-field-edit'] && (await page.$('.field-preset-btn')) && (await page.$('.fielder-dot'))) {
          shotOnce['15-field-edit'] = true;
          await page.click('.fielder-dot');
          await sleep(500);
          if (await page.$('.pos-chip')) {
            await shot('15-field-edit');
            await checkOverflow('field-edit');
            await page.click('.pos-chip:not(.current)');
            await sleep(600);
          }
        }

        if (state.waiting) continue;

        if (state.hasOption) {
          // Snapshot the decision screens as they first appear
          if (state.title.includes('Select Bowler')) await snap('08-bowler-select');
          else if (state.title.includes('Bowl to')) await snap('09-bowling');
          else if (state.title.includes('Your Shot')) await snap('10-batting');

          if (state.actionDisabled) {
            // Nothing selected yet — pick the first unselected option
            await page.evaluate(() => {
              const cards = [...document.querySelectorAll('.option-card')].filter(
                (c) => !c.classList.contains('exhausted') && !c.classList.contains('selected')
              );
              if (cards[0]) cards[0].click();
            });
            await sleep(200);
          } else {
            // Option selected — confirm
            const btn = await page.$('.action-bar .btn');
            if (btn) await btn.click();
          }
          continue;
        }
      }

      if (!finished) {
        throw new Error('Match did not reach the scorecard in time');
      }

      // ---------- SCORECARD ----------
      await sleep(1500);
      await shot('13-scorecard');
      await checkOverflow('scorecard');

      // Open one timeline entry
      await click('.timeline-ball');
      await sleep(400);
      await shot('14-scorecard-timeline');
      await checkOverflow('scorecard-timeline');

      console.log(`\nBalls processed (B-side events): ${phaseLog.join(', ')}`);
      console.log('\n══════════════════════════════════════');
      if (issues.length === 0) {
        console.log('✅ VISUAL TEST PASSED — no overflow, no overlap');
      } else {
        console.log(`❌ ${issues.length} issue(s):`);
        issues.forEach((i) => console.log('  - ' + i));
      }
      console.log('══════════════════════════════════════');

      socketB.close();
      await browser.close();
      server.kill();
      resolve(issues.length === 0);
    } catch (err) {
      console.error('✖ Test crashed:', err.message);
      try { await page.screenshot({ path: path.join(SHOTS_DIR, '99-crash.png') }); } catch {}
      try { await browser.close(); } catch {}
      server.kill();
      reject(err);
    }
  });
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
