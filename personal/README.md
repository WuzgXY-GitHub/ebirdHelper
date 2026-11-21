# eBird 添加中文鸟名（个人内嵌版）

将 `eBirdHelper.personal.user.js` 导入 Tampermonkey。若已启用其他 eBirdHelper 版本，请只启用其中一份。

个人版沿用上游 2.1.1 和 [PR #6](https://github.com/wzy0421/ebirdHelper/pull/6) 的生涯清单地址匹配逻辑。中文鸟名、拼音和一国特有种数据均内嵌。特有种表来自旧版 2.0.0，沿用其英文名和国家归属。该版本关闭自动更新。全球生涯清单加载后会直接以页面为准重建本地列表，空列表会跳过。

在仓库根目录生成并测试：

```sh
python personal/build_personal.py
npm ci
node --test personal/personal.test.js
```
