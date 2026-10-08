'use strict';
'require view';
'require ui';
'require form';
'require rpc';
'require fs';
'require tools.widgets as widgets';

//	[Widget, Option, Title, Description, {Param: 'Value'}],
var startupConf = [
	[form.Flag, 'enabled', _('Enabled'), _('Enable or disable the frpc service (init.enabled).')],
	[form.Flag, 'stdout', _('Log stdout')],
	[form.Flag, 'stderr', _('Log stderr')],
	[widgets.UserSelect, 'user', _('Run daemon as user')],
	[widgets.GroupSelect, 'group', _('Run daemon as group')],
	[form.Flag, 'respawn', _('Respawn when crashed')],
	[form.DynamicList, 'env', _('Environment variable'), _('OS environments pass to frp for config file template, see <a href="https://github.com/fatedier/frp#configuration-file-template">frp README</a>'), {placeholder: 'ENV_NAME=value'}],
	[form.DynamicList, 'conf_inc', _('Additional configs'), _('Config files include in temporary config file'), {placeholder: '/etc/frp/frpc.d/frpc_full.ini'}]
];

// 分页分组：将原 Common Settings 拆分为多个逻辑标签页
var grpBasic = [
	[form.Value, 'server_addr', _('Server address'), _('ServerAddr specifies the address of the server to connect to.<br />By default, this value is "127.0.0.1".'), {datatype: 'host'}],
	[form.Value, 'server_port', _('Server port'), _('ServerPort specifies the port to connect to the server on.<br />By default, this value is 7000.'), {datatype: 'port'}],
	[form.ListValue, 'protocol', _('Protocol'), _('Protocol specifies the transport protocol used to connect frpc to frps. Valid values are "tcp", "kcp", "quic" and "websocket".<br />By default, this value is "tcp".'), {values: ['tcp', 'kcp', 'quic', 'websocket']}],
	[form.Value, 'http_proxy', _('HTTP proxy'), _('HttpProxy specifies a proxy address to connect to the server through. If this value is "", the server will be connected to directly.<br />By default, this value is read from the "http_proxy" environment variable.')],
	[form.Flag, 'tcp_mux', _('TCP mux'), _('TcpMux toggles TCP stream multiplexing. This allows multiple requests from a client to share a single TCP connection. If this value is true, the server must have TCP multiplexing enabled as well.<br />By default, this value is true.'), {datatype: 'bool', default: 'true'}],
	[form.Value, 'tcp_mux_keepalive_interval', _('TCP mux keepalive interval'), _('tcpMuxKeepaliveInterval (seconds).'), {datatype: 'uinteger'}],
	[form.Value, 'heartbeat_interval', _('Heartbeat interval'), _('HeartBeatInterval specifies at what interval heartbeats are sent to the server, in seconds. It is not recommended to change this value.<br />By default, this value is 30.'), {datatype: 'uinteger'}],
	[form.Value, 'heartbeat_timeout', _('Heartbeat timeout'), _('HeartBeatTimeout specifies the maximum allowed heartbeat response delay before the connection is terminated, in seconds. It is not recommended to change this value.<br />By default, this value is 90.'), {datatype: 'uinteger'}],
	[form.Value, 'user', _('User'), _('User specifies a prefix for proxy names to distinguish them from other clients. If this value is not "", proxy names will automatically be changed to "{user}.{proxy_name}".<br />By default, this value is "".')],
	[form.Flag, 'login_fail_exit', _('Exit when login fail'), _('LoginFailExit controls whether or not the client should exit after a failed login attempt. If false, the client will retry until a login attempt succeeds.<br />By default, this value is true.'), {datatype: 'bool', default: 'true'}]
];

