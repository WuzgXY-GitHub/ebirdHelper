function isBeijingPage() {
    return /CN-11/i.test(location.href) || /Beijing/i.test(document.title) ||
        /Beijing/i.test(document.body.innerText ?? document.body.textContent);
}

function highlightUnseenSpecies() {
    const targets = ENABLE_PARTIAL_MATCH ? getRelevantElements() : [];
    if (!targets.length) return;
    const inBeijing = isBeijingPage();
    const seenWorld = speciesMap(loadSpeciesList());
    const seenBeijing = inBeijing ? speciesMap(loadBeijingSpecies()) : new Map();

    for (const el of targets) {
        const previous = markedSet.get(el);
        const star = previous?.star;
        const rawName = el.textContent.trim();
        const commonName = el.querySelector('.Species-common, .SpecimenHeader-name, .Heading-main')?.textContent.trim() || rawName;
        const latinName = (el.querySelector(SCIENTIFIC_NAME_SELECTOR) ||
            el.parentElement?.querySelector(SCIENTIFIC_NAME_SELECTOR) ||
            el.closest('.Observation-species, .Species, .SpecimenHeader')?.querySelector(SCIENTIFIC_NAME_SELECTOR))?.textContent.trim() || '';
        const code = speciesCode(el);
        const name = speciesName(extractCleanName(commonName.replace(/\s*\*$/, '')), latinName, code);
        const nonSpecies = isNonSpecies(el, commonName, latinName);
        const signature = JSON.stringify([commonName.replace(/\*$/, ''), latinName, code, inBeijing, nonSpecies,
            seenWorld.has(name), seenBeijing.has(name)]);
        if (signature === previous?.signature) continue;
        if (star?.parentNode === el) star.remove();
        if (previous?.endemicTitle && el.title === previous.endemicTitle) el.title = previous.originalTitle;
        el.removeAttribute('data-ebird-status');
        el.removeAttribute('data-ebird-unseen');
        el.removeAttribute('data-ebird-endemic');
        el.style.removeProperty('--ebird-highlight');

        const state = { signature };
        markedSet.set(el, state);
        const worldNew = !seenWorld.has(name) && !seenBeijing.has(name);
        const beijingNew = inBeijing && !seenBeijing.has(name) && !worldNew;
        if (!nonSpecies && !worldNew && !beijingNew) continue;

        ensureHighlightCSS();
        el.setAttribute('data-ebird-status', nonSpecies ? 'non-species' : worldNew ? 'world-new' : 'beijing-new');
        if (nonSpecies) {
            el.style.setProperty('--ebird-highlight', '#000000');
            continue;
        }
        if (beijingNew) {
            el.style.setProperty('--ebird-highlight', BEIJING_NEW_COLOR);
            continue;
        }

        const countryCode = Object.hasOwn(endemicMap, name) ? endemicMap[name] : '';
        el.setAttribute('data-ebird-unseen', '1');
        el.setAttribute('data-ebird-endemic', countryCode ? '1' : '0');
        el.style.setProperty('--ebird-highlight',
            !inBeijing && countryCode && HIGHLIGHT_ENDEMIC ? ENDEMIC_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR);
        if (!inBeijing && countryCode && HIGHLIGHT_ENDEMIC && !/Endemic \([A-Z]{2}\)/.test(el.title)) {
            state.originalTitle = el.title;
            state.endemicTitle = `${el.title ? `${el.title} | ` : ''}Endemic (${countryCode})`;
            el.title = state.endemicTitle;
        }
        if (!el.textContent.includes('*')) {
            state.star = document.createTextNode('*');
            el.appendChild(state.star);
        }
    }
}

const SCIENTIFIC_NAME_SELECTOR = '.Heading-sub--sci, .Species-sci, .SpecimenHeader-sci, .SciName, [data-scientific-name]';
