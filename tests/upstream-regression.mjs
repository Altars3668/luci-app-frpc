#!/usr/bin/env node
// 仅测试 LuCI 表单的纯逻辑；不连接 ubus、不启动服务。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = path.basename(appRoot).endsWith('frps') ? 'frps' : 'frpc';
const filename = process.argv[2] || path.join(appRoot, 'htdocs/luci-static/resources/view', `${service}.js`);
const actualService = path.basename(filename, '.js');
const raw = fs.readFileSync(filename, 'utf8');

function load(serviceResult = {}) {
    const maps = [];
    class Option {
        constructor(section, option) {
            this.section = section;
            this.map = section.map;
            this.option = option;
            this.deps = [];
            this.subsection = new Section(this.map, 'subsection');
            this.remove = async function() { this.removed = true; };
        }
        value() {}
        depends(...args) { this.deps.push(args.length === 1 ? args[0] : { [args[0]]: args[1] }); }
        super() { return '0'; }
    }
    class Section {
        constructor(map, type) { this.map = map; this.type = type; this.children = []; }
        option(_type, name) { const o = new Option(this, name); this.children.push(o); return o; }
        taboption(_tab, ...args) { return this.option(...args); }
        tab() {}
        getOption(name) { return this.children.find(o => o.option === name); }
    }
    class Map {
        constructor(config) {
            this.config = config;
            this.children = [];
            this.data = { get() {}, set() {}, unset: async () => {} };
            maps.push(this);
        }
        section(type) { const s = new Section(this, type); this.children.push(s); return s; }
        render() { return Promise.resolve(this); }
    }
    const form = { Map, NamedSection: 'named', TypedSection: 'typed', SectionValue: 'section', GridSection: 'grid',
        Value: 'value', Flag: 'flag', ListValue: 'list', DynamicList: 'dynamic', DummyValue: 'dummy' };
    const ctx = vm.createContext({ Promise, console, form, widgets: {}, fs: {}, ui: {},
        _: value => value, E() {}, document: { getElementById() {} },
        L: { resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback),
             bind: (fn, self) => fn.bind(self), Poll: { add() {} } },
        rpc: { declare: () => () => Promise.resolve(serviceResult) },
        view: { extend: value => value } });
    vm.runInContext("String.prototype.format = function() { return String(this); }; String.format = function(s) { return s; };", ctx);
    const helpers = ['setParams', 'defTabOpts', 'defOpts', 'getServiceStatus', 'guardUciDeleteNotFound', 'removeIfPresent'];
    const code = `(function(){ ${raw.replace('return view.extend(', 'const testedView = view.extend(')}\nreturn { testedView, ${helpers.map(k => `${k}: typeof ${k} === 'function' ? ${k} : null`).join(',')} }; })()`;
    return { ...vm.runInContext(code, ctx), form, maps, Section, Option };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('依赖条件按 AND 的笛卡尔积合并，而不是覆盖或追加 OR', () => {
    const { setParams } = load();
    const option = { deps: [{ role: 'server' }, { role: 'visitor' }], depends(value) { this.deps.push(value); } };
    setParams(option, { depends: [{ type: 'tcp' }, { type: 'udp' }] });
    assert.deepEqual(plain(option.deps), [
        { role: 'server', type: 'tcp' }, { role: 'server', type: 'udp' },
        { role: 'visitor', type: 'tcp' }, { role: 'visitor', type: 'udp' }]);
});

test('选项自身的 optional=false 优先于整个标签页的 optional=true', () => {
    const { defTabOpts, form, Section } = load();
    const s = new Section({ config: actualService, data: { get() {} } }, 'test');
    defTabOpts(s, 'test', [[form.Flag, 'flag', 'Flag', null, { optional: false }]], { optional: true });
    assert.equal(s.children[0].optional, false);
});