var grpAuth = [
	[form.ListValue, 'auth_method', _('Auth method'), _('Authentication method to connect frpc to frps. Valid values: "token" (default) or "oidc".'), {values: ['token', 'oidc'], default: 'token'}],
	[form.Value, 'token', _('Token'), _('Token specifies the shared authorization token (auth.method=token). Leave empty to disable token authentication.'), {depends: {auth_method: 'token'}}],
	[form.Value, 'oidc_client_id', _('OIDC Client ID'), _('OIDC clientID used when auth.method = "oidc".'), {depends: {auth_method: 'oidc'}}],
	[form.Value, 'oidc_client_secret', _('OIDC Client Secret'), _('OIDC clientSecret used when auth.method = "oidc".'), {password: true, depends: {auth_method: 'oidc'}}],
	[form.Value, 'oidc_audience', _('OIDC Audience'), _('OIDC audience used when auth.method = "oidc".'), {depends: {auth_method: 'oidc'}}],
	[form.Value, 'oidc_token_endpoint_url', _('OIDC Token Endpoint URL'), _('OIDC token endpoint URL used when auth.method = "oidc".'), {depends: {auth_method: 'oidc'}}]
];

// Security & TLS (合并 TLS 与 QUIC)
var grpSecurityTLS = [
	[form.Flag, 'tls_enable', _('TLS'), _('TLSEnable specifies whether or not TLS should be used when communicating with the server.'), {datatype: 'bool'}],
	[form.Value, 'tls_cert_file', _('TLS cert file'), _('Client TLS certFile path.'), {datatype: 'file'}],
	[form.Value, 'tls_key_file', _('TLS key file'), _('Client TLS keyFile path.'), {datatype: 'file'}],
	[form.Value, 'tls_trusted_ca_file', _('TLS trusted CA file'), _('Client TLS trustedCaFile path.'), {datatype: 'file'}],
	[form.Value, 'tls_server_name', _('TLS server name'), _('Override TLS serverName for SNI.')],
	[form.Flag, 'tls_disable_custom_first_byte', _('TLS disable custom first byte'), _('Disable custom first byte when using TLS.'), {datatype: 'bool'}],
	[form.Value, 'quic_keepalive_period', _('QUIC keepalive period'), _('QUIC keepalivePeriod (seconds).'), {datatype: 'uinteger'}],
	[form.Value, 'quic_max_idle_timeout', _('QUIC max idle timeout'), _('QUIC maxIdleTimeout (seconds).'), {datatype: 'uinteger'}],
	[form.Value, 'quic_max_incoming_streams', _('QUIC max incoming streams'), _('QUIC maxIncomingStreams.'), {datatype: 'uinteger'}]
];

var grpWeb = [
	[form.Value, 'admin_addr', _('Admin address'), _('AdminAddr specifies the address that the admin server binds to.<br />By default, this value is "0.0.0.0".'), {datatype: 'ipaddr'}],
	[form.Value, 'admin_port', _('Admin port'), _('AdminPort specifies the port for the admin server to listen on. If this value is 0, the admin server will not be started.<br />By default, this value is 0.'), {datatype: 'port'}],
	[form.Value, 'admin_user', _('Admin user'), _('AdminUser specifies the username that the admin server will use for login.<br />By default, this value is "admin".')],
	[form.Value, 'admin_pwd', _('Admin password'), _('AdminPwd specifies the password that the admin server will use for login.<br />By default, this value is "admin".'), {password: true}],
	[form.Value, 'assets_dir', _('Assets dir'), _('AssetsDir specifies the local directory that the admin server will load resources from. If this value is "", assets will be loaded from the bundled executable using statik.<br />By default, this value is "".')]
];


var grpLogging = [
	[form.Value, 'log_to', _('Log output target'), _('Preferred new key. Accepts a file path or special values: "console", "/dev/null". Leave empty for upstream default (console).')],
	[form.Value, 'log_file', _('(Deprecated) legacy log_file'), _('Deprecated legacy key retained for backward compatibility. Will be migrated to log_to in runtime; please move value to "Log output target" and clear this.'), {placeholder: '/tmp/log/frpc.log'}],
	[form.ListValue, 'log_level', _('Log level'), _('LogLevel specifies the minimum log level. Valid values are "trace", "debug", "info", "warn", and "error".<br />By default, this value is "info".'), {values: ['trace', 'debug', 'info', 'warn', 'error']}],
	[form.Value, 'log_max_days', _('Log max days'), _('Maximum days to retain file logs when the output target is a file.'), {datatype: 'uinteger'}],
	[form.Flag, 'disable_log_color', _('Disable log color'), _('Disable ANSI color codes in console logs.'), {datatype: 'bool', default: 'false'}]
];

