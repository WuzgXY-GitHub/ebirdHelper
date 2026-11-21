import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPage, fixture, readJSON, readSource, sleep } from './harness.js';

const birdMap = readJSON('birdMap.json');
const pinyin = readJSON('pinyin_mapping.json');

const HOTSPOT = { url: 'https://ebird.org/hotspot/L109516', html: fixture('hotspot.html') };
const SUBMIT = { url: 'https://ebird.org/submit/checklist?subID=S1', html: fixture('submit.html') };
const LIFELIST_URL = 'https://ebird.org/lifelist?time=life&r=world';

function observation(commonName, latinName) {
    return `<div class="Observation"><span class="Heading-main">${commonName}</span>` +
        `<span class="Heading-sub--sci">${latinName}</span></div>`;
}

function addToLifelist(document, species) {
    document.querySelector('section#nativeNatProv')
        .insertAdjacentHTML('beforeend', species.map(([c, l]) => observation(c, l)).join(''));
}

const LIFE = [
    ['American Coot', 'Fulica americana'],
    ['Mallard', 'Anas platyrhynchos'],
    ['Northern Shoveler', 'Spatula clypeata'],
    ['Eurasian Tree Sparrow', 'Passer montanus'],
    ['Ring-necked Duck', 'Aythya collaris'],
    ['Common Ostrich', 'Struthio camelus'],
];
const asSaved = list => list.map(([commonName, latinName]) => ({ commonName, latinName }))
    .sort((a, b) => a.commonName.localeCompare(b.commonName));

// ---------- 名称替换 + 高亮 ----------

test('hotspot：英文名后加中文名，未见鸟种加星号高亮，已见的不动', async () => {
    const page = await openPage({
        ...HOTSPOT,
        localStorage: { ebirdSpeciesList: [{ commonName: 'American Coot', latinName: 'Fulica americana' }] },
    });
    try {
        assert.equal(page.scriptError, null);
        const names = [...page.document.querySelectorAll('.Species-common')];
        const [duck, shoveler, coot] = names;

        assert.equal(duck.textContent, '*' + birdMap['Ring-necked Duck']);
        assert.equal(duck.getAttribute('data-ebird-unseen'), '1');
        assert.equal(shoveler.getAttribute('data-ebird-unseen'), '1');
        assert.equal(duck.style.getPropertyValue('--ebird-highlight'), '#A35F00');
        assert.equal(duck.getAttribute('data-ebird-endemic'), '0');

        assert.equal(coot.textContent, birdMap['American Coot']);
        assert.equal(coot.hasAttribute('data-ebird-unseen'), false);
    } finally {
        page.close();
    }
});

test('单文件版本：数据已内联，不再请求 birdMap', async () => {
    const page = await openPage({ ...HOTSPOT, source: readSource('eBirdHelperSingleFile.js') });
    try {
        assert.equal(page.scriptError, null);
        assert.equal(page.document.querySelector('.Species-common').textContent, '*' + birdMap['Ring-necked Duck']);
        assert.deepEqual(page.requests.filter(r => /birdMap\.json$/.test(r.url)), []);
    } finally {
        page.close();
    }
});

test('单文件版本的 @name 与主脚本不同，Tampermonkey 里能区分', () => {
    const name = source => /^\/\/\s*@name\s+(.+?)\s*$/m.exec(source)[1];
    const names = ['eBirdHelper.js', 'eBirdHelperSingleFile.js', 'eBirdHelperSingleFile.dev.js'].map(f => name(readSource(f)));
    assert.equal(new Set(names).size, 3, names.join(' / '));
});

// ---------- 内嵌数据与更新设置 ----------

test('原有三个脚本均关闭自动更新，内嵌数据无需网络请求', async () => {
    for (const file of ['eBirdHelper.js', 'eBirdHelperSingleFile.js', 'eBirdHelperSingleFile.dev.js']) {
        const source = readSource(file);
        assert.match(source, /^\/\/ @downloadURL\s+none$/m);
        assert.doesNotMatch(source, /^\/\/\s*@(updateURL|connect)\b/m);
        const page = await openPage({ ...HOTSPOT, source });
        try {
            assert.equal(page.scriptError, null);
            assert.deepEqual(page.requests, []);
        } finally {
            page.close();
        }
    }
});

