# 麻城规则核心复用来源

当前v3按用户最新试玩反馈修订同一engine.ts及types.ts；所有红中为痞子、特殊牌discard即尾补杠，小胡二五八将继续沿用原win.ts。两项旧规则测试预期及固定夹具同步调整，不再宣称当前legacy-rules.test.ts只改导入路径。win.ts／score.ts／tiles.ts及bot.ts仍与旧源字节一致；旧项目只读未改。[v3来源与修订](../../../docs/evidence/p3-rules/RULE_PATCH.json)、[保留检查](../../../docs/evidence/p3-rules/SOURCE_PRESERVATION.json)。下文v1／v2说明为此前提取历史。

P3又从同一只读旧工作区提取apps/server的server／network／round／lobby／rate-limit，以及packages/protocol的index／lobby／transport和相应测试。适配当前v2核心、公开事件、房间积分和终局恢复宽限；未复制旧依赖或构建产物。完整逐文件旧源／初次转换／当前SHA256见[复用记录](../../../docs/evidence/p3/REUSE.json)，差异与成本见[P3审查](../../../docs/P3_REUSE_REVIEW.md)。这些旧项目代码的外部分发许可同样待核，不套用上游MIT。新增Socket.IO依赖保留其独立[MIT声明](P3_SOCKET_IO_MIT.txt)。

2026-10-25用户试玩修订：当前规则v2修改types.ts版本ID及engine.ts痞子只能杠出／超时／最终无合法动作边界，不再声称当前五文件全都字节不变；以下五文件提取描述为初次v1来源。tiles.ts、win.ts、score.ts及bot.ts仍与旧源一致。宿主增加仅终局公开四家手牌；[当前修订哈希与原因](../../../docs/evidence/p2-feedback/RULE_PATCH.json)、[最新复用来源](../../../docs/evidence/p2-feedback/REUSE.json)。旧项目只读未改。

2026-10-25 根据用户要求，从其旧工作区 `E:/workspace/codex/Mahjong/packages/rules` 只读提取：

- src/types.ts、tiles.ts、win.ts、score.ts、engine.ts 五个文件，字节不变。
- tests/rules.test.ts，只有导入路径从 ../src/index 改为 ./index，在新项目重新运行。
- 新入口 index.ts 为明确的核心导出；最小阶段未导出机器人。

来源与目标SHA256记录见 [RULES_IMPORT.json](../../../docs/evidence/p2-minimum/RULES_IMPORT.json)，上次只读审查见 [SOURCE_REVIEW.json](../../../docs/evidence/p2-review/SOURCE_REVIEW.json)。

连续单机阶段又只读提取 src/bot.ts（字节不变），以及旧 apps/web 的 local-session.ts、local-session.test.ts、scenarios/special-actions.ts。宿主增加UI加载时钟暂停、私有投影、公开动画事件及守恒检查；测试仅改导入路径；牌例补充竞争及引擎推进的终局。原上游SettlementOverlay.vue来自已审计前端固定提交，受上游MIT覆盖，仅增加无倍率明细的条件显示。详见 [REUSE.json](../../../docs/evidence/p2-play/REUSE.json)。未复制旧依赖安装目录或构建产物，也没有整站迁移。

未在旧规则包或旧项目根目录发现单独的LICENSE文件，不将莲花上游MIT声明套用于这些规则文件。本次仅在用户工作区内部复用，外部分发权利需另核对。其他第三方素材仍按 [ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md) 记录。

2026-10-26：宿主增加超时托管，投影省略仅痞子单张杠按钮，3D纹理保留露牌角标；核心规则v3未改。[当前复用哈希](../../../docs/evidence/p3-autoplay/REUSE.json)、[当前保留检查](../../../docs/evidence/p3-autoplay/SOURCE_PRESERVATION.json)。前文旧版本哈希均为历史记录。

2026-10-26房间／按钮修复：核心v3和评分不变，仅修改共享动作投影与房主开局条件；[当前哈希与复用](../../../docs/evidence/p3-room-fixes/REUSE.json)、[当前来源检查](../../../docs/evidence/p3-room-fixes/SOURCE_PRESERVATION.json)。整场设计尚未实现。

2026-10-26账号与整场：旧规则／后端未发现可直接复用的账号服务，新增独立账号层；复用原规则与房间裁定接入4／8局、固定成员、原分差累计及投票。[当前复用哈希](../../../docs/evidence/p3-match-accounts/REUSE.json)、[当前来源检查](../../../docs/evidence/p3-match-accounts/SOURCE_PRESERVATION.json)。无新增依赖／素材，原公式和旧源未改。

2026-10-26：管理员创建账号与连续下一局为本项目宿主／账户适配，规则v3与原计分未改。最新[证据](../../../docs/P3_ADMIN_CONTINUATION.md)及[哈希](../../../docs/evidence/p3-admin-continuation/APP_CHANGES.json)。无新增素材／依赖。

2026-10-27菜单、朋友房与管理／头像适配交付：规则v3及胡牌计分未改。最新[证据](../../../docs/P3_MENU_ACCEPTANCE.md)、[保留检查](../../../docs/evidence/p3-menu/SOURCE_PRESERVATION.json)。旧源只读，未引入新依赖。