// Renamed '_' -> 'extra_settings' (keep backward compatibility)
var grpExtra = [
	[form.DynamicList, 'extra_settings', _('Additional settings'), _('This list can be used to specify some additional parameters which have not been included in this LuCI.'), {placeholder: 'Key-A=Value-A'}]
];

var baseProxyConf = [
	[form.Value, 'name', _('Proxy name'), undefined, {rmempty: false, optional: false, modalonly: false}],
	[form.ListValue, 'type', _('Proxy type'), _('ProxyType specifies the type of this proxy. Valid values include "tcp", "udp", "http", "https", "stcp", and "xtcp".<br />By default, this value is "tcp".'), {values: ['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp'], modalonly: false}],
	[form.Flag, 'use_encryption', _('Encryption'), _('UseEncryption controls whether or not communication with the server will be encrypted. Encryption is done using the tokens supplied in the server and client configuration.<br />By default, this value is false.'), {datatype: 'bool'}],
	[form.Flag, 'use_compression', _('Compression'), _('UseCompression controls whether or not communication with the server will be compressed.<br />By default, this value is false.'), {datatype: 'bool'}],
	[form.Value, 'local_ip', _('Local IP'), _('LocalIp specifies the IP address or host name to proxy to.'), {datatype: 'host', modalonly: false}],
	[form.Value, 'local_port', _('Local port'), _('LocalPort specifies the port to proxy to.'), {datatype: 'port', modalonly: false}],
];

var bindInfoConf = [
	[form.Value, 'remote_port', _('Remote port'), _('If remote_port is 0, frps will assign a random port for you'), {datatype: 'port', modalonly: false}]
];

var domainConf = [
	[form.Value, 'custom_domains', _('Custom domains')],
	[form.Value, 'subdomain', _('Subdomain')],
];

var httpProxyConf = [
	[form.Value, 'locations', _('Locations')],
	[form.Value, 'http_user', _('HTTP user')],
	[form.Value, 'http_pwd', _('HTTP password')],
	[form.Value, 'host_header_rewrite', _('Host header rewrite')],
	// [form.Value, 'headers', _('Headers')], // FIXME
];

var stcpProxyConf = [
	[form.ListValue, 'role', _('Role'), undefined, {values: ['server', 'visitor']}],
	[form.Value, 'server_name', _('Server name'), undefined, {depends: [{role: 'visitor'}]}],
	[form.Value, 'sk', _('Sk'), undefined, {password: true}],
	[form.Value, 'bind_addr', _('Bind address'), undefined, {datatype: 'ipaddr', depends: {role: 'visitor'}}],
	[form.Value, 'bind_port', _('Bind port'), undefined, {validate: validateVisitorBindPort, depends: {role: 'visitor'}}],
];

var pluginConf = [
	[form.ListValue, 'plugin', _('Plugin'), undefined, {values: ['', 'http_proxy', 'socks5', 'unix_domain_socket'], rmempty: true}],
	[form.Value, 'plugin_http_user', _('HTTP user'), undefined, {depends: {plugin: 'http_proxy'}}],
	[form.Value, 'plugin_http_passwd', _('HTTP password'), undefined, {depends: {plugin: 'http_proxy'}}],
	[form.Value, 'plugin_user', _('SOCKS5 user'), undefined, {depends: {plugin: 'socks5'}}],
	[form.Value, 'plugin_passwd', _('SOCKS5 password'), undefined, {depends: {plugin: 'socks5'}}],
	[form.Value, 'plugin_unix_path', _('Unix domain socket path'), undefined, {depends: {plugin: 'unix_domain_socket'}, optional: false, rmempty: false,
		datatype: 'file', placeholder: '/var/run/docker.sock', default: '/var/run/docker.sock'}],
];

