# This is free software, licensed under the Apache License, Version 2.0

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Support for frp client
LUCI_DEPENDS:=+luci-base +frpc

PKG_LICENSE:=Apache-2.0

# 解决与上游 frpc 包的文件冲突
# 上游 frpc 包也包含 /etc/config/frpc 和 /etc/init.d/frpc
# 使用 preinst 脚本在安装前删除这些冲突文件
define Package/luci-app-frpc/preinst
#!/bin/sh
# 构建时安装：删除 staging 目录中的冲突文件
if [ -n "$${IPKG_INSTROOT}" ]; then
	rm -f "$${IPKG_INSTROOT}/etc/config/frpc" 2>/dev/null
	rm -f "$${IPKG_INSTROOT}/etc/init.d/frpc" 2>/dev/null
else
	# 运行时安装：删除目标系统中的冲突文件
	rm -f /etc/config/frpc 2>/dev/null
	rm -f /etc/init.d/frpc 2>/dev/null
fi
exit 0
endef

define Package/luci-app-frpc/postinst
#!/bin/sh
# 确保 init.d 脚本有执行权限
if [ -n "$${IPKG_INSTROOT}" ]; then
	chmod +x "$${IPKG_INSTROOT}/etc/init.d/frpc" 2>/dev/null
else
	chmod +x /etc/init.d/frpc 2>/dev/null
	/etc/init.d/frpc enabled && /etc/init.d/frpc restart
fi
exit 0
endef

define Package/luci-app-frpc/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# 卸载后重新安装 frpc 默认配置（如果 frpc 仍然存在）
	[ -x /etc/init.d/frpc ] || [ -f /usr/bin/frpc ] && {
		# frpc 二进制存在但配置丢失，创建空配置
		[ -f /etc/config/frpc ] || touch /etc/config/frpc
	}
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
