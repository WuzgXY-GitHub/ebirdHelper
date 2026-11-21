import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPage, fixture, sleep } from '../tests/harness.js';

const source = readFileSync(new URL('./eBirdHelper.personal.user.js', import.meta.url), 'utf8');
async function waitFor(predicate) {
    for (let i = 0; i < 60; i++) {
        if (predicate()) return;
        await sleep(50);
    }
    assert.ok(predicate(), 'Timed out waiting for script behavior');
}

test('独立名称，没有更新地址、远程请求或删除确认', () => {
    assert.match(source, /@name\s+eBird 添加中文鸟名（个人内嵌版）/);
    assert.match(source, /^\/\/ @downloadURL\s+none$/m);
    assert.doesNotMatch(source, /@(?:updateURL|connect)|\bfetch\s*\(|\bconfirm\s*\(/);
});

test('未见特有种红色及国家提示，普通种橙色，已见种不高亮；无需联网', async () => {
    const page = await openPage({
        source, url: 'https://ebird.org/hotspot/L1', afterLoad: true,
        html: '<body><span class="Species-common">Maleo</span><span class="Species-common">Mallard</span><span class="Species-common">Emu</span></body>',
        localStorage: { ebirdSpeciesList: [{ commonName: 'Emu', latinName: 'Dromaius novaehollandiae' }] },
    });
    try {
        assert.equal(page.scriptError, null);
        const [endemic, normal, seen] = page.document.querySelectorAll('.Species-common');
        await waitFor(() => endemic.hasAttribute('data-ebird-unseen'));
        assert.equal(endemic.style.getPropertyValue('--ebird-highlight'), '#C0262E');
        assert.equal(endemic.title, 'Endemic (ID)');
        assert.equal(endemic.getAttribute('data-ebird-endemic'), '1');
        assert.equal(normal.style.getPropertyValue('--ebird-highlight'), '#A35F00');
        assert.equal(seen.hasAttribute('data-ebird-unseen'), false);
        assert.match(endemic.textContent, /\(.*\).*\*/);
        assert.deepEqual(page.requests, []);
    } finally { page.close(); }
});

test('生涯清单直接删除本地多余种，不弹确认；接纳斜杠、乱序参数及其他参数', async () => {
    const page = await openPage({
        source, url: 'https://ebird.org/lifelist/?sortBy=date&r=world&time=life',
        html: fixture('lifelist.html'), afterLoad: true,
        localStorage: { ebirdSpeciesList: [{ commonName: 'Dodo', latinName: 'Raphus cucullatus' }] },
        confirm: () => { throw new Error('Must not ask for confirmation'); },
    });
    try {
        page.document.querySelector('#nativeNatProv').innerHTML = '<div class="Observation"><span class="Heading-main">Mallard</span><span class="Heading-sub--sci">Anas platyrhynchos</span></div>';
        await waitFor(() => page.savedSpecies()?.[0]?.commonName === 'Mallard');
        assert.deepEqual(page.savedSpecies(), [{ commonName: 'Mallard', latinName: 'Anas platyrhynchos' }]);
        assert.deepEqual(page.dialogs.map(x => x[0]), ['alert']);
        assert.deepEqual(page.requests, []);
    } finally { page.close(); }
});

test('空页面不清空本地列表', async () => {
    const existing = [{ commonName: 'Mallard', latinName: 'Anas platyrhynchos' }];
    // The harness accelerates intervals but not Date.now(); shorten the timeout for this case.
    const page = await openPage({ source: source.replace('maxWaitMs = 20000', 'maxWaitMs = 100'), url: 'https://ebird.org/lifelist', html: fixture('lifelist.html'), afterLoad: true, localStorage: { ebirdSpeciesList: existing } });
    try {
        await waitFor(() => page.logs.some(row => row.some(value => String(value).includes('页面上未找到物种'))));
        assert.deepEqual(page.savedSpecies(), existing);
        assert.deepEqual(page.dialogs, []);
    } finally { page.close(); }
});

test('内嵌拼音显示候选，回车跳到物种输入框，不请求远程数据', async () => {
    const page = await openPage({ source, url: 'https://ebird.org/submit/checklist?subID=S1', html: fixture('submit.html'), afterLoad: true });
    try {
        assert.equal(page.scriptError, null);
        const input = page.document.querySelector('#jumpToSpp');
        await waitFor(() => input.__pinyinBound);
        input.value = '@lvtouya';
        input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
        const candidate = page.document.querySelector('.__pinyin-item');
        assert.ok(candidate);
        assert.match(candidate.textContent, /Mallard.*绿头鸭/);
        input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        assert.equal(page.document.activeElement.id, 'mallar3');
        assert.deepEqual(page.requests, []);
    } finally { page.close(); }
});