// ---------- 问题 1 / 6：@pinyin ----------

async function typeInJump(page, value) {
    const input = page.document.querySelector('#jumpToSpp');
    input.value = value;
    input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
    return input;
}

async function openSubmitWithPinyin() {
    const page = await openPage(SUBMIT);
    // 等 pinyin_mapping 加载 + collectVisibleItems
    for (let i = 0; i < 50 && !page.logs.some(l => String(l[2]).includes('已绑定')); i++) await sleep(10);
    return page;
}

test('@pinyin：用内嵌拼音数据生成候选', async () => {
    const page = await openSubmitWithPinyin();
    try {
        assert.deepEqual(page.requests, []);

        await typeInJump(page, '@' + pinyin['Mallard'].pinyin);
        const items = page.document.querySelectorAll('.__pinyin-item');
        assert.equal(items.length, 1);
        assert.match(items[0].textContent, /^Mallard/);
    } finally {
        page.close();
    }
});

test('@pinyin：点击候选跳到对应的计数输入框', async () => {
    const page = await openSubmitWithPinyin();
    try {
        await typeInJump(page, '@' + pinyin['Eurasian Tree Sparrow'].initials);
        const item = page.document.querySelector('.__pinyin-item');
        item.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true }));
        assert.equal(page.document.activeElement.id, 'eutspa');
    } finally {
        page.close();
    }
});

test('@pinyin：回车选中第一个候选', async () => {
    const page = await openSubmitWithPinyin();
    try {
        const input = await typeInJump(page, '@' + pinyin['Mallard'].pinyin);
        input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        assert.equal(page.document.activeElement.id, 'mallar3');
    } finally {
        page.close();
    }
});

// ---------- 问题 5：替换范围 ----------

test('不改动 textarea、可编辑区域和脚本里的文字，普通文字照常替换', async () => {
    const page = await openPage(SUBMIT);
    try {
        const doc = page.document;
        assert.equal(doc.querySelector('textarea').value, 'Saw a Mallard near the lake');
        assert.equal(doc.querySelector('[contenteditable="true"]').textContent, 'Mallard notes');
        assert.equal(doc.querySelector('script').textContent, 'var note = "Mallard";');
        assert.equal(doc.querySelector('#name_mallar3 span').textContent, birdMap['Mallard']);

        // 动态插入的 textarea 也不替换
        doc.body.insertAdjacentHTML('beforeend', '<textarea id="late">Mallard again</textarea>');
        await sleep(20);
        assert.equal(doc.querySelector('#late').value, 'Mallard again');
    } finally {
        page.close();
    }
});

// ---------- 问题 3 / 4：生涯清单同步 ----------

test('生涯清单陆续加载：等列表稳定后再同步，不误删', async () => {
    const page = await openPage({
        url: LIFELIST_URL, html: fixture('lifelist.html'), speed: 10,
        localStorage: { ebirdSpeciesList: asSaved(LIFE) },
    });
    try {
        // 10 倍速下每 90ms（相当于 0.9s）来一个，持续到“2 秒”以后，模拟慢速分批渲染
        for (const species of LIFE) {
            addToLifelist(page.document, [species]);
            await sleep(90);
        }
        await sleep(400);
        assert.deepEqual(page.dialogs, []);
        assert.deepEqual(page.savedSpecies(), asSaved(LIFE));
    } finally {
        page.close();
    }
});

for (const url of [
    LIFELIST_URL,
    `${LIFELIST_URL}&sortBy=taxon_order`,
    'https://ebird.org/lifelist',
    'https://ebird.org/lifelist/',
    'https://ebird.org/lifelist?sortBy=taxon_order',
    'https://ebird.org/lifelist/?sortBy=taxon_order&r=world&time=life',
    'https://ebird.org/lifelist?time=life',
    'https://ebird.org/lifelist?r=world',
    'https://ebird.org/lifelist?time=&r=',
    'https://ebird.org/lifelist?time=&r=world',
    'https://ebird.org/lifelist?time=life&r=',
]) {
    test(`生涯清单：新增物种会合并进本地列表 (${url})`, async () => {
        const page = await openPage({
            url, html: fixture('lifelist.html'), speed: 10,
            localStorage: { ebirdSpeciesList: asSaved(LIFE.slice(0, 4)) },
        });
        try {
            addToLifelist(page.document, LIFE);
            for (let attempt = 0; attempt < 40 && page.savedSpecies().length !== LIFE.length; attempt++) {
                await sleep(50);
            }
            assert.deepEqual(page.savedSpecies(), asSaved(LIFE));
            assert.deepEqual(page.dialogs.map(d => d[0]), ['alert']);
        } finally {
            page.close();
        }
    });
}

