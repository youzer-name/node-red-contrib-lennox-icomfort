// Lennox iComfort Thermostat Node-RED node (refresh/polling, no command UI)
const fetch = require('node-fetch');
module.exports = function(RED) {
    function LennoxIcomfortThermostatNode(config) {
        RED.nodes.createNode(this, config);
    const node = this;
    node.name = config.name;
    node.configNode = RED.nodes.getNode(config.config);
    node.polling = Number(config.polling) || 0;
    node.createGlobal = config.createGlobal || false;
        // Helper: get credentials and deviceId from config node
        function getCredentials() {
            if (!node.configNode) throw new Error('No config node selected');
            const { username, password, deviceId } = node.configNode;
            if (!username || !password) throw new Error('Missing credentials');
            return { username, password, deviceId };
        }
        function getAuthHeader(username, password) {
            return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }
        async function refreshThermostat() {
            const { username, password, deviceId } = getCredentials();
            if (!deviceId) throw new Error('DeviceId (Gateway SN) required');
            const headers = { 'Authorization': getAuthHeader(username, password), 'Content-Type': 'application/json; charset=utf-8' };
            const url = `https://services.myicomfort.com/DBAcessService.svc/GetTStatInfoList?GatewaySN=${encodeURIComponent(deviceId)}&TempUnit=0&Cancel_Away=-1`;
            const res = await fetch(url, { method: 'GET', headers });
            let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
            if (!res.ok) { debug.body = await res.text(); throw new Error('Refresh failed: ' + JSON.stringify(debug)); }
            const data = await res.json();
            if (data.ReturnStatus && data.ReturnStatus !== 'SUCCESS') throw new Error('API error: ' + JSON.stringify(data));
            // Helper to format local human-readable datetime
            function formatLocalDateTimeFromUTC(utcTs) {
                if (!utcTs) return undefined;
                const d = new Date(utcTs);
                if (isNaN(d.getTime())) return undefined;
                // Use toLocaleString for local time representation
                return d.toLocaleString();
            }

            // Set global variable if enabled, and add DateTime (UTC timestamp) and DateTime_Local (human-readable local time)
            if (node.createGlobal && data.tStatInfo && data.tStatInfo[0]) {
                const globalName = `Lennox_${node.configNode && node.configNode.deviceId ? node.configNode.deviceId : 'unknown'}_status`;
                const tStat = { ...data.tStatInfo[0] };
                tStat.DateTime = undefined;
                tStat.DateTime_Local = undefined;
                if (typeof tStat.DateTime_Mark === 'string') {
                    // Extract timestamp from /Date(1761941606430+0000)/
                    const match = tStat.DateTime_Mark.match(/\/Date\((\d+)/);
                    if (match) {
                        let timestamp = parseInt(match[1], 10); // local time in ms
                        let offset = 0;
                        if (typeof tStat.GMT_To_Local === 'number') {
                            offset = tStat.GMT_To_Local;
                        } else if (typeof tStat.GMT_To_Local === 'string' && /^-?\d+$/.test(tStat.GMT_To_Local)) {
                            offset = parseInt(tStat.GMT_To_Local, 10);
                        }
                        // Convert offset from seconds to ms
                        offset = offset * 1000;
                        tStat.DateTime = timestamp - offset; // UTC
                        tStat.DateTime_Local = formatLocalDateTimeFromUTC(tStat.DateTime); // true local time
                    }
                }
                node.context().global.set(globalName, tStat);
            }
            // Also add DateTime (UTC) and DateTime_Local (human-readable local) to node output (all tStatInfo entries)
            if (data.tStatInfo && Array.isArray(data.tStatInfo)) {
                data.tStatInfo = data.tStatInfo.map(tStat => {
                    const t = { ...tStat };
                    t.DateTime = undefined;
                    t.DateTime_Local = undefined;
                    if (typeof t.DateTime_Mark === 'string') {
                        const match = t.DateTime_Mark.match(/\/Date\((\d+)/);
                        if (match) {
                            let timestamp = parseInt(match[1], 10); // local time in ms
                            let offset = 0;
                            if (typeof t.GMT_To_Local === 'number') {
                                offset = t.GMT_To_Local;
                            } else if (typeof t.GMT_To_Local === 'string' && /^-?\d+$/.test(t.GMT_To_Local)) {
                                offset = parseInt(t.GMT_To_Local, 10);
                            }
                            // Convert offset from seconds to ms
                            offset = offset * 1000;
                            t.DateTime = timestamp - offset; // UTC
                            t.DateTime_Local = formatLocalDateTimeFromUTC(t.DateTime); // true local time
                        }
                    }
                    return t;
                });
            }
            return { data, debug };
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

        // Main command dispatcher (matches original logic)
        async function dispatchCommand(command, params) {
            const { username, password, deviceId } = getCredentials();
            if (!deviceId && command !== 'systemInfo') throw new Error('DeviceId (Gateway SN) required for this command');
            const headers = { 'Authorization': getAuthHeader(username, password), 'Content-Type': 'application/json; charset=utf-8' };
            if (command === 'setFanMode' || command === 'setSetpoints' || command === 'setThermostatMode' || command === 'heatLevelUp' || command === 'heatLevelDown' || command === 'coolLevelUp' || command === 'coolLevelDown') {
                // Always refresh first
                const refreshUrl = `https://services.myicomfort.com/DBAcessService.svc/GetTStatInfoList?GatewaySN=${encodeURIComponent(deviceId)}&TempUnit=0&Cancel_Away=-1`;
                const refreshRes = await fetch(refreshUrl, { method: 'GET', headers });
                if (!refreshRes.ok) { const body = await refreshRes.text(); throw new Error('Refresh before command failed: ' + body); }
                const refreshData = await refreshRes.json();
                const tStat = (refreshData.tStatInfo && refreshData.tStatInfo[0]) || {};
                let opts = {
                    heatingSetpoint: tStat.Heat_Set_Point,
                    coolingSetpoint: tStat.Cool_Set_Point,
                    fanmode: ['auto','on','circulate'][tStat.Fan_Mode],
                    mode: Object.keys({off:0,heat:1,cool:2,auto:3,'emergency heat':4}).find(k => ({off:0,heat:1,cool:2,auto:3,'emergency heat':4}[k] === tStat.Operation_Mode)),
                    zoneNumber: tStat.Zone_Number
                };
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
                const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                let debug = { request: { url, body, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error(`${command} failed: ` + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            if (command === 'away' || command === 'home') {
                const awayMode = command === 'away' ? '1' : '0';
                const url = `https://services.myicomfort.com/DBAcessService.svc/SetAwayModeNew?gatewaysn=${encodeURIComponent(deviceId)}&zonenumber=0&awaymode=${awayMode}`;
                const res = await fetch(url, { method: 'PUT', headers, body: '' });
                let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
                if (!res.ok) { debug.body = await res.text(); throw new Error('Set away/home failed: ' + JSON.stringify(debug)); }
                const data = await res.json();
                return { data, debug };
            }
            throw new Error('Unsupported command: ' + command);
        }
        async function getSystemInfo() {
            const { username, password } = getCredentials();
            const headers = { 'Authorization': getAuthHeader(username, password), 'Content-Type': 'application/json; charset=utf-8' };
            const url = `https://services.myicomfort.com/DBAcessService.svc/GetSystemsInfo?userID=${encodeURIComponent(username)}`;
            const res = await fetch(url, { method: 'GET', headers });
            let debug = { request: { url, headers: { ...headers, Authorization: 'Basic [redacted]' } }, status: res.status, statusText: res.statusText };
            if (!res.ok) { debug.body = await res.text(); throw new Error('System info failed: ' + JSON.stringify(debug)); }
            const data = await res.json();
            return { data, debug };
        }
        // Polling timer
        if (node.polling > 0) {
            node._interval = setInterval(() => {
                node.emit('input', { payload: { command: 'refresh' } });
            }, node.polling * 1000);
        }
        node.on('input', async function(msg, send, done) {
            try {
                const command = msg.command;
                // Merge setpoints and other params
                const params = Object.assign({
                    heatingSetpoint: msg.heatingSetpoint,
                    coolingSetpoint: msg.coolingSetpoint,
                    mode: msg.mode,
                    fanmode: msg.fanmode,
                    thermostatmode: msg.thermostatmode
                }, msg.params || {});
                if (command === 'refresh' || !command) {
                    const result = await refreshThermostat();
                    msg.payload = result.data;
                    msg._icomfort_debug = result.debug;
                    send(msg);
                    if (done) done();
                } else if (command === 'systemInfo' || command === 'getSystemInfo') {
                    const result = await getSystemInfo();
                    msg.payload = result.data;
                    msg._icomfort_debug = result.debug;
                    send(msg);
                    if (done) done();
                } else if ([
                    'setFanMode','setSetpoints','setThermostatMode','away','home',
                    'heatLevelUp','heatLevelDown','coolLevelUp','coolLevelDown'
                ].includes(command)) {
                    const result = await dispatchCommand(command, params);
                    msg.payload = result.data;
                    msg._icomfort_debug = result.debug;
                    send(msg);
                    if (done) done();
                } else {
                    // Pass through any other command to downstream nodes
                    send(msg);
                    if (done) done();
                }
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
    RED.nodes.registerType('lennox-icomfort-thermostat', LennoxIcomfortThermostatNode);

};
