'use strict';
'require view';
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

	[form.Flag, 'respawn', _('Respawn when crashed'), null,
	{
		enabled: '1',
		disabled: '0',
		default: '1',
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}],

	[form.DynamicList, 'env', _('Environment variable'),
	_('OS environments passed to frp for config file template, see %s.').format('<a href="https://github.com/fatedier/frp#configuration-file-template">frp README</a>'),
	{
		placeholder: 'ENV_NAME=value',
		validate: function (section_id, value) {
			return validateEnv(value);
		}
	}],

	[form.DynamicList, 'conf_inc', _('Additional configs'),
	_('Extra root-level configuration fragments included before generated proxy and visitor sections. Use frp includes or per-proxy raw settings for proxy/visitor tables.'),
	{
		datatype: 'file',
		placeholder: '/etc/frp/frpc.d/frpc_extra.toml'
	}]
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

const commonAuthConf = [
	[form.ListValue, 'authentication_method', _('Authentication method'),
	_('Authentication method.'),
	{ values: [['token', 'token'], ['oidc', 'oidc']], default: 'token' }],

	[form.Value, 'token', _('Token'),
	_('Token used for authentication.'),
	{
		depends: { authentication_method: 'token' },
		password: true,
		validate: function (section_id, value) {
			const tokenSourceType = this.section.getOption('token_source_type');

			if (value && tokenSourceType && tokenSourceType.formvalue(section_id))
				return _('Token and token source are mutually exclusive.');

			return true;
		}
	}],

	[form.MultiValue, 'auth_additional_scopes', _('Additional auth scopes'),
	_('Additional scopes to include authentication information.'),
	{ values: ['HeartBeats', 'NewWorkConns'] }],

	[form.ListValue, 'token_source_type', _('Token source type'),
	_('Load token from an external source. File reads the token from a local file; exec runs a command and requires frp unsafe permission. Mutually exclusive with auth.token.'),
	{
		depends: { authentication_method: 'token' },
		values: [['', _('Disabled')], ['file', 'file'], ['exec', 'exec']],
		rmempty: true,
		validate: function (section_id, value) {
			const token = this.section.getOption('token');

			if (value && token && token.formvalue(section_id))
				return _('Token and token source are mutually exclusive.');

			return true;
		}
	}],

	[form.Value, 'token_source_file_path', _('Token source file'),
	_('Path of token file.'),
	{
		depends: {
			authentication_method: 'token',
			token_source_type: 'file'
		},
		datatype: 'file',
		rmempty: false,
		validate: function (section_id, value) {
			const tokenSourceType = this.section.getOption('token_source_type');

			if (
				tokenSourceType &&
				tokenSourceType.formvalue(section_id) === 'file' &&
				!String(value || '').trim()
			)
				return _('Token source file path is required when token source type is file.');

			return true;
		}
	}],

	[form.Value, 'token_source_exec_command', _('Token source command'),
	_('Command used to obtain the token. The init script adds --allow-unsafe=TokenSourceExec when this source type is used.'),
	{
		depends: {
			authentication_method: 'token',
			token_source_type: 'exec'
		},
		datatype: 'file',
		rmempty: false,
		validate: function (section_id, value) {
			const tokenSourceType = this.section.getOption('token_source_type');

			if (
				tokenSourceType &&
				tokenSourceType.formvalue(section_id) === 'exec' &&
				!String(value || '').trim()
			)
				return _('Token source command is required when token source type is exec.');

			return true;
		}
	}],

	[form.DynamicList, 'token_source_exec_args', _('Token source command arguments'),
	_('Command arguments passed to token source exec.'),
	{
		depends: {
			authentication_method: 'token',
			token_source_type: 'exec'
		},
		placeholder: '--format'
	}],

	[form.DynamicList, 'token_source_exec_env', _('Token source environment'),
	_('Environment variables passed to token source exec. Use KEY=value.'),
	{
		depends: {
			authentication_method: 'token',
			token_source_type: 'exec'
		},
		placeholder: 'TOKEN_SERVICE=production',
		validate: function (section_id, value) {
			return validateEnv(value);
		}
	}],

	[form.Value, 'oidc_client_id', _('OIDC client ID'),
	_('Configuration key: auth.oidc.clientID.'),
	{ depends: { authentication_method: 'oidc' } }],

	[form.Value, 'oidc_client_secret', _('OIDC client secret'),
	_('Configuration key: auth.oidc.clientSecret.'),
	{ depends: { authentication_method: 'oidc' }, password: true }],

	[form.Value, 'oidc_audience', _('OIDC audience'),
	_('Configuration key: auth.oidc.audience.'),
	{ depends: { authentication_method: 'oidc' } }],

	[form.Value, 'oidc_scope', _('OIDC scope'),
	_('Configuration key: auth.oidc.scope.'),
	{ depends: { authentication_method: 'oidc' } }],

	[form.Value, 'oidc_token_endpoint_url', _('OIDC token endpoint URL'),
	_('Configuration key: auth.oidc.tokenEndpointURL.'),
	{ depends: { authentication_method: 'oidc' }, datatype: 'url' }],

	[form.DynamicList, 'oidc_additional_endpoint_params', _('OIDC additional endpoint params'),
	_('Additional OIDC token endpoint params. Use key=value.'),
	{
		depends: { authentication_method: 'oidc' },
		placeholder: 'audience=https://dev.auth.com/api/v2/',
		validate: function (section_id, value) {
			return validateKeyValue(value);
		}
	}],

	[form.Value, 'oidc_trusted_ca_file', _('OIDC trusted CA file'),
	_('Custom CA certificate file for OIDC endpoint.'),
	{ depends: { authentication_method: 'oidc' }, datatype: 'file' }],

	[form.Flag, 'oidc_insecure_skip_verify', _('OIDC insecure skip verify'),
	_('Skip TLS verification for OIDC endpoint. Not recommended for production.'),
	{ depends: { authentication_method: 'oidc' }, datatype: 'bool', default: 'false' }],

	[form.Value, 'oidc_proxy_url', _('OIDC proxy URL'),
	_('Proxy URL for OIDC token endpoint.'),
	{ depends: { authentication_method: 'oidc' }, datatype: 'url', placeholder: 'http://proxy.example.com:8080' }]
];

