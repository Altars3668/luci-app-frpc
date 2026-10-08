#!/usr/bin/env python3
"""用临时 UCI 替身验证 TOML，不启动服务、不操作真实防火墙。"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import tomllib
import unittest

APP = pathlib.Path(sys.argv.pop(1)).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else pathlib.Path(__file__).resolve().parents[1]
SERVICE = 'frps' if APP.name.endswith('frps') else 'frpc'

UCI_STUB = '''#!/usr/bin/python3 -I
import json,os,sys
args=[a for a in sys.argv[1:] if a!='-q']
config=json.loads(os.environ['FRP_TEST_DATA']); command,key=args
parts=key.split('.'); service=parts[0]
if command=='get':
 value=config.get(parts[1],{}).get(parts[2])
 if value is None:sys.exit(1)
 print(' '.join(value) if isinstance(value,list) else value)
elif command=='show':
 for section,items in config.items():
  if len(parts)>1 and section!=parts[1]:continue
  print(service+'.'+section+'='+items.get('_type','conf'))
  for option,value in items.items():
   if option=='_type':continue
   values=value if isinstance(value,list) else [value]
   print(service+'.'+section+'.'+option+'='+' '.join("'"+str(v)+"'" for v in values))
else:sys.exit(2)
'''


class ConfigTests(unittest.TestCase):
    def generate(self, common=None, proxy=None):
        config = {'common': dict(common or {}, _type='conf'), 'init': {'_type': 'init', 'enabled': '1'}}
        if proxy:
            config['testproxy'] = dict(proxy, _type='conf')
        with tempfile.TemporaryDirectory(prefix='frp-config-regression-') as name:
            work = pathlib.Path(name)
            executable = work / 'uci'
            executable.write_text(UCI_STUB)
            executable.chmod(0o755)
            filename = work / 'runtime/generated.toml'
            shell = '. "$1"; RUNTIME_DIR="$2"; '
            shell += 'TMP_CONFIG_TOML="$2/generated.toml"; gen_config' if SERVICE == 'frpc' else 'CONF_TOML="$2/generated.toml"; build_config'
            env = dict(os.environ, PATH=str(work) + ':' + os.environ['PATH'], FRP_TEST_DATA=json.dumps(config))
            p = subprocess.run(['bash', '-c', shell, 'test', str(APP / 'root/etc/init.d' / SERVICE), str(filename.parent)],
                               env=env, capture_output=True, text=True, timeout=15)
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
            return tomllib.loads(filename.read_text())

    def test_token_authentication_and_basic_listener(self):
        common = {'token': 'test-token', 'bind_port': '7001', 'server_port': '7001'}
        data = self.generate(common)
        self.assertEqual(data['auth'], {'method': 'token', 'token': 'test-token'})
        self.assertEqual(data['serverPort' if SERVICE == 'frpc' else 'bindPort'], 7001)

    def test_oidc_authentication(self):
        common = {'auth_method': 'oidc', 'oidc_audience': 'test-audience', 'oidc_issuer': 'https://example.invalid',
                  'oidc_client_id': 'test-client', 'oidc_client_secret': 'not-a-real-secret',
                  'oidc_token_endpoint_url': 'https://example.invalid/token'}
        data = self.generate(common)
        self.assertEqual(data['auth']['method'], 'oidc')
        self.assertEqual(data['auth']['oidc']['audience'], 'test-audience')

    @unittest.skipUnless(SERVICE == 'frpc', '客户端专用')
    def test_ui_boolean_values_remain_true_in_toml(self):
        data = self.generate({'tcp_mux': 'true', 'tls_enable': 'true', 'login_fail_exit': 'true', 'disable_log_color': 'true'})
        self.assertIs(data['transport']['tcpMux'], True)
        self.assertIs(data['transport']['tls']['enable'], True)
        self.assertIs(data['loginFailExit'], True)
        self.assertIs(data['log']['disablePrintColor'], True)

    @unittest.skipUnless(SERVICE == 'frpc', '客户端专用')
    def test_advanced_tls_and_quic_options_reach_toml(self):
        data = self.generate({'tls_cert_file': '/tmp/test-cert.pem', 'tls_key_file': '/tmp/test-key.pem',
            'tls_trusted_ca_file': '/tmp/test-ca.pem', 'tls_server_name': 'example.invalid',
            'tls_disable_custom_first_byte': 'true', 'quic_keepalive_period': '12',
            'quic_max_idle_timeout': '31', 'quic_max_incoming_streams': '19'})
        self.assertEqual(data['transport']['tls']['certFile'], '/tmp/test-cert.pem')
        self.assertEqual(data['transport']['tls']['keyFile'], '/tmp/test-key.pem')
        self.assertEqual(data['transport']['tls']['trustedCaFile'], '/tmp/test-ca.pem')
        self.assertEqual(data['transport']['tls']['serverName'], 'example.invalid')
        self.assertIs(data['transport']['tls']['disableCustomTLSFirstByte'], True)
        self.assertEqual(data['transport']['quic'], {'keepalivePeriod': 12, 'maxIdleTimeout': 31, 'maxIncomingStreams': 19})

    @unittest.skipUnless(SERVICE == 'frpc', '客户端专用')
    def test_proxy_boolean_values(self):
        data = self.generate(proxy={'name': 'test', 'type': 'tcp', 'local_ip': '127.0.0.1', 'local_port': '8080',
                                    'remote_port': '8081', 'use_encryption': 'true', 'use_compression': 'true'})
        proxy = data['proxies'][0]
        self.assertEqual(proxy['transport'], {'useEncryption': True, 'useCompression': True})

    @unittest.skipUnless(SERVICE == 'frpc', '客户端专用')
    def test_visitor_bind_options(self):
        data = self.generate(proxy={'name': 'visitor', 'type': 'stcp', 'role': 'visitor', 'server_name': 'test',
                                    'sk': 'test-secret', 'bind_addr': '127.0.0.1', 'bind_port': '8082'})
        visitor = data['visitors'][0]
        self.assertEqual(visitor['bindAddr'], '127.0.0.1')
        self.assertEqual(visitor['bindPort'], 8082)
        self.assertNotIn('proxies', data)

    @unittest.skipUnless(SERVICE == 'frps', '服务端专用')
    def test_allow_ports_list_preserves_ports_and_ranges(self):
        data = self.generate({'allow_ports': ['2000-2002', '8080']})
        self.assertEqual(data['allowPorts'], [{'start': 2000, 'end': 2002}, {'single': 8080}])

    @unittest.skipUnless(SERVICE == 'frps', '服务端专用')
    def test_log_color_matches_current_frp_toml(self):
        data = self.generate({'disable_log_color': 'true'})
        self.assertIs(data['log']['disablePrintColor'], True)
        self.assertNotIn('disableColor', data['log'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
