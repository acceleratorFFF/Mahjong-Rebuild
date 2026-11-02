# 复用素材声明

源码许可见 [UPSTREAM_MIT.txt](UPSTREAM_MIT.txt)。来源提交与完整风险清单见 [P1_REUSE_AUDIT.md](../../../docs/P1_REUSE_AUDIT.md)。

`public/avatars/*.svg`：DiceBear 生成，Adventurer by Lisa Wischofsky，SVG 元数据声明 CC BY 4.0。来源：[Adventurer](https://www.figma.com/community/file/1184595184137881796)，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本项目未修改头像，保留内嵌署名。

2026-10-24：已与 [DiceBear 官方页面](https://www.dicebear.com/styles/adventurer/) 核对作者及许可声明。实际使用54个资源及50个授权未核清项见 [P1_ASSETS.md](../../../docs/P1_ASSETS.md)。

`public/tiles/*.png`：来自 BestGuo2020 固定提交，逐文件来源与授权尚未核清。

`public/img/mute.png`、`public/img/manual.png`：恢复原顶栏时从同一固定提交原样提取；未找到逐文件作者或独立许可，列为授权未核清。当前实际素材56项、未核清52项，详见 [最新素材审查](../../../docs/P1_ASSETS.md)。

`public/effects/yaotong-weather/`：保留原 `source.json`。该文件指向第三方游戏提取素材，未找到分发授权；仅供本地复用验证，发布前必须处理。


2026-10-27新增菜单素材记录：
- `public/menu/title.png`：用户提供的“红中痞子杠”透明标题，逐字节原样复制，RGBA及alpha0已核对；用户提供不等于已独立核实其字体／美术分发授权。
- `public/menu/pavilion.png`：image_gen按用户主界面参考生成的纯场景背景，已去除原图全部标题、按钮与人物界面；生成来源与哈希见[素材证据](../../../docs/evidence/p3-menu/ASSETS.json)。
- 菜单按钮与简单图标为独立CSS／SVG控件，不将用户截图作为真实交互；动态上传头像的名称及来源备注由管理员记录，未把测试图片导入正式目录。
- 原头像、牌面与特效授权记录继续有效；本次不解除尚未核清素材的发布限制。[页面交付](../../../docs/P3_MENU_ACCEPTANCE.md)。

2026-10-27本轮追加：`public/menu/single-icon.png`、`public/menu/online-icon.png`为用户提供的入口图标，1254×1254 RGBA，原样复制并保留透明通道、图内字样；页面可访问名称及按钮正文改为“联机模式”。来源及逐字节校验见[本轮素材记录](../../../docs/evidence/p3-mobile-fit/ASSETS.json)。尚未独立核实原作者／分发授权，不生成替代素材。上段“简单图标为CSS／SVG”是此前实现记录，两个入口图标由本次PNG替代。

2026-11-01当前静态范围：62文件、55待核媒体（34牌面／16天气／2旧图标／3用户菜单图），4头像许可条件、1生成背景及参考来源条件、2非媒体元数据分别记录。来源与处理建议见[逐组审查](../../../docs/ASSET_SOURCE_REVIEW.md)，未整体解除发布限制，未批量替换。旧54／56请求数为历史场景，不是当前发布总数。

2026-11-01用户补充：title／single-icon／online-icon为其使用ChatGPT绘制，来源已针对性归档，保留原图。原55项待核中的该3项已有生成来源，剩余上游52项不因此放行。

2026-11-01最新：用户明确移除全部天气资源，16媒体及2份元数据已从当前public删除，播放／预加载模块一并删除；当前44静态文件，余36上游媒体待核。移除来源记录归档于源码docs/evidence/p5-no-weather/REMOVED_ASSETS.json，不随新候选分发天气媒体。前文天气使用与52项计数为历史记录。

2026-11-01最新：用户明确允许替换2个旧顶栏图标，mute.png／manual.png已删除，改为GameShellHeader内项目自写SVG。当前public42文件，34张牌面原样保留且待核；源码中的SVG不依赖原PNG。来源追溯与替换记录见docs/ASSET_TRACE_AND_ICONS.md（源码仓库路径）。

2026-11-02最新：用户明确确认当前34张牌面可用，按固定文件哈希记录为USER_CONFIRMED_TILE_USE_20261102，保留固定上游来源与MIT文本。此为用户对纳入本项目的确认，不宣称已独立核实原作者或获得新的上游授权；前文待核为此前审查结论。当前42媒体，天气及2旧PNG不再分发，其余素材来源与署名条件不变。
