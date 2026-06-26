// ============================================================
// McpModule — MCP 客户端 (Model Context Protocol)
// HTTP + SSE 通信，JSON-RPC 2.0 协议
// ============================================================
const McpModule = (() => {
  const STORAGE_KEY = 'mcp-servers';
  let _servers = [];  // { id, name, url, sessionId, tools:[], connected:bool }

  // ── 持久化 ──
  async function _load() {
    try {
      if (typeof DB !== 'undefined' && DB.settings) {
        _servers = await DB.settings.get(STORAGE_KEY) || [];
      }
    } catch(e) { _servers = []; }
    // 重置连接状态
    _servers.forEach(function(s) { s.connected = false; });
  }

  async function _save() {
    try {
      if (typeof DB !== 'undefined' && DB.settings) {
        var clean = _servers.map(function(s) {
          return { id: s.id, name: s.name, url: s.url, sessionId: s.sessionId, tools: s.tools };
        });
        await DB.settings.set(STORAGE_KEY, clean);
      }
    } catch(e) { console.warn('[MCP] save fail', e); }
  }

  // ── JSON-RPC 调用 (支持 SSE 流式响应) ──
  async function _rpc(server, method, params) {
    var body = JSON.stringify({ jsonrpc: '2.0', method: method, params: params || {}, id: Date.now() });
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (server.sessionId) headers['Mcp-Session-Id'] = server.sessionId;

    try {
      var res = await fetch(server.url, { method: 'POST', headers: headers, body: body });

      // 检查 session ID
      var sid = res.headers.get('Mcp-Session-Id');
      if (sid) server.sessionId = sid;

      var ct = res.headers.get('Content-Type') || '';

      if (ct.includes('text/event-stream')) {
        // SSE 流式响应 — 读取所有事件
        var text = await res.text();
        return _parseSSE(text);
      } else {
        // 普通 JSON 响应
        var json = await res.json();
        if (json.error) throw new Error('[MCP] ' + (json.error.message || JSON.stringify(json.error)));
        return json.result;
      }
    } catch(e) {
      if (e.message && e.message.startsWith('[MCP]')) throw e;
      console.warn('[MCP] RPC 失败:', method, e.message);
      throw e;
    }
  }

  // ── SSE 解析 ──
  function _parseSSE(text) {
    var lines = text.split('\n');
    var result = null;
    var dataLines = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      } else if (line === '' && dataLines.length > 0) {
        // 事件结束
        var data = dataLines.join('\n');
        dataLines = [];
        try {
          var parsed = JSON.parse(data);
          if (parsed.result !== undefined) result = parsed.result;
          if (parsed.error) throw new Error('[MCP] ' + (parsed.error.message || JSON.stringify(parsed.error)));
        } catch(e) {
          if (e.message && e.message.startsWith('[MCP]')) throw e;
          // 非 JSON data，可能是进度消息，忽略
        }
      }
    }
    // 最后的 data
    if (dataLines.length > 0) {
      try {
        var p = JSON.parse(dataLines.join('\n'));
        if (p.result !== undefined) result = p.result;
      } catch(e) {}
    }
    return result;
  }

  // ── API ──

  /** 添加 MCP Server */
  async function addServer(name, url) {
    // 去重
    var existing = _servers.find(function(s) { return s.url === url; });
    if (existing) {
      if (typeof Toast !== 'undefined') Toast.show('该 Server 已存在');
      return null;
    }
    var server = {
      id: 'mcp_' + Date.now().toString(36),
      name: name,
      url: url.replace(/\/$/, ''),
      sessionId: null,
      tools: [],
      connected: false
    };
    try {
      // 初始化连接
      var initResult = await _rpc(server, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Aura', version: '1.0' }
      });
      server.connected = true;
      console.log('[MCP] 已连接:', name, initResult);

      // 获取工具列表
      var toolsResult = await _rpc(server, 'tools/list', {});
      server.tools = (toolsResult && toolsResult.tools) ? toolsResult.tools : [];
      console.log('[MCP] 工具数:', server.tools.length);
    } catch(e) {
      server.connected = false;
      console.warn('[MCP] 连接失败:', name, e.message);
      if (typeof Toast !== 'undefined') Toast.show('MCP 连接失败: ' + e.message);
    }
    _servers.push(server);
    await _save();
    return server;
  }

  /** 删除 MCP Server */
  async function removeServer(serverId) {
    _servers = _servers.filter(function(s) { return s.id !== serverId; });
    await _save();
  }

  /** 调用工具 */
  async function callTool(serverId, toolName, args) {
    var server = _servers.find(function(s) { return s.id === serverId; });
    if (!server) throw new Error('MCP Server not found: ' + serverId);
    return await _rpc(server, 'tools/call', { name: toolName, arguments: args || {} });
  }

  /** 自动选择服务器调用工具 (遍历所有服务器找工具) */
  async function callToolAny(toolName, args) {
    for (var i = 0; i < _servers.length; i++) {
      var s = _servers[i];
      if (!s.connected) continue;
      var tool = s.tools.find(function(t) { return t.name === toolName; });
      if (tool) return await callTool(s.id, toolName, args);
    }
    throw new Error('未找到工具: ' + toolName + ' (可用服务器: ' + _servers.filter(function(s){return s.connected;}).length + ')');
  }

  /** 获取所有可用工具 (用于 AI prompt) */
  function getAllTools() {
    var all = [];
    _servers.forEach(function(s) {
      if (!s.connected) return;
      s.tools.forEach(function(t) {
        all.push({ serverId: s.id, serverName: s.name, name: t.name, description: t.description || '', inputSchema: t.inputSchema || {} });
      });
    });
    return all;
  }

  /** 生成 AI prompt 格式的工具说明 */
  function getToolsForPrompt() {
    var tools = getAllTools();
    if (!tools.length) return '';
    var lines = ['# MCP 外部工具 (Real Tools)\n你可以调用以下真实的外部工具来获取信息或执行操作。\n'];
    lines.push('格式: 在你的回复中，需要调用工具时，用 ||| 分隔出一个独立气泡，内容为:\n[TOOL:工具名:JSON参数]\n');
    lines.push('示例: 让我帮你查一下。 ||| [TOOL:web_search:{"query":"北京今天天气"}]\n');
    lines.push('【重要】工具调用结果会自动注入对话，你收到结果后继续回复即可。\n');
    lines.push('## 可用工具列表:\n');
    tools.forEach(function(t) {
      var args = t.inputSchema && t.inputSchema.properties
        ? Object.keys(t.inputSchema.properties).join(', ')
        : '无参数';
      lines.push('- **' + t.name + '** (' + t.serverName + ')：' + (t.description || '无描述') + '\n  参数: ' + args);
    });
    return lines.join('');
  }

  /** 列出所有 Server */
  function listServers() { return _servers.slice(); }

  /** 重连所有 Server */
  async function reconnectAll() {
    var servers = _servers.slice();
    _servers = [];
    for (var i = 0; i < servers.length; i++) {
      await addServer(servers[i].name, servers[i].url);
    }
  }

  // ── 初始化 ──
  _load();

  return { addServer, removeServer, callTool, callToolAny, getAllTools, getToolsForPrompt, listServers, reconnectAll, _load };
})();

window.McpModule = McpModule;
console.log('✅ [MCP] MCP 模块已载入');
