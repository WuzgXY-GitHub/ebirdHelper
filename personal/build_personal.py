"""Build the personal offline userscript without changing the upstream files."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PERSONAL = Path(__file__).resolve().parent
source = (ROOT / 'eBirdHelper.js').read_text(encoding='utf-8')

endemic = json.loads((PERSONAL / 'endemicMap.json').read_text(encoding='utf-8'))
bird_map = json.loads((ROOT / 'birdMap.json').read_text(encoding='utf-8'))
pinyin = json.loads((ROOT / 'pinyin_mapping.json').read_text(encoding='utf-8'))

header = '''// ==UserScript==
// @name         eBird 添加中文鸟名（个人内嵌版）
// @namespace    http://tampermonkey.net/
// @version      2.1.1-personal.2
// @description  中文鸟名、拼音搜索及全球和北京新种高亮，数据内嵌
// @match        https://ebird.org/*
// @grant        GM.getValue
// @downloadURL  none
// ==/UserScript==

// Based on https://github.com/wzy0421/ebirdHelper (2.1.1).
// Bird names and pinyin are embedded from the repository's 2026 tables.
// The one-country endemic table is preserved from the earlier 2.0.0 script;
// its taxonomy and country assignments have not been updated.
'''
source = header + source[source.index("const STORAGE_KEY ="):]
source = source.replace(
    "const HIGHLIGHT_COLOR = '#A35F00';",
    "const HIGHLIGHT_COLOR = '#A35F00';\n"
    "const ENDEMIC_HIGHLIGHT_COLOR = '#C0262E';\n"
    "const HIGHLIGHT_ENDEMIC = true;",
    1,
)

helpers = source[source.index('function escapeRegExp('):source.index('/** 对外暴露的获取函数 */')]
data = '\n'.join(
    f'const {name} = {json.dumps(value, ensure_ascii=False, indent=4)};'
    for name, value in [('birdMap', bird_map), ('endemicMap', endemic), ('pinyin_map', pinyin)]
)
begin = source.index('const RAW_BASE =')
end = source.index('const birdNamePattern =')
source = source[:begin] + data + '\n\n' + helpers + source[end:]

begin = source.index('/**\n * 解析生涯列表页面')
end = source.index('function getRelevantElements()', begin)
source = source[:begin] + (PERSONAL / 'lifelist.js').read_text(encoding='utf-8') + '\n' + source[end:]

begin = source.index('/**\n * 在各类 eBird 页面')
end = source.index('/**\n * 等生涯清单', begin)
source = source[:begin] + (PERSONAL / 'highlight.js').read_text(encoding='utf-8') + '\n' + source[end:]
source = source.replace('new WeakSet();', 'new WeakMap();', 1)
source = source.replace('[data-ebird-unseen]', '[data-ebird-status]')
source = source.replace('if (isLifelistPage()) {', 'const region = lifelistRegion();\n    if (region) {')
source = source.replace('whenLifelistStable(updateSpeciesFromLifelistPage);',
                        'whenLifelistStable(() => {\n                if (lifelistRegion() === region) updateSpeciesFromLifelistPage(region);\n            });')
source = source.replace('                childList: true,\n                subtree: true',
                        '                childList: true,\n                characterData: true,\n                subtree: true', 1)

begin = source.index('    const URL_MAPPING =')
end = source.index('    // lowerName', begin)
source = source[:begin] + source[end:]
begin = source.index('    /* ---------------------------------------\n       工具函数：拉取 & 缓存 pinyin mapping')
end = source.index('    function makeInitials(', begin)
source = source[:begin] + '''    // 拼音数据已内嵌，不读取远程数据或旧拼音缓存。
    function loadPinyinMapping() {
        return Promise.resolve(pinyin_map);
    }

''' + source[end:]

assert not re.search(r'@(?:updateURL|connect)|\bfetch\s*\(|\bconfirm\s*\(|GM\.\w+\s*\(', source)
dest = PERSONAL / 'eBirdHelper.personal.user.js'
dest.write_text(source.rstrip() + '\n', encoding='utf-8', newline='\n')
print(f'Built {dest}')
print(f'Data: {len(bird_map)} bird names, {len(pinyin)} pinyin entries, {len(endemic)} endemic entries')