for (const url of [
    'https://ebird.org/lifelist?time=life&r=US',
    'https://ebird.org/lifelist?time=year&r=world',
    'https://ebird.org/lifelist?r=US',
    'https://ebird.org/lifelist/?time=year',
    'https://ebird.org/lifelist?time=life&r=worldwide',
    'https://ebird.org/lifelist/other?time=life&r=world',
]) {
    test(`其他清单地址不覆盖全球生涯列表 (${url})`, async () => {
        const existing = asSaved(LIFE.slice(0, 2));
        const page = await openPage({
            url, html: fixture('lifelist.html'), speed: 10,
            localStorage: { ebirdSpeciesList: existing },
        });
        try {
            addToLifelist(page.document, LIFE);
            await sleep(400);
            assert.deepEqual(page.savedSpecies(), existing);
            assert.deepEqual(page.dialogs, []);
        } finally {
            page.close();
        }
    });
}

test('生涯清单为空：不覆盖本地列表', async () => {
    const page = await openPage({
        url: LIFELIST_URL, html: fixture('lifelist.html'), speed: 40,
        source: readSource().replace('maxWaitMs = 20000', 'maxWaitMs = 100'),
        localStorage: { ebirdSpeciesList: asSaved(LIFE) },
    });
    try {
        for (let i = 0; i < 60 && !page.logs.some(row => String(row[1]).includes('页面上未找到物种')); i++) await sleep(50);
        assert.ok(page.logs.some(row => String(row[1]).includes('页面上未找到物种')));
        assert.deepEqual(page.savedSpecies(), asSaved(LIFE));
    } finally {
        page.close();
    }
});

test('脚本在 load 之后才启动时，生涯清单仍会同步', async () => {
    const page = await openPage({
        url: LIFELIST_URL, html: fixture('lifelist.html'), speed: 10, afterLoad: true,
        localStorage: { ebirdSpeciesList: asSaved(LIFE.slice(0, 2)) },
    });
    try {
        addToLifelist(page.document, LIFE);
        await waitFor(() => page.savedSpecies().length === LIFE.length);
        assert.deepEqual(page.savedSpecies(), asSaved(LIFE));
    } finally {
        page.close();
    }
});

// ---------- 北京清单与鸟种颜色 ----------

async function waitFor(predicate) {
    for (let i = 0; i < 60; i++) {
        if (predicate()) return;
        await sleep(50);
    }
    assert.ok(predicate(), 'Timed out waiting for script behavior');
}

