const BEIJING_REGION = 'CN-11';
const BEIJING_STORAGE_KEY = 'ebirdSpeciesListCN-11';
const BEIJING_NEW_COLOR = '#16734B';
// const BEIJING_NEW_COLOR = '#8A6500'; // 北京新种的备选深黄色

const speciesByCode = new Map();
const speciesByLatin = new Map();
for (const [name, info] of Object.entries(pinyin_map)) {
    if (!Object.hasOwn(birdMap, name)) continue;
    speciesByCode.set(info.code, name);
    speciesByLatin.set(info.latin, name);
}

function speciesCode(el) {
    const link = el.closest('a') || el.querySelector('a[href*="/species/"]');
    return el.closest('[data-species-code]')?.dataset.speciesCode ||
        link?.getAttribute('href')?.match(/\/species\/([^/?#]+)/)?.[1];
}

function speciesName(commonName, latinName, code) {
    return speciesByCode.get(code) || speciesByLatin.get(latinName) || commonName;
}

function isNonSpecies(el, commonName, latinName) {
    if (/未识别的|×|[（(]\s*杂交\s*[）)]|\s[xX]\s|\bsp\./.test(commonName) ||
        commonName.includes('/') ||
        /\bsp\.|\s[a-z-]*\s*\/\s*[A-Za-z*'-]|\b[A-Z][a-z]*\s+[a-z-]+\s+x\s+[a-z-]+\b/.test(latinName)) {
        return true;
    }
    const title = el.matches('.SpecimenHeader-joined') ? el.querySelector('.Species-common, .SpecimenHeader-name, .Heading-main') || el : el;
    const weight = getComputedStyle(title).fontWeight;
    return weight === 'normal' || (weight !== '' && Number(weight) < 600);
}

function loadBeijingSpecies() {
    return JSON.parse(localStorage.getItem(BEIJING_STORAGE_KEY) || '[]');
}

function speciesMap(list) {
    return new Map(list.map(({ commonName, latinName }) => [speciesName(commonName, latinName), latinName]));
}

function sortedSpecies(map) {
    return Array.from(map, ([commonName, latinName]) => ({ commonName, latinName }))
        .sort((a, b) => a.commonName.localeCompare(b.commonName));
}

function lifelistRegion() {
    const url = new URL(location.href);
    if (url.origin !== 'https://ebird.org' || !/^\/lifelist\/?$/.test(url.pathname) ||
        !['', 'life'].includes(url.searchParams.get('time') || '') || url.searchParams.get('spp')) return null;
    const region = url.searchParams.get('r') || 'world';
    return ['world', BEIJING_REGION].includes(region) ? region : null;
}

function observationIsInBeijing(obs) {
    const place = obs.querySelector('.Observation-meta-location');
    if (!place) return false;
    return /\bCN-11\b/i.test(place.textContent) || [...place.querySelectorAll('a[href]')]
        .some(link => new URL(link.href).searchParams.get('r') === BEIJING_REGION);
}

function updateSpeciesFromLifelistPage(region) {
    const previous = speciesMap(region === BEIJING_REGION ? loadBeijingSpecies() : loadSpeciesList());
    const world = region === BEIJING_REGION ? speciesMap(loadSpeciesList()) : new Map();
    const beijing = region === BEIJING_REGION ? new Map() : speciesMap(loadBeijingSpecies());
    const page = region === BEIJING_REGION ? beijing : world;

    for (const obs of document.querySelectorAll('section#nativeNatProv .Observation')) {
        const el = obs.querySelector('.Heading-main');
        const rawName = el?.textContent.trim();
        if (!rawName) continue;
        const latinName = obs.querySelector('.Heading-sub--sci')?.textContent.trim() || '';
        if (isNonSpecies(el, rawName, latinName)) continue;
        const name = speciesName(rawName.replace(/\([^)]*\)\*?$/, '').trim(), latinName, speciesCode(el));
        page.set(name, latinName);
        if (region === 'world' && !previous.has(name) && observationIsInBeijing(obs)) {
            beijing.set(name, latinName);
        }
    }

    if (!page.size) {
        console.warn('[eBird Species Tracker] 页面上未找到物种，已跳过更新。');
        return;
    }

    let added = 0;
    let removed = 0;
    for (const name of page.keys()) if (!previous.has(name)) added++;
    for (const name of previous.keys()) if (!page.has(name) && (region !== 'world' || !beijing.has(name))) removed++;

    for (const [name, latinName] of beijing) {
        if (!world.has(name)) world.set(name, latinName);
    }
    saveSpeciesList(sortedSpecies(world));
    localStorage.setItem(BEIJING_STORAGE_KEY, JSON.stringify(sortedSpecies(beijing)));
    if (added || removed) {
        const changes = [added && `新增 ${added}`, removed && `删除 ${removed}`].filter(Boolean);
        alert(`已与${region === BEIJING_REGION ? '北京' : '全球'}生涯清单对齐：${changes.join('，')} 个物种。`);
    }
}