// Batch B advanced proxy parameters
var advProxyConf = [
	[form.Value, 'bandwidth_limit', _('Bandwidth limit'), _('transport.bandwidthLimit, e.g. 1MB, 100KB, 1GB.'), {modalonly: true}],
	[form.ListValue, 'bandwidth_limit_mode', _('Bandwidth limit mode'), _('transport.bandwidthLimitMode.'), {values: ['client', 'server'], modalonly: true}],
	[form.ListValue, 'proxy_protocol_version', _('Proxy protocol version'), _('transport.proxyProtocolVersion.'), {values: ['', 'v1', 'v2'], modalonly: true}],
	[form.Value, 'lb_group', _('LoadBalancer group'), _('loadBalancer.group name.'), {modalonly: true}],
	[form.Value, 'lb_group_key', _('LoadBalancer group key'), _('loadBalancer.groupKey secret.'), {modalonly: true}],
	[form.ListValue, 'hc_type', _('Health check type'), _('healthCheck.type'), {values: ['', 'tcp', 'http'], modalonly: true}],
	[form.Value, 'hc_path', _('Health check path'), _('healthCheck.path (HTTP only).'), {modalonly: true, depends: {hc_type: 'http'}}],
	[form.Value, 'hc_timeout', _('Health check timeout(s)'), _('healthCheck.timeoutSeconds'), {datatype: 'uinteger', modalonly: true}],
	[form.Value, 'hc_max_failed', _('Health check max failed'), _('healthCheck.maxFailed'), {datatype: 'uinteger', modalonly: true}],
	[form.Value, 'hc_interval', _('Health check interval(s)'), _('healthCheck.intervalSeconds'), {datatype: 'uinteger', modalonly: true}],
	[form.Value, 'server_user', _('Server user (visitor)'), _('serverUser for visitor role'), {modalonly: true, depends: {role: 'visitor'}}],
	[form.DynamicList, 'extra_options', _('Extra options'), _('Append raw key=value lines at end of this proxy block'), {placeholder: 'foo.bar=value', modalonly: true}],
	[form.DynamicList, 'extra_options_plugin', _('Extra plugin options'), _('Append raw key=value lines inside [proxies.plugin] section'), {placeholder: 'extraKey=extraValue', modalonly: true, depends: {plugin: 'http_proxy'}}]
];

function writeFlagDisabled(section_id) {
	return this.write(section_id, this.disabled || 'false');
}

function removeIfPresent(section_id) {
	const this_cfg = this.uciconfig || this.section.uciconfig || this.map.config;
	const this_sid = this.ucisection || section_id;
	const this_opt = this.ucioption || this.option;

	for (let i = 0; i < this.section.children.length; i++) {
		const sibling = this.section.children[i];

		if (sibling === this || sibling.ucioption == null)
			continue;

		const sibling_cfg = sibling.uciconfig || sibling.section.uciconfig || sibling.map.config;
		const sibling_sid = sibling.ucisection || section_id;
		const sibling_opt = sibling.ucioption || sibling.option;

		if (this_cfg != sibling_cfg || this_sid != sibling_sid || this_opt != sibling_opt)
			continue;

		if (typeof sibling.isActive === 'function' && sibling.isActive(section_id))
			return Promise.resolve();
	}

	if (this.map.data.get(this_cfg, this_sid, this_opt) == null)
		return Promise.resolve();

	return this.map.data.unset(this_cfg, this_sid, this_opt);
}

function isUciDeleteNotFoundError(err) {
	const message = err && err.message ? err.message : String(err);

	return /uci\/delete/.test(message) && /ubus code 4/.test(message);
}

