# eBird 添加中文鸟名（个人内嵌版）

将 `eBirdHelper.personal.user.js` 导入 Tampermonkey。若已启用其他 eBirdHelper 版本，请只启用其中一份。

个人版沿用上游 2.1.1 和 [PR #6](https://github.com/wzy0421/ebirdHelper/pull/6) 的生涯清单 URL 匹配逻辑。中文鸟名、拼音和一国特有种数据均内嵌。特有种表沿用旧版 2.0.0 的英文名和国家归属。自动更新已关闭。

打开 eBird 全球生涯清单或 `r=CN-11` 的北京生涯清单可同步对应的本地列表。两者使用 eBird 的 `Native, Naturalized, or Provisional` 物种区块。北京清单中的物种也计入全球已见。全球清单中首次出现的物种若该条记录的地点包含 `CN-11`，也计入北京已见。空列表和带 `spp` 的单鸟种记录页会跳过同步。

脚本会在观鸟清单、旅行报告、热点、地区、目标鸟种、可打印清单、柱状图和提醒页面处理鸟名样式。地址含 `CN-11` 或页面出现 `Beijing` 时，全球新种为土黄色并加星，北京新种为绿色，已在北京见过的物种使用网站原有样式。非物种条目为黑色，不加星。

在仓库根目录生成并测试：

```sh
python personal/build_personal.py
npm ci
node --test personal/personal.test.js
```