const commonLogConf = [
	[form.Value, 'log_file', _('Log output'),
	_('Log output path or console.'),
	{ placeholder: 'console' }],

	[form.ListValue, 'log_level', _('Log level'),
	_('Configuration key: log.level.'),
	{ values: ['trace', 'debug', 'info', 'warn', 'error'], default: 'info' }],

	[form.Value, 'log_max_days', _('Log max days'),
	_('Maximum number of days to keep logs.'),
	{ datatype: 'uinteger', placeholder: '3' }],

	[form.Flag, 'disable_log_color', _('Disable log color'),
	_('Disable log colors when log output is console.'),
	{ datatype: 'bool', default: 'false' }]
];

const commonWebConf = [
	[form.Value, 'admin_addr', _('Web server address'),
	_('Web server bind address.'),
	{ datatype: 'host', placeholder: '127.0.0.1' }],

	[form.Value, 'admin_port', _('Web server port'),
	_('Web server port. Leave empty or set to 0 to disable the web server.'),
	{ validate: validatePortOrZero, placeholder: '7400' }],

	[form.Value, 'admin_user', _('Web server user'),
	_('Web server username.'),
	{ placeholder: 'admin' }],

	[form.Value, 'admin_pwd', _('Web server password'),
	_('Web server password.'),
	{ password: true, placeholder: 'change_me_to_a_strong_password' }],

	[form.Flag, 'admin_tls_enable', _('Enable web HTTPS'),
	_('Enable HTTPS for the frpc web server. This switch controls whether webServer.tls.certFile and webServer.tls.keyFile are emitted.'),
	{
		enabled: 'true',
		disabled: 'false',
		default: 'false',
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}],

	[form.Value, 'admin_tls_cert_file', _('TLS certificate path'),
	_('Path to the certificate file used by the HTTPS web server.'),
	{
		datatype: 'file',
		placeholder: '/etc/ssl/acme/example.com.fullchain.crt',
		retain: true,
		validate: function (section_id, value) {
			if (
				adminWebEnabled(this.section, section_id) &&
				adminHttpsEnabled(this.section, section_id) &&
				!String(value || '').trim()
			)
				return _('TLS certificate path is required when web HTTPS is enabled.');

			return true;
		}
	}],

	[form.Value, 'admin_tls_key_file', _('TLS private key path'),
	_('Path to the private key file used by the HTTPS web server.'),
	{
		datatype: 'file',
		placeholder: '/etc/ssl/acme/example.com.key',
		retain: true,
		validate: function (section_id, value) {
			if (
				adminWebEnabled(this.section, section_id) &&
				adminHttpsEnabled(this.section, section_id) &&
				!String(value || '').trim()
			)
				return _('TLS private key path is required when web HTTPS is enabled.');

			return true;
		}
	}],

	[form.Value, 'assets_dir', _('Assets dir'),
	_('Web server assets directory.'),
	{ datatype: 'directory' }],

	[form.Flag, 'pprof_enable', _('Enable pprof'),
	_('Enable Go pprof handlers in web server.'),
	{
		datatype: 'bool',
		enabled: 'true',
		disabled: 'false',
		default: 'false',
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}]
];