function guardUciDeleteNotFound(data, config) {
	data._frpIgnoreMissingDeleteConfigs ??= {};
	data._frpIgnoreMissingDeleteConfigs[config] = true;

	if (data._frpIgnoreMissingDeleteInstalled)
		return;

	const callDelete = data.callDelete;

	data.callDelete = function(conf, sid, options) {
		const guarded = this._frpIgnoreMissingDeleteConfigs && this._frpIgnoreMissingDeleteConfigs[conf];

		return callDelete.apply(this, arguments).catch(L.bind(function(err) {
			if (!guarded || !isUciDeleteNotFoundError(err))
				return Promise.reject(err);

			if (!Array.isArray(options) || options.length <= 1)
				return null;

			return Promise.all(options.map(L.bind(function(opt) {
				return callDelete.call(this, conf, sid, [ opt ]).catch(function(e) {
					return isUciDeleteNotFoundError(e) ? null : Promise.reject(e);
				});
			}, this)));
		}, this));
	};

	data._frpIgnoreMissingDeleteInstalled = true;
}

function validateVisitorBindPort(section_id, value) {
	if (!value)
		return true;

	value = String(value).trim();

	if (/^-\d+$/.test(value) && Number(value) < 0)
		return true;

	if (!/^\d+$/.test(value))
		return _('Port must be negative or a number between 1 and 65535.');

	const port = Number(value);
	if (port < 1 || port > 65535)
		return _('Port must be negative or between 1 and 65535.');

	return true;
}

function normalizeDepends(depends) {
	if (depends == null)
		return [];

	return Array.isArray(depends) ? depends : [ depends ];
}

function mergeDepends(existing, next) {
	const current = normalizeDepends(existing);
	const incoming = normalizeDepends(next);

	if (current.length === 0)
		return incoming;

	if (incoming.length === 0)
		return current;

	const merged = [];

	for (let oldDep of current) {
		for (let newDep of incoming) {
			const dep = {};
			let conflict = false;

			for (let key in oldDep)
				dep[key] = oldDep[key];

			for (let key in newDep) {
				if (Object.prototype.hasOwnProperty.call(dep, key) && dep[key] !== newDep[key]) {
					conflict = true;
					break;
				}

				dep[key] = newDep[key];
			}

			if (!conflict)
				merged.push(dep);
		}
	}

	return merged;
}

function setParams(o, params) {
	if (!params)
		return;

	for (let key in params) {
		let val = params[key];

		if (key === 'values') {
			for (let v of val) {
				let args = v;

				if (!Array.isArray(args))
					args = [args];

				o.value.apply(o, args);
			}
		} else if (key === 'depends') {
			o.deps = mergeDepends(o.deps, val);
		} else {
			o[key] = params[key];
		}
	}

	if (params['datatype'] === 'bool') {
		o.enabled = 'true';
		o.disabled = 'false';
	}
}

function defTabOpts(s, t, opts, params) {
	for (let opt of opts) {
		const o = s.taboption(t, opt[0], opt[1], opt[2], opt[3]);

		setParams(o, opt[4]);
		setParams(o, params);

		/*
		 * Per-option optional must win over tab-wide optional.
		 * This is important for form.Flag with default='true',
		 * otherwise LuCI may treat checked state as default and call remove().
		 */
		// 保留定制表格中逐字段的可见性设置。
		if (opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'modalonly'))
			o.modalonly = opt[4].modalonly;

		if (opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'optional'))
			o.optional = opt[4].optional;

		if (
			!(opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'remove')) &&
			!(params && Object.prototype.hasOwnProperty.call(params, 'remove'))
		) {
			if (opt[0] === form.Flag) {
				// 关闭开关必须保存 disabled，不能删除后被服务默认值重新启用。
				o.rmempty = false;
				o.retain = true;
				o.remove = writeFlagDisabled;
			} else {
				o.remove = removeIfPresent;
			}
		}
	}
}

