# ebirdHelper
TamperMonkey script for enhancing experience of ebird website.

The feature of this script include:
- Append Chinese common name after English common name.
- Highlight unseen species and keep separate worldwide and Beijing life lists in the browser.
- Type `@` plus pinyin or its initials in the "Jump to Species" box of a checklist to jump to a species by its Chinese name.

The names come from eBird's Simplified Chinese (zh_SIM_CN) name list, which follows the current
eBird taxonomy, so every species has a Chinese name.

`birdMap.json` and `pinyin_mapping.json` are copies of the name tables kept in the bird_data repo,
which also holds the name list and the scripts that build them; `VENDORED.toml` records which
version each copy is. Change them there and copy them here again.

## 安装与构建

将根目录的 `eBirdHelper.js` 导入 Tampermonkey。原有的 `eBirdHelperSingleFile.js` 和 `eBirdHelperSingleFile.dev.js` 也可安装，启用其中一份即可。三个脚本均内嵌数据并关闭自动更新。

打开全球或北京（`r=CN-11`）生涯清单可同步浏览器中的对应记录。北京已见也计入全球已见。全球清单中的新增物种若条目地点为 `CN-11`，也计入北京已见。北京相关页面用土黄色加星标记全球新种、绿色无星标记北京新种。非物种和杂交条目用黑色显示，不加星。一国特有种表沿用旧版的分类与国家归属。

修改脚本或数据后，在根目录运行 `python scripts/build_single_file.py` 生成两个单文件版本和 Chrome 扩展。

## 测试

```
npm install
npm test
```

测试使用 jsdom 模拟 Tampermonkey，检查内嵌数据、清单同步、页面配色和拼音跳转。热点页面样例来自网站，提交清单和生涯清单样例按网站结构构造。

Tampermonkey 的执行环境本身测不到，仍需在浏览器里确认。
用 `EBH_SOURCE=<文件>` 可以拿别的版本跑同一套测试来对比。
