# luci-app-frpc

[简体中文](README.md) | **English**

A **LuCI frontend and service integration for the frp client on OpenWrt / ImmortalWrt**. This edition maintains the UCI schema, TOML generator and procd init script alongside the UI, so its settings have a corresponding runtime implementation.

> This repository is an OpenWrt integration, not a replacement frp engine. Tunnelling is performed by the upstream [fatedier/frp](https://github.com/fatedier/frp) `frpc` binary.

## What I changed

| Change | Practical benefit |
| --- | --- |
| **UCI-to-TOML configuration** | Uses `/etc/config/frpc` as the source and generates `/var/run/frpc/frpc.toml` at startup. |
| **Task-oriented settings** | Separates connection, authentication, TLS / QUIC, administration, logging, extension and startup options into tabs. |
| **Token / OIDC and TLS controls** | Exposes both authentication methods, certificates, CA, SNI, QUIC timing and TCP multiplexing options. |
| **Proxies and visitors** | Covers TCP, UDP, HTTP, HTTPS, STCP and XTCP, with visitor settings, bandwidth limits, load-balancer groups, health checks and Proxy Protocol. |
| **Client plugins and extension fields** | Includes HTTP proxy, SOCKS5 and Unix socket plugins; `extra_settings` / `extra_options` provide additional fields. |
| **Service controls with feedback** | Uses LuCI / ubus for start, stop and restart, and displays operation results and service status. |
| **Legacy configuration support** | Retains reads of the old `_` extension list and `log_file` field. |
| **One package owns the integration** | Ships the UCI defaults and init script together with the frontend, reducing UI/generator version mismatches. |

Implementation: [LuCI view](htdocs/luci-static/resources/view/frpc.js) · [generator and init script](root/etc/init.d/frpc) · [default configuration](root/etc/config/frpc) · [package recipe](Makefile).

## Requirements and build

Use an OpenWrt / ImmortalWrt buildroot or SDK with LuCI and a `frpc` version supporting the generated TOML fields. The [Makefile](Makefile) declares `luci-base` and `frpc`; this UI package does not bundle the engine binary.

From a buildroot / SDK with its feeds already updated:

```sh
git clone https://github.com/Altars3668/luci-app-frpc.git package/luci-app-frpc
./scripts/feeds install luci-base frpc
printf '%s\n' 'CONFIG_PACKAGE_luci-app-frpc=m' 'CONFIG_LUCI_LANG_zh_Hans=y' >> .config
make defconfig
make package/luci-app-frpc/compile V=s -j2
```

Keep only one copy of this LuCI package in `package/` and the feeds. Outputs are under `bin/packages/`; the SDK determines the package format, not a release-number shortcut.

**Important ownership conflict:** some feed versions of `frpc` also install `/etc/config/frpc` and `/etc/init.d/frpc`. This package's installation hooks remove those conflicting paths. Back up existing configuration before installing. For firmware builds, the preferable arrangement is to make the engine package install only its binary and let this LuCI package own configuration and init files. The companion [OpenWRT-CI](https://github.com/Altars3668/OpenWRT-CI) does this. Do not use forced overwrite as a substitute for resolving package ownership.

## Usage

1. Back up `/etc/config/frpc`, then install packages matching your target and their dependencies.
2. Open **Services → frp → Client** and configure the server address, port and authentication.
3. Add proxy entries, distinguishing the public remote port from the local service port. STCP / XTCP visitors also require the matching service name and secret.
4. Enable and apply the service. Check both the startup section's `enabled` option and init autostart state.
5. Diagnose using service status, `logread -e frpc` and the engine's configuration check.

```sh
# Run on the router. The generated configuration may contain secrets; do not publish it.
frpc verify -c /var/run/frpc/frpc.toml
logread -e frpc
```

## Limitations and cautions

- **Reload performs stop/start, not connection-preserving hot reload.** Applying settings or restarting may interrupt tunnels.
- Not every new frp field has a UI control. Extension values must be valid TOML and supported by the installed engine.
- The historical `conf_inc` field remains in the UI, but the current client generator does not implement fragment inclusion. Do not treat it as effective; FRPS differs here.
- Do not expose the administration interface publicly without authentication, TLS and appropriate firewall rules. UCI and generated TOML can contain secrets.
- Installation hooks replace configuration and init files. Backups are required before switching from another integration.
- This repository does not currently promise a continuous prebuilt Release feed. Build with a matching SDK or use companion firmware artifacts.

## Attribution and license

An OpenWrt frp integration maintained by Altars3668; the client snapshot's import provenance is retained in Git history. The engine comes from [fatedier/frp](https://github.com/fatedier/frp). This package's [Makefile](Makefile) declares **Apache-2.0**; dependencies retain their own licenses.

Related: [FRPS server UI](https://github.com/Altars3668/luci-app-frps) · [firmware CI](https://github.com/Altars3668/OpenWRT-CI).

## Upstream baseline and regression checks

The verified source is [`immortalwrt/luci/applications/luci-app-frpc`](https://github.com/immortalwrt/luci/tree/5fc1fac5684cac6eee2c7fbff78c65b867980dd8/applications/luci-app-frpc), pinned to `5fc1fac5684c`. [UPSTREAM.md](UPSTREAM.md) explains provenance, imported history and retained customisations.

`node tests/upstream-regression.mjs` and `python3 -I tests/config-generation.py`; generation tests use a temporary UCI stub and never start services.
