# Loon Local Rules

来源：
- `/Users/vicliu/Library/Mobile Documents/iCloud~com~ruikq~decar/Documents/Configs/default.lcf`
- 仅拆分 `[Rule]` 段中的本地规则

拆分原则：
- 按策略组拆分，便于远程规则单独引用
- 已去重
- 暂不改动现有 `Loon/self_*` 文件

文件说明：
- `direct.list`: `DIRECT`
- `reject.list`: `REJECT`
- `reject_no_drop.list`: `REJECT-NO-DROP`
- `hk_manual.list`: `香港手动`
- `hk_urltest.list`: `香港时延优选`
- `jp_manual.list`: `日本手动`
- `us_manual.list`: `美国手动`
- `global_manual.list`: `全球手动`
- `uk_manual.list`: `英国手动`
- `de_manual.list`: `德国手动`
- `au_manual.list`: `澳洲手动`
- `my_manual.list`: `马来手动`
- `ph_manual.list`: `菲律宾手动`
- `ng_manual.list`: `尼日利亚手动`
- `tr_manual.list`: `土耳其手动`
- `ru_manual.list`: `俄罗斯手动`
- `angelalign.list`: `时代天使`
- `final.list`: `FINAL`
