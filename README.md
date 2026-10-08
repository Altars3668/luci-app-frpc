# luci-app-frpc

**简体中文** | [English](README.en.md)

面向 OpenWrt / ImmortalWrt 的 **frp 客户端 LuCI 管理界面**。这个版本不只是给 `frpc` 加一张网页：它同时维护 UCI 配置、TOML 生成器和 procd 启动脚本，让支持的网页选项映射到运行配置，并保留明确的兼容与校验路径。

> 本仓库提供管理界面与 OpenWrt 集成，不是 frp 核心的替代实现。反向代理由上游 [fatedier/frp](https://github.com/fatedier/frp) 的 `frpc` 二进制执行。

## 当前版本与上游

界面包 **99.1.0**；LuCI 原始源码来自 **ImmortalWrt**。保留本仓库的 UCI 格式、分组页面、服务按钮和自带生成器，不直接混装上游 stock 页面的新字段名。

本轮同步上游应用历史和翻译，修复表单重复保存、依赖合并、关闭开关持久化及实例状态检测；配套修正布尔值、TLS / QUIC 和 visitor 绑定参数的 TOML 输出。

## 我的改造与特色

| 改造 | 实际作用 |
| --- | --- |
| **UCI → TOML 配置链路** | `/etc/config/frpc` 是配置入口；启动时生成 `/var/run/frpc/frpc.toml`，适配 frp 的 TOML 配置结构。 |
| **按用途重新组织页面** | 将连接、认证、TLS / QUIC、管理接口、日志、额外参数和启动设置分组，而不是把所有选项挤在一张长表里。 |
| **Token / OIDC 与 TLS 参数** | 同时配置两种认证方式，以及证书、CA、SNI、QUIC 超时和 TCP 复用参数。 |
| **代理与 visitor 配置** | 支持 TCP、UDP、HTTP、HTTPS、STCP、XTCP；提供 visitor、限速、负载均衡组、健康检查和 Proxy Protocol 选项。 |
| **客户端插件与扩展项** | 暴露 HTTP 代理、SOCKS5、Unix socket 插件；未覆盖的配置可用 `extra_settings` / `extra_options` 补充。 |
| **服务操作与反馈** | 通过 LuCI / ubus 启停、重启，并显示操作返回结果和服务状态。 |
| **兼容旧配置** | 保留旧 `_` 扩展项及 `log_file` 的读取路径，减少从旧配置迁移的成本。 |
| **自带配置和 init 脚本** | UI、配置生成器、默认 UCI 与启动脚本由同一仓库维护，避免页面选项和服务脚本版本不一致。 |

核心实现：[LuCI 页面](htdocs/luci-static/resources/view/frpc.js) · [配置生成与启动脚本](root/etc/init.d/frpc) · [默认配置](root/etc/config/frpc) · [打包规则](Makefile)。

## 依赖与构建

需要带 LuCI 的 OpenWrt / ImmortalWrt 构建树或 SDK，以及支持本仓库所用 TOML 字段的 `frpc`。包依赖在 [Makefile](Makefile) 中声明为 `luci-base` 和 `frpc`；界面包不捆绑核心二进制。

在已经准备好 feeds 的 SDK / 构建树根目录执行：

```sh
git clone https://github.com/Altars3668/luci-app-frpc.git package/luci-app-frpc
./scripts/feeds install luci-base frpc
printf '%s\n' 'CONFIG_PACKAGE_luci-app-frpc=m' 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-frpc/compile V=s -j2
```

先检查 `package/` 和 feeds 里是否已有同名 LuCI 包，只保留一份。产物位于 `bin/packages/`；包格式取决于使用的 SDK，而不是仅由系统版本号决定。

**文件冲突要特别处理：** 部分 feed 的 `frpc` 包也安装 `/etc/config/frpc` 和 `/etc/init.d/frpc`。本包的安装钩子会清理冲突路径，安装前必须另存已有配置。更稳妥的固件集成方式是让核心包只提供二进制，由本 LuCI 包提供配置和 init；配套 [OpenWRT-CI](https://github.com/Altars3668/OpenWRT-CI) 已采用这一方式。不要依赖强制覆盖来掩盖包归属冲突。

## 使用

1. 备份已有 `/etc/config/frpc`，安装与目标系统匹配的包及依赖。
2. 打开 **服务 → frp → 客户端**，填写服务端地址、端口和认证信息。
3. 添加代理条目，区分公网远端端口与本地服务端口；STCP / XTCP visitor 还需对应的服务名称、密钥和本地绑定地址 / 端口。
4. 启用服务并保存应用；启动设置中的 `enabled` 与 init 自启动状态都应核对。
5. 通过服务状态、`logread -e frpc` 和核心配置校验定位问题。

```sh
# 在路由器上检查生成配置；可能包含认证信息，不要公开其内容
frpc verify -c /var/run/frpc/frpc.toml
logread -e frpc
```

## 边界与注意事项

- **reload 是 stop/start，不是无损热重载**；保存配置或重启会影响现有隧道。
- 并非所有 frp 新字段都有 UI；额外项需要使用合法 TOML 值，并由对应版本核心校验。
- 页面中保留了历史 `conf_inc` 选项，但当前客户端生成器没有拼接文件的实现；不要把它当作已生效功能。FRPS 的实现不同。
- 管理接口不应直接暴露到公网；先配置认证、TLS 和防火墙。生成的 TOML 及 UCI 可能含敏感信息。
- 安装钩子会替换配置和 init 文件；这不是可以无备份直接覆盖的普通主题包。
- 本仓库当前没有承诺持续提供预编译 Release。优先按匹配的 SDK 构建，或使用配套固件产物。

## 来源与许可证

由 Altars3668 维护的 OpenWrt frp 集成版本，客户端快照导入来源在 Git 历史中保留。frp 核心来自 [fatedier/frp](https://github.com/fatedier/frp)。本包 [Makefile](Makefile) 声明 **Apache-2.0**；依赖组件遵循各自许可证。

相关项目：[FRPS 服务端界面](https://github.com/Altars3668/luci-app-frps) · [配套固件 CI](https://github.com/Altars3668/OpenWRT-CI)。

## 上游基线与验证边界

源码来源已核实为 [immortalwrt/luci 的 `applications/luci-app-frpc`](https://github.com/immortalwrt/luci/tree/5fc1fac5684cac6eee2c7fbff78c65b867980dd8/applications/luci-app-frpc)，本轮基线为 `5fc1fac5684c`。来源、导入历史和保留的定制差异见 [UPSTREAM.md](UPSTREAM.md)。

`node tests/upstream-regression.mjs` 和 `python3 -I tests/config-generation.py`；后者仅使用临时 UCI 替身，不启动服务。

这些检查覆盖语法、翻译及所列本机回归；不等于所有架构 SDK / 固件构建或真实设备验收。本次发布更新源码和说明，不安装软件、不触发刷机，也不伪造预编译产物。