const commonTransportConf = [
	[form.Value, 'dial_server_timeout', _('Dial server timeout'),
	_('Timeout in seconds for connecting to frps.'),
	{ datatype: 'uinteger', placeholder: '10' }],

	[form.Value, 'dial_server_keepalive', _('Dial server keepalive'),
	_('TCP keepalive interval in seconds. Negative value disables keepalive.'),
	{ datatype: 'integer', placeholder: '7200' }],

	[form.Value, 'http_proxy', _('Proxy URL'),
	_('Proxy URL used to connect to frps. Supports http, socks5 and ntlm.'),
	{ placeholder: 'http://user:passwd@192.168.1.128:8080' }],

	[form.Value, 'pool_count', _('Connection pool count'),
	_('Connections established in advance.'),
	{ datatype: 'uinteger', placeholder: '1' }],

	[form.Flag, 'tcp_mux', _('TCP mux'),
	_('Enable TCP stream multiplexing.'),
	{
		enabled: 'true',
		disabled: 'false',
		default: 'true',
		optional: false,
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}],

	[form.Value, 'tcp_mux_keepalive_interval', _('TCP mux keepalive interval'),
	_('Keepalive interval for TCP mux.'),
	{ datatype: 'uinteger', placeholder: '30' }],

	[form.ListValue, 'protocol', _('Transport protocol'),
	_('Transport protocol used to connect to frps.'),
	{ values: ['tcp', 'kcp', 'quic', 'websocket', 'wss'], default: 'tcp' }],

	[form.ListValue, 'wire_protocol', _('Wire protocol'),
	_('frp internal wire protocol. v2 requires frps support and must be enabled explicitly.'),
	{ values: ['v1', 'v2'], default: 'v1' }],

	[form.Value, 'connect_server_local_ip', _('Connect server local IP'),
	_('Local IP bound when connecting to frps. Only valid for tcp, websocket or wss.'),
	{
		datatype: 'ipaddr',
		depends: [{ protocol: 'tcp' }, { protocol: 'websocket' }, { protocol: 'wss' }],
		placeholder: '0.0.0.0'
	}],

	[form.Value, 'heartbeat_interval', _('Heartbeat interval'),
	_('Heartbeat interval in seconds.'),
	{ datatype: 'integer', placeholder: '30' }],

	[form.Value, 'heartbeat_timeout', _('Heartbeat timeout'),
	_('Heartbeat timeout in seconds.'),
	{ datatype: 'integer', placeholder: '90' }]
];

const commonTlsQuicConf = [
	[form.Flag, 'tls_enable', _('TLS'),
	_('Enable TLS when communicating with frps. Since frp v0.50.0, default is true.'),
	{
		enabled: 'true',
		disabled: 'false',
		default: 'true',
		optional: false,
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}],

	[form.Value, 'tls_cert_file', _('TLS certificate path'),
	_('Path to the TLS certificate file.'),
	{ datatype: 'file', placeholder: '/etc/ssl/frp/client.crt' }],

	[form.Value, 'tls_key_file', _('TLS private key path'),
	_('Path to the TLS private key file.'),
	{ datatype: 'file', placeholder: '/etc/ssl/frp/client.key' }],

	[form.Value, 'tls_trusted_ca_file', _('TLS trusted CA path'),
	_('Path to the trusted CA certificate file.'),
	{ datatype: 'file', placeholder: '/etc/ssl/frp/ca.crt' }],

	[form.Value, 'tls_server_name', _('TLS server name'),
	_('Server name used for TLS verification.'),
	{ placeholder: 'example.com' }],

	[form.Flag, 'disable_custom_tls_first_byte', _('Disable custom TLS first byte'),
	_('Since frp v0.50.0, default is true.'),
	{
		enabled: 'true',
		disabled: 'false',
		default: 'true',
		optional: false,
		rmempty: false,
		retain: true,
		remove: writeFlagDisabled
	}],

	[form.Value, 'quic_keepalive_period', _('QUIC keepalive period'),
	_('Configuration key: transport.quic.keepalivePeriod.'),
	{ datatype: 'uinteger', depends: { protocol: 'quic' }, placeholder: '10' }],

	[form.Value, 'quic_max_idle_timeout', _('QUIC max idle timeout'),
	_('Configuration key: transport.quic.maxIdleTimeout.'),
	{ datatype: 'uinteger', depends: { protocol: 'quic' }, placeholder: '30' }],

	[form.Value, 'quic_max_incoming_streams', _('QUIC max incoming streams'),
	_('Configuration key: transport.quic.maxIncomingStreams.'),
	{ datatype: 'uinteger', depends: { protocol: 'quic' }, placeholder: '100000' }]
];