function isIgnorableUciDeleteError(err) {
	if (!err)
		return false;
	var msg = '';
	if (err.message)
		msg = err.message;
	else if (typeof err === 'string')
		msg = err;
	else
		msg = '' + err;
	return (msg.indexOf('uci/delete') !== -1) && (msg.indexOf('Not found') !== -1 || msg.indexOf('code 4') !== -1);
}

function swallowUciDelete(promise) {
	return Promise.resolve(promise).catch(function(err) {
		if (isIgnorableUciDeleteError(err)) {
			console.warn('Ignoring benign UCI delete failure:', err);
			return null;
		}
		throw err;
	});
}

function defOpts(s, opts, params) {
	for (let opt of opts) {
		const o = s.option(opt[0], opt[1], opt[2], opt[3]);

		setParams(o, opt[4]);
		setParams(o, params);

		// 保留定制表格中逐字段的可见性设置。
		if (opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'modalonly'))
			o.modalonly = opt[4].modalonly;

		if (opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'optional'))
			o.optional = opt[4].optional;

		if (
			!(opt[4] && Object.prototype.hasOwnProperty.call(opt[4], 'remove')) &&
			!(params && Object.prototype.hasOwnProperty.call(params, 'remove'))
		) {
			if (opt[0] === form.Flag) {
				// 关闭开关必须保存 disabled，不能删除后被服务默认值重新启用。
				o.rmempty = false;
				o.retain = true;
				o.remove = writeFlagDisabled;
			} else {
				o.remove = removeIfPresent;
			}
		}
	}
}

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('frpc'), {}).then(function (res) {
		const instances = res.frpc && res.frpc.instances;

		if (!instances)
			return false;

		for (let name in instances) {
			if (instances[name] && instances[name].running)
				return true;
		}

		return false;
	});
}

function renderStatus(isRunning) {
	var renderHTML = "";
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';

	if (isRunning) {
		renderHTML += String.format(spanTemp, 'green', _("frp Client"), _("RUNNING"));
	} else {
		renderHTML += String.format(spanTemp, 'red', _("frp Client"), _("NOT RUNNING"));
	}

	return renderHTML;
}

var callRcInit = rpc.declare({
	object: 'rc',
	method: 'init',
	params: [ 'name', 'action' ]
});

// Exec frpc init.d action via rc ubus interface
function serviceAction(action) {
	return callRcInit('frpc', action).then(function() {
		// Success: rc.init returns empty object on success
		return { code: 0, stderr: '' };
	}).catch(function(e) {
		console.error('Service action failed:', e);
		return { code: -1, stderr: (e && e.message) || 'Unknown error' };
	});
}

function fmtNow() {
	try { return new Date().toLocaleString(); } catch (e) { return new Date().toISOString(); }
}

