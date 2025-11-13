
// Lennox iComfort Node-RED node, clean and maintainable version
const fetch = require('node-fetch');
module.exports = function(RED) {
    function LennoxIcomfortNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.name = config.name;
        node.configNode = RED.nodes.getNode(config.config);
        node.command = config.command || 'systemInfo';
        node.polling = Number(config.polling) || 0;
        node.heatingSetpoint = config.heatingSetpoint;
        node.coolingSetpoint = config.coolingSetpoint;
        node.mode = config.mode;
        node.fanmode = config.fanmode;
        node.thermostatmode = config.thermostatmode;

        // Helper: get credentials and deviceId from config node
        function getCredentials() {
            if (!node.configNode) throw new Error('No config node selected');
            const { username, password, deviceId } = node.configNode;
            if (!username || !password) throw new Error('Missing credentials');
            return { username, password, deviceId };
        }

        // Helper: API auth header
        function getAuthHeader(username, password) {
            return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }

        // Helper: Build SetTStatInfo body
        function buildTStatBody(deviceId, opts = {}) {
            const modeMap = { off: 0, heat: 1, cool: 2, auto: 3, 'emergency heat': 4 };
            const fanMap = { auto: 0, on: 1, circulate: 2 };
            const body = {};
            if (opts.coolingSetpoint !== undefined && opts.coolingSetpoint !== null && opts.coolingSetpoint !== '') body.Cool_Set_Point = Number(opts.coolingSetpoint).toFixed(2);
            if (opts.heatingSetpoint !== undefined && opts.heatingSetpoint !== null && opts.heatingSetpoint !== '') body.Heat_Set_Point = Number(opts.heatingSetpoint).toFixed(2);
            if (opts.fanmode !== undefined && opts.fanmode !== null && opts.fanmode !== '') body.Fan_Mode = fanMap[opts.fanmode];
            if (opts.mode !== undefined && opts.mode !== null && opts.mode !== '') body.Operation_Mode = modeMap[opts.mode];
            body.Zone_Number = opts.zoneNumber || 0;
            body.GatewaySN = deviceId;
            body.Pref_Temp_Units = "0"; // must be string per API quirk
            return body;
        }

        // Helper: Build SetAwayModeNew body
        function buildAwayBody(deviceId, awayMode, zoneNumber = 0) {
            return {
                awayMode: awayMode,
                ZoneNumber: zoneNumber,
                TempScale: 0,
                GatewaySN: deviceId
            };
        }

        // Main command dispatcher
        async function dispatchCommand(command, params) {
            const { username, password, deviceId } = getCredentials();
            // Only allow systemInfo if deviceId is blank
            if (!deviceId && command !== 'systemInfo') throw new Error('DeviceId (Gateway SN) required for this command');
            const headers = { 'Authorization': getAuthHeader(username, password), 'Content-Type': 'application/json; charset=utf-8' };
            // Debug log
            node.warn(`[API DEBUG] Command: ${command}, DeviceId: ${deviceId}, Params: ${JSON.stringify(params)}`);

            if (command === 'setFanMode' || command === 'setSetpoints' || command === 'setThermostatMode' || command === 'heatLevelUp' || command === 'heatLevelDown' || command === 'coolLevelUp' || command === 'coolLevelDown') {
                // Always refresh first
                const refreshUrl = `https://services.myicomfort.com/DBAcessService.svc/GetTStatInfoList?GatewaySN=${encodeURIComponent(deviceId)}&TempUnit=0&Cancel_Away=-1`;
                const refreshRes = await fetch(refreshUrl, { method: 'GET', headers });
                if (!refreshRes.ok) { const body = await refreshRes.text(); throw new Error('Refresh before command failed: ' + body); }
                const refreshData = await refreshRes.json();
                const tStat = (refreshData.tStatInfo && refreshData.tStatInfo[0]) || {};
                // Build new payload by merging current state with new values
                let opts = {
                    heatingSetpoint: tStat.Heat_Set_Point,
                    coolingSetpoint: tStat.Cool_Set_Point,
                    fanmode: ['auto','on','circulate'][tStat.Fan_Mode],
                    mode: Object.keys({off:0,heat:1,cool:2,auto:3,'emergency heat':4}).find(k => ({off:0,heat:1,cool:2,auto:3,'emergency heat':4}[k] === tStat.Operation_Mode)),
                    zoneNumber: tStat.Zone_Number
                };
                // Override with new values for this command
                if (command === 'setFanMode') {
                    if (!params.fanmode) throw new Error('Missing fan mode');
                    opts.fanmode = params.fanmode;
                }
                if (command === 'setSetpoints') {
                    let heatingSetpoint = Number(params.heatingSetpoint);
                    let coolingSetpoint = Number(params.coolingSetpoint);
                    if (isNaN(heatingSetpoint) || isNaN(coolingSetpoint)) throw new Error('Both setpoints required');
                    if (coolingSetpoint - heatingSetpoint < 2) throw new Error('Cooling setpoint must be at least 2°F higher than heating setpoint');
                    opts.heatingSetpoint = heatingSetpoint;
                    opts.coolingSetpoint = coolingSetpoint;
                }
                if (command === 'setThermostatMode') {
                    const mode = params.thermostatmode || params.mode;
                    if (!mode) throw new Error('Missing mode');
                    opts.mode = mode;
                }
                if (command === 'heatLevelUp' || command === 'heatLevelDown') {
                    let heatingSetpoint = Number(opts.heatingSetpoint) || 70;
                    heatingSetpoint += (command === 'heatLevelUp' ? 1 : -1);
                    let coolingSetpoint = Number(opts.coolingSetpoint) || (heatingSetpoint + 2);
                    opts.heatingSetpoint = heatingSetpoint;
                    opts.coolingSetpoint = coolingSetpoint;
                }
                if (command === 'coolLevelUp' || command === 'coolLevelDown') {
                    let coolingSetpoint = Number(opts.coolingSetpoint) || 75;
                    coolingSetpoint += (command === 'coolLevelUp' ? 1 : -1);
                    let heatingSetpoint = Number(opts.heatingSetpoint) || (coolingSetpoint - 2);
                    opts.coolingSetpoint = coolingSetpoint;
                    opts.heatingSetpoint = heatingSetpoint;
                }
                const body = buildTStatBody(deviceId, opts);
                const url = 'https://services.myicomfort.com/DBAcessService.svc/SetTStatInfo';
                node.warn(`[API DEBUG] ${command} URL: ${url}, Body: ${JSON.stringify(body)}`);
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error(`${command} failed: ` + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }

            if (command === 'systemInfo') {
                const url = `https://services.myicomfort.com/DBAcessService.svc/GetSystemsInfo?userID=${encodeURIComponent(username)}`;
                const res = await fetch(url, { method: 'GET', headers });
                let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('System info failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'refresh') {
                const url = `https://services.myicomfort.com/DBAcessService.svc/GetTStatInfoList?GatewaySN=${encodeURIComponent(deviceId)}&TempUnit=0&Cancel_Away=-1`;
                const res = await fetch(url, { method: 'GET', headers });
                let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Refresh failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'setSetpoints') {
                let { heatingSetpoint, coolingSetpoint } = params;
                heatingSetpoint = Number(heatingSetpoint);
                coolingSetpoint = Number(coolingSetpoint);
                if (isNaN(heatingSetpoint) || isNaN(coolingSetpoint)) throw new Error('Both setpoints required');
                if (coolingSetpoint - heatingSetpoint < 2) throw new Error('Cooling setpoint must be at least 2°F higher than heating setpoint');
                const body = buildTStatBody(deviceId, { heatingSetpoint, coolingSetpoint });
                const url = 'https://services.myicomfort.com/DBAcessService.svc/SetTStatInfo';
                node.warn(`[API DEBUG] setSetpoints URL: ${url}, Body: ${JSON.stringify(body)}`);
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Setpoint failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'setThermostatMode') {
                const mode = params.thermostatmode || params.mode;
                if (!mode) throw new Error('Missing mode');
                const body = buildTStatBody(deviceId, { mode });
                const url = 'https://services.myicomfort.com/DBAcessService.svc/SetTStatInfo';
                node.warn(`[API DEBUG] setThermostatMode URL: ${url}, Body: ${JSON.stringify(body)}`);
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Set mode failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'heatLevelUp' || command === 'heatLevelDown') {
                let heatingSetpoint = Number(params.heatingSetpoint) || 70;
                heatingSetpoint += (command === 'heatLevelUp' ? 1 : -1);
                let coolingSetpoint = Number(params.coolingSetpoint) || (heatingSetpoint + 2);
                const body = buildTStatBody(deviceId, { heatingSetpoint, coolingSetpoint });
                const url = 'https://services.myicomfort.com/DBAcessService.svc/SetTStatInfo';
                node.warn(`[API DEBUG] heatLevelUp/Down URL: ${url}, Body: ${JSON.stringify(body)}`);
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Heat level change failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'coolLevelUp' || command === 'coolLevelDown') {
                let coolingSetpoint = Number(params.coolingSetpoint) || 75;
                coolingSetpoint += (command === 'coolLevelUp' ? 1 : -1);
                let heatingSetpoint = Number(params.heatingSetpoint) || (coolingSetpoint - 2);
                const body = buildTStatBody(deviceId, { coolingSetpoint, heatingSetpoint });
                const url = 'https://services.myicomfort.com/DBAcessService.svc/SetTStatInfo';
                node.warn(`[API DEBUG] coolLevelUp/Down URL: ${url}, Body: ${JSON.stringify(body)}`);
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Cool level change failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'away' || command === 'present') {
                const awayMode = command === 'away' ? '1' : '0';
                // All params in query string, empty body
                const url = `https://services.myicomfort.com/DBAcessService.svc/SetAwayModeNew?gatewaysn=${encodeURIComponent(deviceId)}&zonenumber=0&awaymode=${awayMode}`;
                node.warn(`[API DEBUG] away/present URL: ${url}, Body: (empty)`);
                const res = await fetch(url, { method: 'PUT', headers, body: '' });
                let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Set away/present failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            throw new Error('Unsupported command: ' + command);
        }

        // Polling timer: only for refresh command
        if (node.command === 'refresh' && node.polling > 0) {
            node._interval = setInterval(() => {
                node.emit('input', { payload: { command: node.command } });
            }, node.polling * 1000);
        }

        node.on('input', async function(msg, send, done) {
            const command = msg.command || node.command;
            // Merge setpoints and other params
            const params = Object.assign({
                heatingSetpoint: msg.heatingSetpoint || node.heatingSetpoint,
                coolingSetpoint: msg.coolingSetpoint || node.coolingSetpoint,
                mode: msg.mode || node.mode,
                fanmode: msg.fanmode || node.fanmode,
                thermostatmode: msg.thermostatmode || node.thermostatmode
            }, msg.params || {});
            try {
                const result = await dispatchCommand(command, params);
                msg.payload = result.data;
                msg._icomfort_debug = result.debug;
                send(msg);
                if (done) done();
            } catch (err) {
                node.error(err.message, msg);
                msg._icomfort_error = err.message;
                send(msg);
                if (done) done(err);
            }
        });

        node.on('close', function() {
            if (node._interval) clearInterval(node._interval);
        });
    }
    RED.nodes.registerType('lennox-icomfort', LennoxIcomfortNode);
};