const commonAdvancedConf = [
	[form.DynamicList, 'feature_gates', _('Feature gates'),
	_('Experimental feature gates. Use key=value, for example VirtualNet=true.'),
	{
		placeholder: 'VirtualNet=true',
		validate: function (section_id, value) {
			return validateKeyValue(value);
		}
	}],

	[form.Value, 'virtual_net_address', _('VirtualNet address'),
	_('Virtual network address. Requires VirtualNet feature gate.'),
	{ placeholder: '100.86.1.1/24' }],

	[form.Value, 'store_path', _('Store file path'),
	_('Persist runtime proxy and visitor configuration for Web UI or API management.'),
	{ datatype: 'file', placeholder: '/etc/frp/frpc_store.json' }],

	[form.DynamicList, 'metadatas', _('Client metadata'),
	_('Additional client metadata. Use key=value.'),
	{
		placeholder: 'var1=abc',
		validate: function (section_id, value) {
			return validateKeyValue(value);
		}
	}]
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
		if (typeof o.remove === 'function') {
			(function(orig) {
				o.remove = function(section_id) {
					if (this.option) {
						var cur = this.map.data.get(this.map.config, section_id, this.option);
						if (cur == null)
							return Promise.resolve();
					}
					var res = orig.apply(this, arguments);
					return Promise.resolve(res).catch(function(err) {
						var msg = err && err.message ? err.message : err;
						if (msg) {
							var text = '' + msg;
							if (text.indexOf('uci/delete') !== -1 || text.indexOf('Not found') !== -1 || text.indexOf('code 4') !== -1)
								return Promise.resolve();
						}
						throw err;
					});
				};
			})(o.remove);
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
		if (typeof o.remove === 'function') {
			(function(orig) {
				o.remove = function(section_id) {
					if (this.option) {
						var cur = this.map.data.get(this.map.config, section_id, this.option);
						if (cur == null)
							return Promise.resolve();
					}
					var res = orig.apply(this, arguments);
					return Promise.resolve(res).catch(function(err) {
						var msg = err && err.message ? err.message : err;
						if (msg) {
							var text = '' + msg;
							if (text.indexOf('uci/delete') !== -1 || text.indexOf('Not found') !== -1 || text.indexOf('code 4') !== -1)
								return Promise.resolve();
						}
						throw err;
					});
				};
			})(o.remove);
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
	const color = isRunning ? 'green' : 'red';
	const status = isRunning ? _('RUNNING') : _('NOT RUNNING');

	return String.format('<em><span style="color:%s"><strong>%s %s</strong></span></em>',
		color, _('frp Client'), status);
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
	render() {
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
		};

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

		s = m.section(form.GridSection, 'conf', _('Proxy / Visitor Settings'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add new proxy or visitor...');

		s.filter = function (section_id) {
			return section_id !== 'common';
		};

		s.tab('general', _('General Settings'));
		s.tab('transport', _('Transport'));
		s.tab('http', _('HTTP / Domain'));
		s.tab('plugin', _('Plugin'));
		s.tab('stcp_xtcp', _('STCP / XTCP / SUDP'));
		s.tab('health', _('Health Check'));
		s.tab('lb', _('Load Balancer'));
		s.tab('metadata', _('Metadata'));

		defTabOpts(s, 'general', baseProxyConf, { modalonly: null });
		defTabOpts(s, 'transport', proxyTransportConf, { optional: true, modalonly: true });

		defTabOpts(s, 'http', domainConf, {
			optional: true,
			modalonly: true,
			depends: [{ type: 'http' }, { type: 'https' }, { type: 'tcpmux' }]
		});

		defTabOpts(s, 'http', httpProxyConf, {
			optional: true,
			modalonly: true,
			depends: { type: 'http' }
		});

		defTabOpts(s, 'http', httpAuthConf, {
			optional: true,
			modalonly: true,
			depends: [{ type: 'http' }, { type: 'tcpmux' }]
		});

		defTabOpts(s, 'http', routeByHTTPUserConf, {
			optional: true,
			modalonly: true,
			depends: [{ type: 'http' }, { type: 'tcpmux' }]
		});

		defTabOpts(s, 'http', tcpmuxConf, {
			optional: true,
			modalonly: true,
			depends: { type: 'tcpmux' }
		});

		defTabOpts(s, 'plugin', pluginConf, {
			optional: true,
			modalonly: true
		});

		defTabOpts(s, 'stcp_xtcp', stcpXtcpConf, {
			optional: true,
			modalonly: true,
			depends: [{ type: 'stcp' }, { type: 'xtcp' }, { type: 'sudp' }]
		});

		defTabOpts(s, 'health', healthCheckConf, {
			optional: true,
			modalonly: true,
			depends: healthCheckDepends
		});

		defTabOpts(s, 'lb', loadBalancerConf, {
			optional: true,
			modalonly: true
		});

		defTabOpts(s, 'metadata', metadataConf, {
			optional: true,
			modalonly: true
		});

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