function updateActionStatus(action, res) {
	var el = document.getElementById('service_action_status');
	if (!el) return;
	var code = (res && typeof res.code !== 'undefined') ? res.code : 'n/a';
	var msg = (res && res.stderr) ? ('' + res.stderr).trim() : '';
	var ok = (code === 0);
	el.innerText = String.format('%s: %s (code=%s) @ %s%s',
		action.toUpperCase(), ok ? _('OK') : _('Failed'), code, fmtNow(), msg ? (' - ' + msg) : '');
	el.style.color = ok ? 'green' : 'red';
}

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('frpc', _('frp Client'));
		guardUciDeleteNotFound(m.data, 'frpc');

		s = m.section(form.NamedSection, '_status');
		s.anonymous = true;
		s.render = function (section_id) {
			var refresh = function() {
				return L.resolveDefault(getServiceStatus()).then(function(res) {
					var view = document.getElementById('service_status');
					if (view) view.innerHTML = renderStatus(res);
				});
			};

			L.Poll.add(refresh);

			return E('div', { class: 'cbi-map' },
				E('fieldset', { class: 'cbi-section'}, [
					E('p', { id: 'service_status' }, _('Collecting data ...')),
					E('div', { class: 'cbi-section-actions' }, [
						E('button', { class: 'btn cbi-button-action', click: function(){ serviceAction('start').then(function(res){ updateActionStatus('start', res); }).then(refresh); } }, _('Start')),
						E('button', { class: 'btn cbi-button-reset', click: function(){ serviceAction('stop').then(function(res){ updateActionStatus('stop', res); }).then(refresh); } }, _('Stop')),
						E('button', { class: 'btn cbi-button-reload', click: function(){ serviceAction('restart').then(function(res){ updateActionStatus('restart', res); }).then(refresh); } }, _('Restart'))
					]),
					E('div', { class: 'cbi-value-description' }, [
						E('small', { id: 'service_action_status', style: 'opacity:0.85' }, _('No actions yet.'))
					])
				])
			);
		}

		s = m.section(form.NamedSection, 'common', 'conf');
		s.dynamic = true;

		// 新分页标签
		s.tab('basic', _('Basic'));
		s.tab('auth', _('Authentication'));
		s.tab('securitytls', _('Security & TLS'));
		s.tab('web', _('Web Admin'));
		s.tab('logging', _('Logging'));
		s.tab('extra', _('Additional'));
		s.tab('init', _('Startup Settings'));

		defTabOpts(s, 'basic', grpBasic);
		defTabOpts(s, 'auth', grpAuth);
		defTabOpts(s, 'securitytls', grpSecurityTLS);
		defTabOpts(s, 'web', grpWeb);
		defTabOpts(s, 'logging', grpLogging);
		defTabOpts(s, 'extra', grpExtra);

		// Backward compatibility: migrate old '_' list if present
		var oldList = m.data.get('frpc', 'common', '_');
		var newList = m.data.get('frpc', 'common', 'extra_settings');
		if (oldList && (!newList || newList.length === 0)) {
			m.data.set('frpc', 'common', 'extra_settings', oldList);
		}

		o = s.taboption('init', form.SectionValue, 'init', form.TypedSection, 'init', _('Startup Settings'));
		s = o.subsection;
		s.anonymous = true;
		s.dynamic = true;

		defOpts(s, startupConf);

		s = m.section(form.GridSection, 'conf', _('Proxy Settings'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.addbtntitle = _('Add new proxy...');

		s.filter = function(s) { return s !== 'common'; };

		s.tab('general', _('General Settings'));
		s.tab('http', _('HTTP Settings'));
		s.tab('plugin', _('Plugin Settings'));

		defTabOpts(s, 'general', baseProxyConf, {modalonly: true});

		// TCP and UDP
		defTabOpts(s, 'general', bindInfoConf, {optional: true, modalonly: true, depends: [{type: 'tcp'}, {type: 'udp'}]});

		// HTTP and HTTPS
		defTabOpts(s, 'http', domainConf, {optional: true, modalonly: true, depends: [{type: 'http'}, {type: 'https'}]});

		// HTTP
		defTabOpts(s, 'http', httpProxyConf, {optional: true, modalonly: true, depends: {type: 'http'}});

		// STCP and XTCP
		defTabOpts(s, 'general', stcpProxyConf, {modalonly: true, depends: [{type: 'stcp'}, {type: 'xtcp'}]});

		// Plugin
		defTabOpts(s, 'plugin', pluginConf, {modalonly: true});

		// Advanced
		s.tab('advanced', _('Advanced Settings'));
		defTabOpts(s, 'advanced', advProxyConf, {optional: true});

		return m.render();
	}
,
	// Suppress harmless "uci/delete code 4" errors during save cycles
	handleSave: function(ev) {
		return swallowUciDelete(this.super('handleSave', ev));
	},

	// Restart frpc after Save & Apply to apply new config immediately
	handleSaveApply: function(ev) {
		var self = this;
		return swallowUciDelete(this.super('handleSaveApply', ev)).then(function(res) {
			return callRcInit('frpc', 'restart').catch(function(e){ return null; }).then(function(){ return res; });
		});
	}
});