test('未见特有种红色及国家提示，普通种橙色，已见种不高亮；无需联网', async () => {
    const page = await openPage({
        url: 'https://ebird.org/hotspot/L1', afterLoad: true,
        html: '<style>.Species-common { font-weight: bold }</style><body><span class="Species-common">Maleo</span><span class="Species-common">Mallard</span><span class="Species-common">Emu</span></body>',
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
        assert.match(endemic.textContent, /^\*Maleo\(.*\)$/);
        assert.deepEqual(page.requests, []);
    } finally { page.close(); }
});

test('生涯清单直接删除本地多余种，不弹确认；接纳斜杠、乱序参数及其他参数', async () => {
    const page = await openPage({
        url: 'https://ebird.org/lifelist/?sortBy=date&r=world&time=life',
        html: fixture('lifelist.html'), afterLoad: true,
        localStorage: { ebirdSpeciesList: [{ commonName: 'Dodo', latinName: 'Raphus cucullatus' }] },
        confirm: () => { throw new Error('Must not ask for confirmation'); },
    });
    try {
        page.document.querySelector('#nativeNatProv').innerHTML = lifeRow('Mallard', 'Anas platyrhynchos');
        await waitFor(() => page.savedSpecies()?.[0]?.commonName === 'Mallard');
        assert.deepEqual(page.savedSpecies(), [{ commonName: 'Mallard', latinName: 'Anas platyrhynchos' }]);
        assert.deepEqual(page.dialogs.map(x => x[0]), ['alert']);
        assert.deepEqual(page.requests, []);
    } finally { page.close(); }
});

const beijKey = 'ebirdSpeciesListCN-11';
const record = (commonName, latinName) => ({ commonName, latinName });
const mallard = record('Mallard', 'Anas platyrhynchos');
const emu = record('Emu', 'Dromaius novaehollandiae');
const coot = record('American Coot', 'Fulica americana');

function lifeRow(commonName, latinName, code = '', place = '') {
    return `<div class="Observation"><a data-species-code="${code}"><span class="Heading-main" style="font-weight: 700">${commonName}</span>` +
        `<span class="Heading-sub--sci">${latinName}</span></a>${place}</div>`;
}

const beijingLocation = '<div class="Observation-meta-location"><a href="/lifelist?r=CN-11&amp;time=life">CN-11</a></div>';
const loadBeijing = page => JSON.parse(page.window.localStorage.getItem(beijKey));

test('北京清单替换自身，并按物种代码把中文页面里的新种加入全球清单', async () => {
    const page = await openPage({ url: 'https://ebird.org/lifelist?time=life&r=CN-11&continue',
        html: fixture('lifelist.html'), afterLoad: true,
        localStorage: { ebirdSpeciesList: [emu], [beijKey]: [coot] },
    });
    try {
        page.document.querySelector('#nativeNatProv').innerHTML = lifeRow('绿头鸭', mallard.latinName, 'mallar3');
        await waitFor(() => loadBeijing(page)?.[0]?.commonName === mallard.commonName);
        assert.deepEqual(loadBeijing(page), [mallard]);
        assert.deepEqual(page.savedSpecies(), [emu, mallard]);
    } finally { page.close(); }
});

test('全球清单只用新增物种自己的地点补北京清单', async () => {
    const elsewhere = '<div class="Observation-meta-location"><a href="/lifelist?r=CN-12">CN-12</a></div>' +
        '<div class="Observation-tools"><a href="/lifelist?r=CN-11&amp;spp=amecoo">查看全部</a></div>';
    const page = await openPage({ url: 'https://ebird.org/lifelist', html: fixture('lifelist.html'), afterLoad: true,
        localStorage: { ebirdSpeciesList: [emu] },
    });
    try {
        page.document.querySelector('#nativeNatProv').innerHTML = lifeRow(mallard.commonName, mallard.latinName, 'mallar3', beijingLocation) +
            lifeRow(coot.commonName, coot.latinName, 'amecoo', elsewhere) + lifeRow(emu.commonName, emu.latinName, 'emu1', beijingLocation);
        await waitFor(() => page.savedSpecies().length === 3);
        assert.deepEqual(loadBeijing(page), [mallard]);
    } finally { page.close(); }
});

test('北京页面配色区分全球新种、北京新种、北京已见及非物种条目', async () => {
    const names = [
        ['Mallard', mallard.latinName, '700'], ['American Coot', coot.latinName, '700'], ['Emu', emu.latinName, '700'],
        ['未识别的鹀', '', '400'], ['spuh', 'Anas sp.', '400'], ['slash', 'Anas platyrhynchos/crecca', '400'],
        ['plain', '', '400'], ['scientific hybrid', 'Anas platyrhynchos x crecca', '400'],
        ['乘号 × 杂交', '', '400'], ['某鸭(杂交)', '', '400'],
    ];
    const listing = names.map(([name, latin, weight], i) => `<div class="Species" id="bird-${i}"><span class="Species-common" style="font-weight:${weight};color:blue">${name}</span><span class="Species-sci">${latin}</span></div>`).join('');
    for (const [url, heading] of [
        ['https://ebird.org/region/CN-11', '当前区域： Beijing (CN-11))'],
        ['https://ebird.org/hotspot/L1', '当前区域： Beijing (CN-11))<br>Beijing Olympic Forest Park'],
    ]) {
        const page = await openPage({ url, html: `<h1>${heading}</h1>${listing}`, afterLoad: true,
            localStorage: { ebirdSpeciesList: [coot, emu], [beijKey]: [emu] },
        });
        try {
            const [worldNew, beijingNew, seen, ...nonSpecies] = page.document.querySelectorAll('.Species-common');
            await waitFor(() => worldNew.dataset.ebirdStatus === 'world-new');
            assert.equal(worldNew.style.getPropertyValue('--ebird-highlight'), '#A35F00');
            assert.equal(worldNew.textContent, '*' + birdMap['Mallard']);
            assert.equal(beijingNew.style.getPropertyValue('--ebird-highlight'), '#36824B');
            assert.equal(beijingNew.textContent, birdMap['American Coot'] + '*');
            assert.equal(seen.style.color, 'blue');
            assert.equal(seen.dataset.ebirdStatus, undefined);
            for (const el of nonSpecies) {
                assert.equal(el.dataset.ebirdStatus, 'non-species', el.textContent);
                assert.equal(el.style.getPropertyValue('--ebird-highlight'), '#000000');
                assert.doesNotMatch(el.textContent, /\*/);
            }
        } finally { page.close(); }
    }
});

test('只在当前区域提示里出现 Beijing 的热点不使用北京配色', async () => {
    for (const label of ['当前区域： Beijing (CN-11))', '当前 区域 : <span>BEIJING</span>（ CN－11 ）']) {
        const page = await openPage({
            url: 'https://ebird.org/hotspot/L1', afterLoad: true,
            html: `<header>${label}</header><main><span class="Species-common" style="font-weight:700">American Coot</span><span class="Species-common" style="font-weight:700">Mallard</span></main>`,
            localStorage: { ebirdSpeciesList: [coot] },
        });
        try {
            const [seen, worldNew] = page.document.querySelectorAll('.Species-common');
            await waitFor(() => worldNew.dataset.ebirdStatus === 'world-new');
            assert.equal(seen.dataset.ebirdStatus, undefined);
            assert.equal(seen.textContent, birdMap['American Coot']);
        } finally { page.close(); }
    }
});

test('斜杠仅匹配学名里的同属并列种加词，粗体条目保留网站颜色', async () => {
    const examples = [
        ['苇鹀 (pallasi/polaris)', 'Schoeniclus pallasi [pallasi Group]', 700, 'world-new'],
        ['亚种组合', 'Schoeniclus pallasi pallasi/polaris', 700, 'world-new'],
        ['分别列出属名', 'Schoeniclus pallasi/Schoeniclus polaris', 700, 'world-new'],
        ['粗体并列种', 'Schoeniclus pallasi/polaris/aureolus', 700, undefined],
        ['普通字重并列种', 'Schoeniclus pallasi/polaris', 400, 'non-species'],
    ];
    const html = examples.map(([commonName, scientificName, weight]) => `<div class="Species"><span class="Species-common" style="font-weight:${weight}">${commonName}</span><span class="Species-sci">${scientificName}</span></div>`).join('');
    const page = await openPage({ url: 'https://ebird.org/hotspot/L1', html, afterLoad: true });
    try {
        const names = [...page.document.querySelectorAll('.Species-common')];
        await waitFor(() => names[0].dataset.ebirdStatus === 'world-new');
        assert.deepEqual(names.map(el => el.dataset.ebirdStatus), examples.map(([, , , status]) => status));
        assert.doesNotMatch(names[3].textContent, /\*/);
    } finally { page.close(); }
});

test('目标鸟种把星号放在俗名与学名之间，并使用替换后的简体字形', async () => {
    const commonName = Object.keys(birdMap).find(name => birdMap[name].includes('\u{2EB65}'));
    assert.ok(commonName);
    const latinName = pinyin[commonName].latin;
    const page = await openPage({
        url: 'https://ebird.org/targets?r=CN-11',
        html: `<div class="SpecimenHeader-joined" style="font-weight:700">${commonName} <i class="SpecimenHeader-sci">${latinName}</i></div>`,
        localStorage: { ebirdSpeciesList: [record(commonName, latinName)] },
    });
    try {
        const heading = page.document.querySelector('.SpecimenHeader-joined');
        await waitFor(() => heading.dataset.ebirdStatus === 'beijing-new');
        assert.equal(heading.textContent, `${birdMap[commonName]}* ${latinName}`);
        assert.equal(heading.querySelector('i').textContent, latinName);
    } finally { page.close(); }
});
