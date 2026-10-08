# Upstream provenance

[简体中文](README.md) | [English](README.en.md)

## 已核实来源

- 仓库：[`immortalwrt/luci`](https://github.com/immortalwrt/luci)。
- 路径：`applications/luci-app-frpc`；分支：`master`。
- 本轮固定提交：`5fc1fac5684cac6eee2c7fbff78c65b867980dd8`（2026-10-08 核对）。机器可读记录见 [UPSTREAM.toml](UPSTREAM.toml)。

## 保留与适配

保留本仓库的 UCI 字段名、分组页面、服务按钮和自带生成器；不直接混用最新 stock UI 的认证、Dashboard、健康检查字段。移植上游依赖笛卡尔积、缺失字段幂等删除、批量删除逐项重试、逐选项 optional 与任意实例名检测；客户端去掉重复可写字段。配套修正 true/false、TLS/QUIC、visitor bind、allow_ports 列表与日志颜色的 TOML 输出。

独立导入仓库原先没有可证明的共享 Git 祖先。本轮只抽取对应子目录的历史；历史 anchor 用于还原导入差异，不把非精确匹配冒充原始 fork 点。原提交与原分支保留在独立备份；过滤历史不会带入整个 feed。

## 验证边界

`node tests/upstream-regression.mjs` 和 `python3 -I tests/config-generation.py`；后者仅使用临时 UCI 替身，不启动服务。

## English

Pinned upstream: `immortalwrt/luci`, `applications/luci-app-frpc`, `master` at `5fc1fac5684cac6eee2c7fbff78c65b867980dd8`. See [UPSTREAM.toml](UPSTREAM.toml) for the reproducible reference and import-anchor classification.

The custom UCI names, tab layout, service controls and bundled generators remain. Stock authentication, dashboard and health-check option names are not mixed with the legacy generator. Generic form/deletion/status fixes are ported, with matching TOML regressions.

Imported standalone snapshots did not prove shared Git ancestry. Only the relevant subdirectory history is retained; non-exact historical anchors are reconstruction aids, not asserted original fork points. Original refs and commits remain backed up.

`node tests/upstream-regression.mjs` and `python3 -I tests/config-generation.py`; generation tests use a temporary UCI stub and never start services.