test('删除未存在的 UCI 字段是幂等操作', async () => {
    const { defOpts, form, Section } = load();
    const s = new Section({ config: actualService, data: { get() {} } }, 'test');
    defOpts(s, [[form.Value, 'absent', 'Absent']]);
    await s.children[0].remove('common');
    assert.equal(s.children[0].removed, undefined);
});

test('同一 UCI 字段仍有活跃别名时，隐藏选项不能将其删除', async () => {
    const { removeIfPresent } = load();
    assert.equal(typeof removeIfPresent, 'function');
    let removed = 0;
    const map = { config: actualService, data: { get: () => 'present', unset: async () => { removed++; } } };
    const section = { map, children: [] };
    const inactive = { map, section, option: 'alias' };
    const active = { map, section, ucioption: 'alias', isActive: () => true };
    section.children.push(inactive, active);
    await removeIfPresent.call(inactive, 'common');
    assert.equal(removed, 0);
});

test('批量删除遇到缺失字段时，逐项重试其余实际存在的字段', async () => {
    const { guardUciDeleteNotFound } = load();
    assert.equal(typeof guardUciDeleteNotFound, 'function');
    const calls = [];
    const data = { async callDelete(config, sid, options) {
        calls.push(options);
        if (options.length > 1 || options[0] === 'absent') throw new Error('RPC call to uci/delete failed with ubus code 4');
        return null;
    } };
    guardUciDeleteNotFound(data, actualService);
    await data.callDelete(actualService, 'common', ['absent', 'present']);
    assert.deepEqual(plain(calls), [['absent', 'present'], ['absent'], ['present']]);
});

test('权限或其他 RPC 错误不得被缺失字段兼容逻辑吞掉', async () => {
    const { guardUciDeleteNotFound } = load();
    assert.equal(typeof guardUciDeleteNotFound, 'function');
    const data = { callDelete: async () => { throw new Error('Permission denied'); } };
    guardUciDeleteNotFound(data, actualService);
    await assert.rejects(data.callDelete(actualService, 'common', ['present']), /Permission denied/);
});

test('其他 UCI 配置的删除错误不能被本应用的兼容层吞掉', async () => {
    const { guardUciDeleteNotFound } = load();
    assert.equal(typeof guardUciDeleteNotFound, 'function');
    const data = { callDelete: async () => { throw new Error('RPC uci/delete ubus code 4'); } };
    guardUciDeleteNotFound(data, actualService);
    await assert.rejects(data.callDelete('unrelated', 'common', ['absent']), /code 4/);
});

test('状态检测覆盖任意 procd 实例名，不只 instance1', async () => {
    const { getServiceStatus } = load({ [actualService]: { instances: { renamed: { running: true } } } });
    assert.equal(await getServiceStatus(), true);
});

test('没有运行实例时显示停止', async () => {
    assert.equal(await load({}).getServiceStatus(), false);
});

for (const creator of ['defTabOpts', 'defOpts']) {
    test(`${creator} 将关闭的开关写为 disabled，不能删掉后恢复后端默认值`, async () => {
        const api = load();
        const s = new api.Section({ config: actualService, data: { get: () => '1', unset: async () => {} } }, 'test');
        const options = [[api.form.Flag, 'flag', 'Flag']];
        if (creator === 'defTabOpts') api[creator](s, 'test', options);
        else api[creator](s, options);
        const option = s.children[0];
        option.disabled = '0';
        option.write = async (_sid, value) => { option.written = value; };
        await option.remove('init');
        assert.equal(option.written, '0');
        assert.equal(option.rmempty, false);
        assert.equal(option.retain, true);
    });
}

if (actualService === 'frpc') {
    test('代理列表与编辑器对同一字段只注册一个可写选项', async () => {
        const { testedView, maps, form } = load();
        await testedView.render();
        const grid = maps[0].children.find(s => s.type === form.GridSection);
        for (const name of ['name', 'type', 'local_ip', 'local_port', 'remote_port'])
            assert.equal(grid.children.filter(o => o.option === name).length, 1, name);
    });
}
