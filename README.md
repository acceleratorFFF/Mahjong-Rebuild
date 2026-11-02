# 红中痞子杠

移动端优先的单机与四人联机朋友房。正常入口均要求登录；玩家账号由管理员创建。

## 开发

使用Node22.23.4及pnpm9.15.9：

```sh
pnpm --dir apps/table install --frozen-lockfile
pnpm --dir apps/table dev:server
# 另一终端
pnpm --dir apps/table dev
```

单机默认无限连续局；联机4／8局，累计原单局分差，同分并列。规则与计分不因部署改变。

## 发布

手动触发Mahjong Pages工作流，publish默认关闭。只发布前端dist；后端独立运行，经HTTPS/WSS接入。不在仓库存储账号、密钥、会话或服务器备份。

保留上游MIT与各依赖许可。素材来源及确认见apps/table/licenses/ASSET_ATTRIBUTION.md；34张现有牌面按用户2026-11-02确认纳入，文件哈希锁定。真实设备／四人及公网验收单独记录，发布不等于全部验收完成。
